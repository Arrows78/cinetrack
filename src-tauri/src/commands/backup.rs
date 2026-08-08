use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{QueryBuilder, Sqlite, SqlitePool};
use tauri::State;

use crate::commands::availability::{AlertRow, AvailabilityAlert, AvailabilitySnapshot, SnapshotRow};
use crate::commands::custom_lists::{CustomList, CustomListItem, CustomListItemRow, CustomListRow};
use crate::commands::history::{HistoryAction, HistoryRow, ViewingHistoryItem};
use crate::commands::library::{LibraryItem, LibraryRow, LibraryStatus};
use crate::commands::profiles::{ProfileRow, UserProfile};
use crate::commands::progress::{EpisodeProgress, TrackedSeriesItem};
use crate::commands::stats::{ViewingEvent, ViewingEventType};
use crate::commands::watchlist::{WatchlistItem, WatchlistRow};
use crate::database::new_uuid;
use crate::error::ApiError;
use crate::models::MediaType;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeenMovie {
    pub profile_id: Option<String>,
    pub movie_id: i64,
    pub title: String,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub watched_at: String,
}

/// The full contents of a CineTrack backup — mirrors
/// portable-data-common.ts's `PortableData` exactly, one field per table.
/// The frontend already validates/normalizes untrusted backup JSON with Zod
/// (see portable-data.ts's `parseBackup`) before this ever reaches Rust, so
/// every required field here is guaranteed present by the time
/// `import_backup_data` runs.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableData {
    pub watchlist: Vec<WatchlistItem>,
    pub seen_movies: Vec<SeenMovie>,
    pub episode_progress: Vec<EpisodeProgress>,
    pub tracked_series: Vec<TrackedSeriesItem>,
    pub history: Vec<ViewingHistoryItem>,
    pub preferences: serde_json::Map<String, Value>,
    pub library: Vec<LibraryItem>,
    pub viewing_events: Vec<ViewingEvent>,
    pub profiles: Vec<UserProfile>,
    pub custom_lists: Vec<CustomList>,
    pub custom_list_items: Vec<CustomListItem>,
    pub availability_snapshots: Vec<AvailabilitySnapshot>,
    pub availability_alerts: Vec<AvailabilityAlert>,
}

fn parse_number_array(raw: &str) -> Vec<i64> {
    let Ok(Value::Array(values)) = serde_json::from_str::<Value>(raw) else {
        return Vec::new();
    };
    values.into_iter().filter_map(|value| value.as_i64()).collect()
}

fn parse_metadata(raw: Option<String>) -> Option<Value> {
    raw.and_then(|value| serde_json::from_str(&value).ok())
}

// ---------------------------------------------------------------------
// Export — each table read in full (no profile scoping, no WHERE clause),
// independent of the other command modules' own (profile-scoped) queries,
// matching how the original portable-data-export.ts never reused
// watchlist-repository.ts's queries either.
// ---------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct SeenMovieRow {
    profile_id: Option<String>,
    movie_id: i64,
    title: String,
    poster_path: Option<String>,
    backdrop_path: Option<String>,
    watched_at: String,
}

#[derive(sqlx::FromRow)]
struct EpisodeProgressRow {
    uuid: String,
    profile_id: Option<String>,
    series_id: i64,
    episode_id: i64,
    season_number: i64,
    episode_number: i64,
    watched: bool,
    watched_at: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(sqlx::FromRow)]
struct TrackedSeriesRow {
    uuid: String,
    profile_id: Option<String>,
    series_id: i64,
    title: String,
    poster_path: Option<String>,
    backdrop_path: Option<String>,
    total_episodes: i64,
    created_at: String,
    updated_at: String,
}

#[derive(sqlx::FromRow)]
struct PreferenceRow {
    key: String,
    value: String,
}

#[derive(sqlx::FromRow)]
struct ViewingEventRow {
    uuid: String,
    profile_id: String,
    media_id: i64,
    media_type: String,
    title: String,
    event_type: String,
    watched_at: String,
    duration_minutes: Option<i64>,
    episode_id: Option<i64>,
    season_number: Option<i64>,
    episode_number: Option<i64>,
}

