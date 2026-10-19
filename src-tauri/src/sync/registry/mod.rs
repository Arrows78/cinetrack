//! The one description of every synced entity type.
//!
//! What used to be five parallel `match entity_type` lists in `service.rs`
//! (the accepted types, the delete statement, the upsert statement, the
//! business-key lookup and the title lookup) plus the bootstrap's table list
//! is derived from [`ENTITY_REGISTRY`]. Adding a synced entity means adding
//! one entry here; the tests at the bottom fail when the registry drifts from
//! `database::PROFILE_SCOPED_TABLES` or from the payloads the capture
//! triggers write.

use crate::models::MediaType;

/// How a synced row is tied to a profile.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Scope {
    /// A direct `profile_id` column.
    Profile,
    /// No `profile_id` of its own: scoped through `custom_list_items.list_id`
    /// -> `custom_lists.profile_id`.
    ParentList,
    /// No profile at all (`preferences`: one global key/value table, keyed
    /// by `key`, never by a generated uuid).
    Account,
}

/// How the first bootstrap turns pre-sync rows into an outbox snapshot.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Seed {
    /// A no-op `UPDATE ... SET uuid = uuid` fires the capture trigger.
    NoopUpdate,
    /// The same no-op update, restricted through the parent list.
    ChildOfList,
    /// No update capture exists: the bootstrap inserts into the outbox
    /// directly, with the trigger's payload shape.
    DirectInsert,
    /// Written to the outbox by the preferences layer (see `bootstrap.rs`).
    Preferences,
}

/// Where the (movie or series) title a change is about can be found, so its
/// library status can be reconsidered once a pulled batch is applied.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum TitleRef {
    None,
    /// `media_id` + `media_type` columns (`mediaId` + `mediaType` in the payload).
    Media,
    /// A movie id column (`movie_id` / `movieId`).
    Movie,
    /// A series id column (`series_id` / `seriesId`).
    Series,
}

impl TitleRef {
    /// SQL selecting `(id, media_type)` of the title a stored row is about.
    pub(super) fn select_sql(self, table: &str) -> Option<String> {
        let columns = match self {
            Self::None => return None,
            Self::Media => "media_id, media_type",
            Self::Movie => "movie_id, 'movie'",
            Self::Series => "series_id, 'series'",
        };
        Some(format!(
            "SELECT {columns} FROM {table} WHERE profile_id=?1 AND uuid=?2"
        ))
    }

    /// The title a remote payload is about.
    pub(super) fn title_in_payload(self, data: &serde_json::Value) -> Option<(i64, MediaType)> {
        let id_of = |key: &str| data.get(key).and_then(serde_json::Value::as_i64);
        match self {
            Self::None => None,
            Self::Media => id_of("mediaId").zip(
                data.get("mediaType")
                    .and_then(serde_json::Value::as_str)
                    .and_then(media_type_of),
            ),
            Self::Movie => id_of("movieId").map(|id| (id, MediaType::Movie)),
            Self::Series => id_of("seriesId").map(|id| (id, MediaType::Series)),
        }
    }
}

pub(super) fn media_type_of(value: &str) -> Option<MediaType> {
    match value {
        "movie" => Some(MediaType::Movie),
        "series" => Some(MediaType::Series),
        _ => None,
    }
}

pub(super) struct EntityDescriptor {
    pub entity_type: &'static str,
    pub table: &'static str,
    pub scope: Scope,
    /// (column, JSON field) pairs of the UNIQUE business key a row can also be
    /// found by under a different uuid; empty when uuid is the only identity.
    pub business_key: &'static [(&'static str, &'static str)],
    pub seed: Seed,
    pub title: TitleRef,
    /// The type-specific `INSERT ... ON CONFLICT` of one remote upsert, bound
    /// as `(?1 payload, ?2 profile_id)` (only `?1` for [`Scope::Account`]).
    pub upsert_sql: &'static str,
}

impl EntityDescriptor {
    /// The `DELETE` of one row by uuid, bound as `(?1 profile_id, ?2 uuid)`.
    /// The uuid-keyed statements only touch a row of this same profile: a
    /// remote document must never overwrite or delete another profile's row.
    pub(super) fn delete_sql(&self) -> Option<String> {
        match self.scope {
            Scope::Profile => Some(format!(
                "DELETE FROM {} WHERE profile_id=?1 AND uuid=?2",
                self.table
            )),
            Scope::ParentList => Some(format!(
                "DELETE FROM {} WHERE uuid=?2 AND list_id IN (SELECT uuid FROM custom_lists WHERE profile_id=?1)",
                self.table
            )),
            Scope::Account => None,
        }
    }