async fn export_impl(pool: &SqlitePool) -> Result<PortableData, ApiError> {
    // All 13 reads share one transaction so the export is a single logical
    // snapshot — without this, a write landing between two of these
    // `SELECT *` calls (e.g. a movie marked watched right as the export
    // reaches viewing_events) could produce a backup mixing state from two
    // different instants (a watchlist entry gone by the time history
    // reflects it, or vice versa).
    let mut tx = pool.begin().await.map_err(ApiError::from)?;

    let watchlist: Vec<WatchlistRow> =
        sqlx::query_as("SELECT * FROM watchlist_items").fetch_all(&mut *tx).await.map_err(ApiError::from)?;
    let seen_movies: Vec<SeenMovieRow> =
        sqlx::query_as("SELECT * FROM seen_movies").fetch_all(&mut *tx).await.map_err(ApiError::from)?;
    let episode_progress: Vec<EpisodeProgressRow> =
        sqlx::query_as("SELECT * FROM episode_progress").fetch_all(&mut *tx).await.map_err(ApiError::from)?;
    let tracked_series: Vec<TrackedSeriesRow> =
        sqlx::query_as("SELECT * FROM tracked_series").fetch_all(&mut *tx).await.map_err(ApiError::from)?;
    let history: Vec<HistoryRow> =
        sqlx::query_as("SELECT * FROM activity_log").fetch_all(&mut *tx).await.map_err(ApiError::from)?;
    let preferences: Vec<PreferenceRow> =
        sqlx::query_as("SELECT * FROM preferences").fetch_all(&mut *tx).await.map_err(ApiError::from)?;
    let library: Vec<LibraryRow> =
        sqlx::query_as("SELECT * FROM library_items").fetch_all(&mut *tx).await.map_err(ApiError::from)?;
    let viewing_events: Vec<ViewingEventRow> =
        sqlx::query_as("SELECT * FROM viewing_events").fetch_all(&mut *tx).await.map_err(ApiError::from)?;
    let profiles: Vec<ProfileRow> =
        sqlx::query_as("SELECT * FROM profiles").fetch_all(&mut *tx).await.map_err(ApiError::from)?;
    let custom_lists: Vec<CustomListRow> =
        sqlx::query_as("SELECT * FROM custom_lists").fetch_all(&mut *tx).await.map_err(ApiError::from)?;
    let custom_list_items: Vec<CustomListItemRow> =
        sqlx::query_as("SELECT * FROM custom_list_items").fetch_all(&mut *tx).await.map_err(ApiError::from)?;
    let availability_snapshots: Vec<SnapshotRow> =
        sqlx::query_as("SELECT * FROM availability_snapshots").fetch_all(&mut *tx).await.map_err(ApiError::from)?;
    let availability_alerts: Vec<AlertRow> =
        sqlx::query_as("SELECT * FROM availability_alerts").fetch_all(&mut *tx).await.map_err(ApiError::from)?;

    tx.commit().await.map_err(ApiError::from)?;

    let mut preferences_map = serde_json::Map::new();
    for row in preferences {
        if let Ok(value) = serde_json::from_str(&row.value) {
            preferences_map.insert(row.key, value);
        }
    }

    Ok(PortableData {
        watchlist: watchlist
            .into_iter()
            .map(|row| WatchlistItem {
                id: row.uuid,
                profile_id: Some(row.profile_id),
                media_id: row.media_id,
                media_type: MediaType::from_db_str(&row.media_type),
                title: row.title,
                poster_path: row.poster_path,
                backdrop_path: row.backdrop_path,
                year: row.year,
                rating: row.rating,
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect(),
        seen_movies: seen_movies
            .into_iter()
            .map(|row| SeenMovie {
                profile_id: Some(row.profile_id.unwrap_or_else(|| "default".to_string())),
                movie_id: row.movie_id,
                title: row.title,
                poster_path: row.poster_path,
                backdrop_path: row.backdrop_path,
                watched_at: row.watched_at,
            })
            .collect(),
        episode_progress: episode_progress
            .into_iter()
            .map(|row| EpisodeProgress {
                id: row.uuid,
                profile_id: Some(row.profile_id.unwrap_or_else(|| "default".to_string())),
                series_id: row.series_id,
                episode_id: row.episode_id,
                season_number: row.season_number,
                episode_number: row.episode_number,
                watched: row.watched,
                watched_at: row.watched_at,
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect(),
        tracked_series: tracked_series
            .into_iter()
            .map(|row| TrackedSeriesItem {
                id: row.uuid,
                profile_id: Some(row.profile_id.unwrap_or_else(|| "default".to_string())),
                series_id: row.series_id,
                title: row.title,
                poster_path: row.poster_path,
                backdrop_path: row.backdrop_path,
                total_episodes: row.total_episodes,
                // Not recomputed via the episode_progress JOIN here, same as
                // the original TS export — a re-import writes this same
                // placeholder back, and normal reads (list_tracked_series)
                // always recompute it live from a real JOIN anyway.
                watched_episodes: 0,
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect(),
        history: history
            .into_iter()
            .map(|row| -> Result<ViewingHistoryItem, ApiError> {
                let action: HistoryAction = serde_json::from_value(Value::String(row.action.clone()))
                    .map_err(|_| ApiError::internal(format!("Unknown history action in database: {}", row.action)))?;
                Ok(ViewingHistoryItem {
                    id: row.uuid,
                    media_id: row.media_id,
                    media_type: MediaType::from_db_str(&row.media_type),
                    title: row.title,
                    action,
                    timestamp: row.timestamp,
                    season_number: row.season_number,
                    episode_number: row.episode_number,
                    episode_title: row.episode_title,
                    metadata: parse_metadata(row.metadata),
                })
            })
            .collect::<Result<Vec<_>, _>>()?,
        preferences: preferences_map,
        library: library
            .into_iter()
            .map(|row| -> Result<LibraryItem, ApiError> {
                let status: LibraryStatus = serde_json::from_value(Value::String(row.status.clone()))
                    .map_err(|_| ApiError::internal(format!("Unknown library status in database: {}", row.status)))?;
                Ok(LibraryItem {
                    id: row.uuid,
                    profile_id: row.profile_id,
                    media_id: row.media_id,
                    media_type: MediaType::from_db_str(&row.media_type),
                    title: row.title,
                    poster_path: row.poster_path,
                    backdrop_path: row.backdrop_path,
                    year: row.year,
                    rating: row.rating,
                    genres: serde_json::from_str(&row.genres).map_err(|e| ApiError::internal(e.to_string()))?,
                    status,
                    favourite: row.favourite,
                    user_rating: row.user_rating,
                    notes: row.notes,
                    tags: serde_json::from_str(&row.tags).map_err(|e| ApiError::internal(e.to_string()))?,
                    started_at: row.started_at,
                    completed_at: row.completed_at,
                    rewatch_count: row.rewatch_count,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                })
            })
            .collect::<Result<Vec<_>, _>>()?,
        viewing_events: viewing_events
            .into_iter()
            .map(|row| -> Result<ViewingEvent, ApiError> {
                let event_type: ViewingEventType = serde_json::from_value(Value::String(row.event_type.clone()))
                    .map_err(|_| ApiError::internal(format!("Unknown viewing event type in database: {}", row.event_type)))?;
                Ok(ViewingEvent {
                    id: row.uuid,
                    profile_id: row.profile_id,
                    media_id: row.media_id,
                    media_type: MediaType::from_db_str(&row.media_type),
                    title: row.title,
                    event_type,
                    watched_at: row.watched_at,
                    duration_minutes: row.duration_minutes,
                    episode_id: row.episode_id,
                    season_number: row.season_number,
                    episode_number: row.episode_number,
                })
            })
            .collect::<Result<Vec<_>, _>>()?,
        profiles: profiles
            .into_iter()
            .map(|row| UserProfile {
                id: row.uuid,
                name: row.name,
                avatar: row.avatar,
                created_at: row.created_at,
                supabase_user_id: row.supabase_user_id,
            })
            .collect(),
        custom_lists: custom_lists
            .into_iter()
            .map(|row| CustomList {
                id: row.uuid,
                profile_id: row.profile_id,
                name: row.name,
                description: row.description,
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect(),
        custom_list_items: custom_list_items
            .into_iter()
            .map(|row| CustomListItem {
                id: row.uuid,
                list_id: row.list_id,
                media_id: row.media_id,
                media_type: MediaType::from_db_str(&row.media_type),
                title: row.title,
                poster_path: row.poster_path,
                position: row.position,
                added_at: row.added_at,
                updated_at: row.updated_at,
            })
            .collect(),
        availability_snapshots: availability_snapshots
            .into_iter()
            .map(|row| AvailabilitySnapshot {
                media_id: row.media_id,
                media_type: MediaType::from_db_str(&row.media_type),
                region: row.region,
                provider_ids: parse_number_array(&row.provider_ids),
                checked_at: row.checked_at,
            })
            .collect(),
        availability_alerts: availability_alerts
            .into_iter()
            .map(|row| AvailabilityAlert {
                id: row.uuid,
                profile_id: row.profile_id,
                media_id: row.media_id,
                media_type: MediaType::from_db_str(&row.media_type),
                title: row.title,
                region: row.region,
                provider_ids: parse_number_array(&row.provider_ids),
                enabled: row.enabled,
                created_at: row.created_at,
            })
            .collect(),
    })
}

// ---------------------------------------------------------------------
// Import — replaces the entire database content inside one transaction
// (all-or-nothing). Tables are cleared child-first so FOREIGN KEY
// constraints never trip mid-import. Rows whose app-level identity is the
// `uuid` column (profiles, custom lists, history, viewing events, alerts)
// reuse the backup's `id` field as that uuid so identity survives a round
// trip; rows with no app-level identity (watchlist, seen movies, episode
// progress, tracked series, list items, library items) get a fresh uuid.
// ---------------------------------------------------------------------

// Keeps each multi-row INSERT's placeholder count well under SQLite's
// bound-parameter limit even for the widest table here (library_items, 20
// columns): 200 * 20 = 4,000, far below the 32,766 default.
const IMPORT_BATCH_SIZE: usize = 200;

async fn import_impl(pool: &SqlitePool, data: PortableData) -> Result<(), ApiError> {
    let mut tx = pool.begin().await.map_err(ApiError::from)?;

    for table in [
        "availability_alerts",
        "availability_snapshots",
        "custom_list_items",
        "custom_lists",
        "viewing_events",
        "library_items",
        "activity_log",
        "episode_progress",
        "tracked_series",
        "seen_movies",
        "watchlist_items",
        "preferences",
        "profiles",
    ] {
        sqlx::query(&format!("DELETE FROM {table}")).execute(&mut *tx).await.map_err(ApiError::from)?;
    }

    for item in &data.profiles {
        sqlx::query(
            "INSERT INTO profiles (uuid, name, avatar, supabase_user_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)",
        )
        .bind(&item.id)
        .bind(&item.name)
        .bind(&item.avatar)
        .bind(&item.supabase_user_id)
        .bind(&item.created_at)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;
    }

    let now = crate::database::now_iso(&mut *tx).await?;
    for (key, value) in &data.preferences {
        sqlx::query("INSERT INTO preferences (key, value, updated_at) VALUES ($1,$2,$3)")
            .bind(key)
            .bind(value.to_string())
            .bind(&now)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from)?;
    }

    for chunk in data.watchlist.chunks(IMPORT_BATCH_SIZE) {
        let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
            "INSERT INTO watchlist_items
              (uuid,profile_id,media_id,media_type,title,poster_path,backdrop_path,year,rating,created_at,updated_at) ",
        );
        qb.push_values(chunk, |mut b, item| {
            b.push_bind(new_uuid())
                .push_bind(item.profile_id.clone().unwrap_or_else(|| "default".to_string()))
                .push_bind(item.media_id)
                .push_bind(item.media_type.as_db_str())
                .push_bind(&item.title)
                .push_bind(&item.poster_path)
                .push_bind(&item.backdrop_path)
                .push_bind(item.year)
                .push_bind(item.rating)
                .push_bind(&item.created_at)
                .push_bind(&item.created_at);
        });
        qb.build().execute(&mut *tx).await.map_err(ApiError::from)?;
    }

    for chunk in data.seen_movies.chunks(IMPORT_BATCH_SIZE) {
        let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
            "INSERT INTO seen_movies (uuid,profile_id,movie_id,title,poster_path,backdrop_path,watched_at,created_at,updated_at) ",
        );
        qb.push_values(chunk, |mut b, item| {
            b.push_bind(new_uuid())
                .push_bind(item.profile_id.clone().unwrap_or_else(|| "default".to_string()))
                .push_bind(item.movie_id)
                .push_bind(&item.title)
                .push_bind(&item.poster_path)
                .push_bind(&item.backdrop_path)
                .push_bind(&item.watched_at)
                .push_bind(&item.watched_at)
                .push_bind(&item.watched_at);
        });
        qb.build().execute(&mut *tx).await.map_err(ApiError::from)?;
    }

    for chunk in data.episode_progress.chunks(IMPORT_BATCH_SIZE) {
        let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
            "INSERT INTO episode_progress
              (uuid,profile_id,series_id,episode_id,season_number,episode_number,watched,watched_at,created_at,updated_at) ",
        );
        qb.push_values(chunk, |mut b, item| {
            let timestamp = item.watched_at.clone().unwrap_or_else(|| now.clone());
            b.push_bind(new_uuid())
                .push_bind(item.profile_id.clone().unwrap_or_else(|| "default".to_string()))
                .push_bind(item.series_id)
                .push_bind(item.episode_id)
                .push_bind(item.season_number)
                .push_bind(item.episode_number)
                .push_bind(item.watched)
                .push_bind(item.watched_at.clone())
                .push_bind(timestamp.clone())
                .push_bind(timestamp);
        });
        qb.build().execute(&mut *tx).await.map_err(ApiError::from)?;
    }

    for chunk in data.tracked_series.chunks(IMPORT_BATCH_SIZE) {
        let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
            "INSERT INTO tracked_series
              (uuid,profile_id,series_id,title,poster_path,backdrop_path,total_episodes,created_at,updated_at) ",
        );
        qb.push_values(chunk, |mut b, item| {
            b.push_bind(new_uuid())
                .push_bind(item.profile_id.clone().unwrap_or_else(|| "default".to_string()))
                .push_bind(item.series_id)
                .push_bind(&item.title)
                .push_bind(&item.poster_path)
                .push_bind(&item.backdrop_path)
                .push_bind(item.total_episodes)
                .push_bind(&item.updated_at)
                .push_bind(&item.updated_at);
        });
        qb.build().execute(&mut *tx).await.map_err(ApiError::from)?;
    }

    for chunk in data.history.chunks(IMPORT_BATCH_SIZE) {
        let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
            "INSERT INTO activity_log
              (uuid,profile_id,media_id,media_type,title,action,season_number,episode_number,episode_title,metadata,timestamp,created_at,updated_at) ",
        );
        qb.push_values(chunk, |mut b, item| {
            // profile_id mirrors metadata.profileId — must stay in sync here or
            // imported history silently drops out of list_history's indexed
            // profile_id query.
            let history_profile_id = item
                .metadata
                .as_ref()
                .and_then(|m| m.get("profileId"))
                .and_then(Value::as_str)
                .unwrap_or("default")
                .to_string();
            b.push_bind(&item.id)
                .push_bind(history_profile_id)
                .push_bind(item.media_id)
                .push_bind(item.media_type.as_db_str())
                .push_bind(&item.title)
                .push_bind(item.action.as_db_str())
                .push_bind(item.season_number)
                .push_bind(item.episode_number)
                .push_bind(&item.episode_title)
                .push_bind(item.metadata.as_ref().map(|value| value.to_string()))
                .push_bind(&item.timestamp)
                .push_bind(&item.timestamp)
                .push_bind(&item.timestamp);
        });
        qb.build().execute(&mut *tx).await.map_err(ApiError::from)?;
    }

    for chunk in data.library.chunks(IMPORT_BATCH_SIZE) {
        let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
            "INSERT INTO library_items
              (uuid,profile_id,media_id,media_type,title,poster_path,backdrop_path,year,rating,genres,status,favourite,user_rating,notes,tags,started_at,completed_at,rewatch_count,created_at,updated_at) ",
        );
        qb.push_values(chunk, |mut b, item| {
            b.push_bind(new_uuid())
                .push_bind(&item.profile_id)
                .push_bind(item.media_id)
                .push_bind(item.media_type.as_db_str())
                .push_bind(&item.title)
                .push_bind(&item.poster_path)
                .push_bind(&item.backdrop_path)
                .push_bind(item.year)
                .push_bind(item.rating)
                .push_bind(serde_json::to_string(&item.genres).unwrap())
                .push_bind(item.status.as_db_str())
                .push_bind(item.favourite)
                .push_bind(item.user_rating)
                .push_bind(&item.notes)
                .push_bind(serde_json::to_string(&item.tags).unwrap())
                .push_bind(&item.started_at)
                .push_bind(&item.completed_at)
                .push_bind(item.rewatch_count)
                .push_bind(&item.created_at)
                .push_bind(&item.updated_at);
        });
        qb.build().execute(&mut *tx).await.map_err(ApiError::from)?;
    }

    for chunk in data.viewing_events.chunks(IMPORT_BATCH_SIZE) {
        let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
            "INSERT INTO viewing_events
              (uuid,profile_id,media_id,media_type,title,event_type,watched_at,duration_minutes,episode_id,season_number,episode_number,created_at) ",
        );
        qb.push_values(chunk, |mut b, item| {
            b.push_bind(&item.id)
                .push_bind(&item.profile_id)
                .push_bind(item.media_id)
                .push_bind(item.media_type.as_db_str())
                .push_bind(&item.title)
                .push_bind(item.event_type.as_db_str())
                .push_bind(&item.watched_at)
                .push_bind(item.duration_minutes)
                .push_bind(item.episode_id)
                .push_bind(item.season_number)
                .push_bind(item.episode_number)
                .push_bind(&item.watched_at);
        });
        qb.build().execute(&mut *tx).await.map_err(ApiError::from)?;
    }

    for chunk in data.custom_lists.chunks(IMPORT_BATCH_SIZE) {
        let mut qb: QueryBuilder<Sqlite> =
            QueryBuilder::new("INSERT INTO custom_lists (uuid, profile_id, name, description, created_at, updated_at) ");
        qb.push_values(chunk, |mut b, item| {
            b.push_bind(&item.id)
                .push_bind(&item.profile_id)
                .push_bind(&item.name)
                .push_bind(&item.description)
                .push_bind(&item.created_at)
                .push_bind(&item.updated_at);
        });
        qb.build().execute(&mut *tx).await.map_err(ApiError::from)?;
    }

    for chunk in data.custom_list_items.chunks(IMPORT_BATCH_SIZE) {
        let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
            "INSERT INTO custom_list_items (uuid,list_id,media_id,media_type,title,poster_path,position,added_at,updated_at) ",
        );
        qb.push_values(chunk, |mut b, item| {
            b.push_bind(new_uuid())
                .push_bind(&item.list_id)
                .push_bind(item.media_id)
                .push_bind(item.media_type.as_db_str())
                .push_bind(&item.title)
                .push_bind(&item.poster_path)
                .push_bind(item.position)
                .push_bind(&item.added_at)
                .push_bind(&item.added_at);
        });
        qb.build().execute(&mut *tx).await.map_err(ApiError::from)?;
    }

    for chunk in data.availability_snapshots.chunks(IMPORT_BATCH_SIZE) {
        let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
            "INSERT INTO availability_snapshots (media_id, media_type, region, provider_ids, checked_at) ",
        );
        qb.push_values(chunk, |mut b, item| {
            b.push_bind(item.media_id)
                .push_bind(item.media_type.as_db_str())
                .push_bind(&item.region)
                .push_bind(serde_json::to_string(&item.provider_ids).unwrap())
                .push_bind(&item.checked_at);
        });
        qb.build().execute(&mut *tx).await.map_err(ApiError::from)?;
    }

    for chunk in data.availability_alerts.chunks(IMPORT_BATCH_SIZE) {
        let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
            "INSERT INTO availability_alerts
              (uuid,profile_id,media_id,media_type,title,region,provider_ids,enabled,created_at,updated_at) ",
        );
        qb.push_values(chunk, |mut b, item| {
            b.push_bind(&item.id)
                .push_bind(&item.profile_id)
                .push_bind(item.media_id)
                .push_bind(item.media_type.as_db_str())
                .push_bind(&item.title)
                .push_bind(&item.region)
                .push_bind(serde_json::to_string(&item.provider_ids).unwrap())
                .push_bind(item.enabled)
                .push_bind(&item.created_at)
                .push_bind(&item.created_at);
        });
        qb.build().execute(&mut *tx).await.map_err(ApiError::from)?;
    }

    tx.commit().await.map_err(ApiError::from)?;
    Ok(())
}

async fn quick_check_impl(pool: &SqlitePool) -> Result<(bool, String), ApiError> {
    let rows: Vec<(String,)> = sqlx::query_as("PRAGMA quick_check").fetch_all(pool).await.map_err(ApiError::from)?;
    let detail = rows.into_iter().map(|(value,)| value).collect::<Vec<_>>().join(", ");
    let detail = if detail.is_empty() { "unknown".to_string() } else { detail };
    let healthy = detail == "ok";
    Ok((healthy, detail))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataIntegrityCheck {
    pub healthy: bool,
    pub detail: String,
}

#[tauri::command]
pub async fn export_backup_data(pool: State<'_, SqlitePool>) -> Result<PortableData, ApiError> {
    export_impl(&pool).await
}

#[tauri::command]
pub async fn import_backup_data(data: PortableData, pool: State<'_, SqlitePool>) -> Result<(), ApiError> {
    import_impl(&pool, data).await
}

#[tauri::command]
pub async fn check_data_integrity(pool: State<'_, SqlitePool>) -> Result<DataIntegrityCheck, ApiError> {
    let (healthy, detail) = quick_check_impl(&pool).await?;
    Ok(DataIntegrityCheck { healthy, detail })
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(2).connect("sqlite::memory:").await.unwrap();
        crate::database::migrations::run_migrations(&pool).await.unwrap();
        pool
    }

    async fn table_columns(pool: &SqlitePool, table: &str) -> Vec<String> {
        let mut columns: Vec<String> =
            sqlx::query_scalar(&format!("SELECT name FROM pragma_table_info('{table}')")).fetch_all(pool).await.unwrap();
        columns.sort();
        columns
    }

    fn sorted(mut columns: Vec<&str>) -> Vec<String> {
        columns.sort_unstable();
        columns.into_iter().map(str::to_string).collect()
    }

    /// Guards the `SELECT * FROM <table>` export queries above against silent
    /// schema drift: `sqlx::FromRow` maps by column name and simply ignores
    /// any table column that has no matching Row struct field, so a column
    /// added to a table later would vanish from every backup export without
    /// either query erroring. Each expected list mirrors its Row struct's
    /// fields exactly (checked by hand against 001-initial-schema.ts); a few
    /// tables list fewer columns than they have — those gaps are intentional
    /// (see comments) rather than a Row struct oversight.
    #[tokio::test]
    async fn full_row_structs_cover_every_table_column_or_document_why_not() {
        let pool = migrated_pool().await;

        // Full match: these Row structs mirror every column of their table.
        for (table, expected) in [
            ("profiles", sorted(vec!["uuid", "name", "avatar", "supabase_user_id", "created_at", "updated_at"])),
            (
                "library_items",
                sorted(vec![
                    "uuid",
                    "profile_id",
                    "media_id",
                    "media_type",
                    "title",
                    "poster_path",
                    "backdrop_path",
                    "year",
                    "rating",
                    "genres",
                    "status",
                    "favourite",
                    "user_rating",
                    "notes",
                    "tags",
                    "started_at",
                    "completed_at",
                    "rewatch_count",
                    "created_at",
                    "updated_at",
                ]),
            ),
            (
                "watchlist_items",
                sorted(vec![
                    "uuid",
                    "profile_id",
                    "media_id",
                    "media_type",
                    "title",
                    "poster_path",
                    "backdrop_path",
                    "year",
                    "rating",
                    "created_at",
                    "updated_at",
                ]),
            ),
            (
                "episode_progress",
                sorted(vec![
                    "uuid",
                    "profile_id",
                    "series_id",
                    "episode_id",
                    "season_number",
                    "episode_number",
                    "watched",
                    "watched_at",
                    "created_at",
                    "updated_at",
                ]),
            ),
            (
                "tracked_series",
                sorted(vec![
                    "uuid",
                    "profile_id",
                    "series_id",
                    "title",
                    "poster_path",
                    "backdrop_path",
                    "total_episodes",
                    "created_at",
                    "updated_at",
                ]),
            ),
            ("custom_lists", sorted(vec!["uuid", "profile_id", "name", "description", "created_at", "updated_at"])),
            (
                "custom_list_items",
                sorted(vec![
                    "uuid",
                    "list_id",
                    "media_id",
                    "media_type",
                    "title",
                    "poster_path",
                    "position",
                    "added_at",
                    "updated_at",
                ]),
            ),
            ("availability_snapshots", sorted(vec!["media_id", "media_type", "region", "provider_ids", "checked_at"])),
        ] {
            assert_eq!(table_columns(&pool, table).await, expected, "{table} gained/lost a column vs its Row struct");
        }

        // Documented gaps below: the table legitimately has more columns
        // than its Row struct — each comment says why the missing ones are
        // safe to drop from the export today. This still asserts against
        // the table's real, full column set, so a *new* column added later
        // fails the test just like the tables above, forcing a conscious
        // "does the Row struct need this too?" check.

        // seen_movies: `uuid` is discarded on import (a fresh one is always
        // generated — see import_impl's header comment), and created_at /
        // updated_at aren't modeled because they always mirror watched_at.
        assert_eq!(
            table_columns(&pool, "seen_movies").await,
            sorted(vec!["uuid", "profile_id", "movie_id", "title", "poster_path", "backdrop_path", "watched_at", "created_at", "updated_at"]),
        );
        // viewing_events: created_at isn't modeled because it always mirrors
        // watched_at (this table is append-only, per the migration header).
        assert_eq!(
            table_columns(&pool, "viewing_events").await,
            sorted(vec![
                "uuid",
                "profile_id",
                "media_id",
                "media_type",
                "title",
                "event_type",
                "watched_at",
                "duration_minutes",
                "episode_id",
                "season_number",
                "episode_number",
                "created_at",
            ]),
        );
        // activity_log: profile_id is reconstructed from metadata.profileId
        // on import (see import_impl); created_at/updated_at aren't modeled
        // because they always mirror `timestamp`.
        assert_eq!(
            table_columns(&pool, "activity_log").await,
            sorted(vec![
                "uuid",
                "profile_id",
                "media_id",
                "media_type",
                "title",
                "action",
                "season_number",
                "episode_number",
                "episode_title",
                "metadata",
                "timestamp",
                "created_at",
                "updated_at",
            ]),
        );
        // availability_alerts: updated_at isn't modeled anywhere in the
        // AvailabilityAlert domain type, not just here.
        assert_eq!(
            table_columns(&pool, "availability_alerts").await,
            sorted(vec![
                "uuid",
                "profile_id",
                "media_id",
                "media_type",
                "title",
                "region",
                "provider_ids",
                "enabled",
                "created_at",
                "updated_at",
            ]),
        );
        // preferences: updated_at isn't modeled — PortableData.preferences is
        // a plain key/value map with no room for per-key metadata.
        assert_eq!(table_columns(&pool, "preferences").await, sorted(vec!["key", "value", "updated_at"]));
    }

    #[tokio::test]
    async fn quick_check_reports_healthy_on_a_fresh_database() {
        let pool = migrated_pool().await;
        let (healthy, detail) = quick_check_impl(&pool).await.unwrap();
        assert!(healthy);
        assert_eq!(detail, "ok");
    }

    #[tokio::test]
    async fn exports_and_reimports_watchlist_and_library_round_trip() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO watchlist_items (uuid, profile_id, media_id, media_type, title, created_at, updated_at)
             VALUES ('w1', 'default', 1, 'movie', 'Round Trip', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at)
             VALUES ('l1', 'default', 1, 'movie', 'Round Trip', 'watching', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let exported = export_impl(&pool).await.unwrap();
        assert_eq!(exported.watchlist.len(), 1);
        assert_eq!(exported.library.len(), 1);

        import_impl(&pool, exported).await.unwrap();

        let watchlist_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM watchlist_items").fetch_one(&pool).await.unwrap();
        assert_eq!(watchlist_count.0, 1);
        let library_status: (String,) = sqlx::query_as("SELECT status FROM library_items").fetch_one(&pool).await.unwrap();
        assert_eq!(library_status.0, "watching");
    }

    #[tokio::test]
    async fn export_and_reimport_preserves_the_profiles_supabase_link() {
        let pool = migrated_pool().await;
        sqlx::query("UPDATE profiles SET supabase_user_id = 'user-1' WHERE uuid = 'default'").execute(&pool).await.unwrap();

        let exported = export_impl(&pool).await.unwrap();
        assert_eq!(exported.profiles.len(), 1);
        assert_eq!(exported.profiles[0].supabase_user_id.as_deref(), Some("user-1"));

        import_impl(&pool, exported).await.unwrap();

        let supabase_user_id: (Option<String>,) =
            sqlx::query_as("SELECT supabase_user_id FROM profiles WHERE uuid = 'default'").fetch_one(&pool).await.unwrap();
        assert_eq!(supabase_user_id.0.as_deref(), Some("user-1"));
    }

    #[tokio::test]
    async fn import_preserves_history_uuid_but_not_watchlist_uuid() {
        let pool = migrated_pool().await;
        // export_impl already includes the migration-seeded "default"
        // profile — no need to add another one (that would violate the
        // profiles.uuid UNIQUE constraint on import).
        let mut data = export_impl(&pool).await.unwrap();
        data.watchlist.push(WatchlistItem {
            id: "original-watchlist-id".to_string(),
            profile_id: Some("default".to_string()),
            media_id: 1,
            media_type: MediaType::Movie,
            title: "Test".to_string(),
            poster_path: None,
            backdrop_path: None,
            year: None,
            rating: None,
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            updated_at: "2026-01-01T00:00:00.000Z".to_string(),
        });
        data.history.push(ViewingHistoryItem {
            id: "original-history-id".to_string(),
            media_id: 1,
            media_type: MediaType::Movie,
            title: "Test".to_string(),
            action: HistoryAction::MovieWatched,
            timestamp: "2026-01-01T00:00:00.000Z".to_string(),
            season_number: None,
            episode_number: None,
            episode_title: None,
            metadata: Some(serde_json::json!({ "profileId": "default" })),
        });

        import_impl(&pool, data).await.unwrap();

        let watchlist_uuid: (String,) = sqlx::query_as("SELECT uuid FROM watchlist_items").fetch_one(&pool).await.unwrap();
        assert_ne!(watchlist_uuid.0, "original-watchlist-id");

        let history_uuid: (String,) = sqlx::query_as("SELECT uuid FROM activity_log").fetch_one(&pool).await.unwrap();
        assert_eq!(history_uuid.0, "original-history-id");
    }

    #[tokio::test]
    async fn import_defaults_watchlist_profile_id_when_absent() {
        let pool = migrated_pool().await;
        // export_impl already includes the migration-seeded "default"
        // profile — no need to add another one (that would violate the
        // profiles.uuid UNIQUE constraint on import).
        let mut data = export_impl(&pool).await.unwrap();
        data.watchlist.push(WatchlistItem {
            id: "w1".to_string(),
            profile_id: None,
            media_id: 1,
            media_type: MediaType::Movie,
            title: "Test".to_string(),
            poster_path: None,
            backdrop_path: None,
            year: None,
            rating: None,
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            updated_at: "2026-01-01T00:00:00.000Z".to_string(),
        });

        import_impl(&pool, data).await.unwrap();

        let profile_id: (String,) = sqlx::query_as("SELECT profile_id FROM watchlist_items").fetch_one(&pool).await.unwrap();
        assert_eq!(profile_id.0, "default");
    }

    #[tokio::test]
    async fn import_batches_a_table_spanning_more_than_one_chunk() {
        let pool = migrated_pool().await;
        let mut data = export_impl(&pool).await.unwrap();
        let row_count = IMPORT_BATCH_SIZE * 2 + 1;
        for index in 0..row_count {
            data.watchlist.push(WatchlistItem {
                id: format!("w{index}"),
                profile_id: Some("default".to_string()),
                media_id: index as i64,
                media_type: MediaType::Movie,
                title: format!("Title {index}"),
                poster_path: None,
                backdrop_path: None,
                year: None,
                rating: None,
                created_at: "2026-01-01T00:00:00.000Z".to_string(),
                updated_at: "2026-01-01T00:00:00.000Z".to_string(),
            });
        }

        import_impl(&pool, data).await.unwrap();

        let watchlist_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM watchlist_items").fetch_one(&pool).await.unwrap();
        assert_eq!(watchlist_count.0, row_count as i64);
    }
}