    /// Extra filter so a row only counts when it belongs to the active
    /// profile (bound as `?2`), for the business-key lookup (alias `t`).
    pub(super) fn scope_sql(&self) -> &'static str {
        match self.scope {
            Scope::ParentList => {
                "t.list_id IN (SELECT uuid FROM custom_lists WHERE profile_id = ?2)"
            }
            Scope::Profile | Scope::Account => "t.profile_id = ?2",
        }
    }
}

const MEDIA: &[(&str, &str)] = &[("media_id", "mediaId"), ("media_type", "mediaType")];

// library_item/seen_movie/episode_progress/tracked_series (and the other
// business-keyed types) each have a UNIQUE business-key constraint alongside
// their uuid primary key (see 001-initial-schema.sql). The conflict target of
// their upsert is deliberately that business key, not uuid: two devices that
// each added the same title before ever syncing generate two different local
// uuids for it, and a remote change for "the other device's uuid" must land
// on this device's own existing row for the same (profile, media) pair
// instead of attempting a second INSERT — which would violate the UNIQUE
// constraint and abort the whole apply_remote_changes transaction.
// Deliberately never assigns `uuid` in the DO UPDATE SET list, so the
// pre-existing local row keeps its own identity; the two devices end up
// agreeing on field values without agreeing on a single canonical uuid for
// this entity server-side. Revisit only if that residual per-device uuid
// split turns out to matter in practice.
//
// Order matters: it is the order the bootstrap seeds the outbox in.
pub(super) const ENTITY_REGISTRY: &[EntityDescriptor] = &[
    EntityDescriptor {
        entity_type: "library_item",
        table: "library_items",
        scope: Scope::Profile,
        business_key: MEDIA,
        seed: Seed::NoopUpdate,
        title: TitleRef::Media,
        upsert_sql: r#"INSERT INTO library_items(uuid,profile_id,media_id,media_type,title,poster_path,backdrop_path,year,rating,genres,status,favourite,user_rating,notes,tags,started_at,completed_at,rewatch_count,created_at,updated_at,status_origin)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.mediaId'),json_extract(?1,'$.mediaType'),json_extract(?1,'$.title'),json_extract(?1,'$.posterPath'),json_extract(?1,'$.backdropPath'),json_extract(?1,'$.year'),json_extract(?1,'$.rating'),coalesce(json_extract(?1,'$.genres'),'[]'),json_extract(?1,'$.status'),coalesce(json_extract(?1,'$.favourite'),0),json_extract(?1,'$.userRating'),json_extract(?1,'$.notes'),coalesce(json_extract(?1,'$.tags'),'[]'),json_extract(?1,'$.startedAt'),json_extract(?1,'$.completedAt'),coalesce(json_extract(?1,'$.rewatchCount'),0),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'),coalesce(json_extract(?1,'$.statusOrigin'),'manual'))
          ON CONFLICT(profile_id,media_id,media_type) DO UPDATE SET title=excluded.title,poster_path=excluded.poster_path,backdrop_path=excluded.backdrop_path,year=excluded.year,rating=excluded.rating,genres=excluded.genres,status=excluded.status,favourite=excluded.favourite,user_rating=excluded.user_rating,notes=excluded.notes,tags=excluded.tags,started_at=excluded.started_at,completed_at=excluded.completed_at,rewatch_count=excluded.rewatch_count,updated_at=excluded.updated_at,status_origin=coalesce(json_extract(?1,'$.statusOrigin'),library_items.status_origin)"#,
    },
    EntityDescriptor {
        entity_type: "seen_movie",
        table: "seen_movies",
        scope: Scope::Profile,
        business_key: &[("movie_id", "movieId")],
        seed: Seed::NoopUpdate,
        title: TitleRef::Movie,
        upsert_sql: r#"INSERT INTO seen_movies(uuid,profile_id,movie_id,title,poster_path,backdrop_path,watched_at,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.movieId'),json_extract(?1,'$.title'),json_extract(?1,'$.posterPath'),json_extract(?1,'$.backdropPath'),json_extract(?1,'$.watchedAt'),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(profile_id,movie_id) DO UPDATE SET title=excluded.title,poster_path=excluded.poster_path,backdrop_path=excluded.backdrop_path,watched_at=excluded.watched_at,updated_at=excluded.updated_at"#,
    },
    EntityDescriptor {
        entity_type: "episode_progress",
        table: "episode_progress",
        scope: Scope::Profile,
        business_key: &[("series_id", "seriesId"), ("episode_id", "episodeId")],
        seed: Seed::NoopUpdate,
        title: TitleRef::Series,
        upsert_sql: r#"INSERT INTO episode_progress(uuid,profile_id,series_id,episode_id,season_number,episode_number,watched,watched_at,rating,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.seriesId'),json_extract(?1,'$.episodeId'),json_extract(?1,'$.seasonNumber'),json_extract(?1,'$.episodeNumber'),coalesce(json_extract(?1,'$.watched'),1),json_extract(?1,'$.watchedAt'),json_extract(?1,'$.rating'),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(profile_id,series_id,episode_id) DO UPDATE SET season_number=excluded.season_number,episode_number=excluded.episode_number,watched=excluded.watched,watched_at=excluded.watched_at,rating=excluded.rating,updated_at=excluded.updated_at"#,
    },
    EntityDescriptor {
        entity_type: "tracked_series",
        table: "tracked_series",
        scope: Scope::Profile,
        business_key: &[("series_id", "seriesId")],
        seed: Seed::NoopUpdate,
        title: TitleRef::Series,
        upsert_sql: r#"INSERT INTO tracked_series(uuid,profile_id,series_id,title,poster_path,backdrop_path,total_episodes,created_at,updated_at,status)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.seriesId'),json_extract(?1,'$.title'),json_extract(?1,'$.posterPath'),json_extract(?1,'$.backdropPath'),coalesce(json_extract(?1,'$.totalEpisodes'),0),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'),json_extract(?1,'$.status'))
          ON CONFLICT(profile_id,series_id) DO UPDATE SET title=excluded.title,poster_path=excluded.poster_path,backdrop_path=excluded.backdrop_path,total_episodes=excluded.total_episodes,status=excluded.status,updated_at=excluded.updated_at"#,
    },
    EntityDescriptor {
        entity_type: "viewing_event",
        table: "viewing_events",
        scope: Scope::Profile,
        business_key: &[],
        // Append-like: no UPDATE capture, seeded by a direct outbox insert.
        seed: Seed::DirectInsert,
        title: TitleRef::Media,
        upsert_sql: r#"INSERT INTO viewing_events(uuid,profile_id,media_id,media_type,title,event_type,watched_at,duration_minutes,episode_id,season_number,episode_number,created_at,note)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.mediaId'),json_extract(?1,'$.mediaType'),json_extract(?1,'$.title'),json_extract(?1,'$.eventType'),json_extract(?1,'$.watchedAt'),json_extract(?1,'$.durationMinutes'),json_extract(?1,'$.episodeId'),json_extract(?1,'$.seasonNumber'),json_extract(?1,'$.episodeNumber'),json_extract(?1,'$.createdAt'),json_extract(?1,'$.note'))
          ON CONFLICT(uuid) DO UPDATE SET title=excluded.title,event_type=excluded.event_type,watched_at=excluded.watched_at,duration_minutes=excluded.duration_minutes,note=excluded.note WHERE viewing_events.profile_id=excluded.profile_id"#,
    },
    EntityDescriptor {
        entity_type: "custom_list",
        table: "custom_lists",
        scope: Scope::Profile,
        business_key: &[],
        seed: Seed::NoopUpdate,
        title: TitleRef::None,
        upsert_sql: r#"INSERT INTO custom_lists(uuid,profile_id,name,description,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.name'),json_extract(?1,'$.description'),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(uuid) DO UPDATE SET name=excluded.name,description=excluded.description,updated_at=excluded.updated_at WHERE custom_lists.profile_id=excluded.profile_id"#,
    },
    EntityDescriptor {
        entity_type: "custom_list_item",
        table: "custom_list_items",
        scope: Scope::ParentList,
        business_key: &[
            ("list_id", "listId"),
            ("media_id", "mediaId"),
            ("media_type", "mediaType"),
        ],
        seed: Seed::ChildOfList,
        title: TitleRef::None,
        upsert_sql: r#"INSERT INTO custom_list_items(uuid,list_id,media_id,media_type,title,poster_path,position,added_at,updated_at)
          SELECT json_extract(?1,'$.uuid'),json_extract(?1,'$.listId'),json_extract(?1,'$.mediaId'),json_extract(?1,'$.mediaType'),json_extract(?1,'$.title'),json_extract(?1,'$.posterPath'),json_extract(?1,'$.position'),json_extract(?1,'$.addedAt'),json_extract(?1,'$.updatedAt')
          WHERE EXISTS (SELECT 1 FROM custom_lists WHERE uuid=json_extract(?1,'$.listId') AND profile_id=?2)
          ON CONFLICT(list_id,media_id,media_type) DO UPDATE SET title=excluded.title,poster_path=excluded.poster_path,position=excluded.position,updated_at=excluded.updated_at"#,
    },
    EntityDescriptor {
        entity_type: "smart_list",
        table: "smart_lists",
        scope: Scope::Profile,
        business_key: &[],
        seed: Seed::NoopUpdate,
        title: TitleRef::None,
        upsert_sql: r#"INSERT INTO smart_lists(uuid,profile_id,name,rules,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.name'),json_extract(?1,'$.rules'),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(uuid) DO UPDATE SET name=excluded.name,rules=excluded.rules,updated_at=excluded.updated_at WHERE smart_lists.profile_id=excluded.profile_id"#,
    },
    EntityDescriptor {
        entity_type: "saved_filter",
        table: "saved_filters",
        scope: Scope::Profile,
        business_key: &[],
        // Create/delete only (no edit path in the UI): seeded directly.
        seed: Seed::DirectInsert,
        title: TitleRef::None,
        upsert_sql: r#"INSERT INTO saved_filters(uuid,profile_id,page,name,filters,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.page'),json_extract(?1,'$.name'),json_extract(?1,'$.filters'),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(uuid) DO UPDATE SET page=excluded.page,name=excluded.name,filters=excluded.filters,updated_at=excluded.updated_at WHERE saved_filters.profile_id=excluded.profile_id"#,
    },
    EntityDescriptor {
        entity_type: "availability_alert",
        table: "availability_alerts",
        scope: Scope::Profile,
        business_key: MEDIA,
        seed: Seed::NoopUpdate,
        title: TitleRef::None,
        upsert_sql: r#"INSERT INTO availability_alerts(uuid,profile_id,media_id,media_type,title,region,provider_ids,enabled,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.mediaId'),json_extract(?1,'$.mediaType'),json_extract(?1,'$.title'),json_extract(?1,'$.region'),json_extract(?1,'$.providerIds'),coalesce(json_extract(?1,'$.enabled'),1),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(profile_id,media_id,media_type) DO UPDATE SET title=excluded.title,region=excluded.region,provider_ids=excluded.provider_ids,enabled=excluded.enabled,updated_at=excluded.updated_at"#,
    },
    EntityDescriptor {
        entity_type: "dismissed_recommendation",
        table: "dismissed_recommendations",
        scope: Scope::Profile,
        business_key: MEDIA,
        seed: Seed::NoopUpdate,
        title: TitleRef::None,
        upsert_sql: r#"INSERT INTO dismissed_recommendations(uuid,profile_id,media_id,media_type,title,poster_path,dismissed_at,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.mediaId'),json_extract(?1,'$.mediaType'),json_extract(?1,'$.title'),json_extract(?1,'$.posterPath'),json_extract(?1,'$.dismissedAt'),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(profile_id,media_id,media_type) DO UPDATE SET title=excluded.title,poster_path=excluded.poster_path,dismissed_at=excluded.dismissed_at,updated_at=excluded.updated_at"#,
    },
    EntityDescriptor {
        entity_type: "activity_log",
        table: "activity_log",
        scope: Scope::Profile,
        business_key: &[],
        seed: Seed::NoopUpdate,
        title: TitleRef::None,
        upsert_sql: r#"INSERT INTO activity_log(uuid,profile_id,media_id,media_type,title,action,season_number,episode_number,episode_title,metadata,timestamp,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.mediaId'),json_extract(?1,'$.mediaType'),json_extract(?1,'$.title'),json_extract(?1,'$.action'),json_extract(?1,'$.seasonNumber'),json_extract(?1,'$.episodeNumber'),json_extract(?1,'$.episodeTitle'),json_extract(?1,'$.metadata'),json_extract(?1,'$.timestamp'),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(uuid) DO UPDATE SET media_id=excluded.media_id,media_type=excluded.media_type,title=excluded.title,action=excluded.action,season_number=excluded.season_number,episode_number=excluded.episode_number,episode_title=excluded.episode_title,metadata=excluded.metadata,timestamp=excluded.timestamp,updated_at=excluded.updated_at WHERE activity_log.profile_id=excluded.profile_id"#,
    },
    EntityDescriptor {
        entity_type: "account_preferences",
        table: "preferences",
        scope: Scope::Account,
        business_key: &[],
        seed: Seed::Preferences,
        title: TitleRef::None,
        upsert_sql: "INSERT INTO preferences(key,value,updated_at) \
             VALUES(json_extract(?1,'$.key'),json_extract(?1,'$.value'),json_extract(?1,'$.updatedAt')) \
             ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
    },
];

pub(super) fn descriptor(entity_type: &str) -> Option<&'static EntityDescriptor> {
    ENTITY_REGISTRY
        .iter()
        .find(|entity| entity.entity_type == entity_type)
}

pub fn validate_entity_type(value: &str) -> bool {
    descriptor(value).is_some()
}

/// Tables of the registry that carry a direct `profile_id` column.
#[cfg(test)]
fn profile_scoped_registry_tables() -> Vec<&'static str> {
    ENTITY_REGISTRY
        .iter()
        .filter(|entity| entity.scope == Scope::Profile)
        .map(|entity| entity.table)
        .collect()
}

#[cfg(test)]
mod tests;
