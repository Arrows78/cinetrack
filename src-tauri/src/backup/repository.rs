#[cfg(test)]
use std::path::PathBuf;

#[cfg(test)]
use super::commands::{
    check_data_integrity, export_backup_data, import_backup_data, list_backup_directory,
    read_backup_from_path, remove_backup_file, write_backup_to_path,
};
#[cfg(test)]
use super::integrity::quick_check_impl;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{QueryBuilder, Sqlite, SqlitePool};
#[cfg(test)]
use tauri::State;

use crate::availability::{AlertRow, AvailabilityAlert, AvailabilitySnapshot, SnapshotRow};
use crate::commands::custom_lists::{CustomList, CustomListItem, CustomListItemRow, CustomListRow};
use crate::commands::history::{HistoryAction, HistoryRow, ViewingHistoryItem};
use crate::commands::saved_filters::{SavedFilter, SavedFilterRow};
use crate::commands::smart_lists::{SmartList, SmartListRow};
use crate::database::new_uuid;
use crate::error::ApiError;
use crate::library::{LibraryItem, LibraryRow, LibraryStatus};
use crate::models::MediaType;
use crate::profiles::{ProfileRow, UserProfile};
use crate::progress::{EpisodeProgress, TrackedSeriesItem};
use crate::stats::{ViewingEvent, ViewingEventType};

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
    pub smart_lists: Vec<SmartList>,
    pub saved_filters: Vec<SavedFilter>,
}

fn parse_number_array(raw: &str) -> Vec<i64> {
    let Ok(Value::Array(values)) = serde_json::from_str::<Value>(raw) else {
        return Vec::new();
    };
    values
        .into_iter()
        .filter_map(|value| value.as_i64())
        .collect()
}

fn parse_metadata(raw: Option<String>) -> Option<Value> {
    raw.and_then(|value| serde_json::from_str(&value).ok())
}

// ---------------------------------------------------------------------
// Export — each table read in full (no profile scoping, no WHERE clause),
// independent of the other command modules' own (profile-scoped) queries,
// matching how the original portable-data-export.ts never reused
// library-repository.ts's queries either.
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
    status: Option<String>,
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
    note: Option<String>,
}

// ---------------------------------------------------------------------
// Per-table macros — replace the shape repeated once per table below:
// in export_impl, "fetch every row of a table, mapped by sqlx::FromRow";
// in import_impl, "chunk rows into IMPORT_BATCH_SIZE, build a multi-row
// INSERT via QueryBuilder, execute". A declarative macro was chosen over
// a trait + `Box<dyn Trait>` dispatch (the alternative this codebase
// already uses for command-layer boilerplate, see macros.rs's
// `profile_scoped_command!`) for the same reason it applied there: the
// 13-table set is fixed at compile time, never an open set discovered at
// runtime, so there's nothing to gain from erasing each table's concrete
// Row/domain type behind a trait object — a macro expands to exactly the
// hand-written fetch/insert code, just without retyping the surrounding
// scaffolding for every table.
//
// Per-table *conversion* logic (Row -> domain type) stays written out by
// hand in export_impl, and per-table *bind order* stays written out by
// hand in each import_table! call below — those differ enough
// table-to-table (fresh uuid vs. preserved id, JSON-encoded columns,
// fallible enum parsing, computed defaults/timestamps) that folding them
// into the macro too would trade a readable, greppable per-table block
// for a harder-to-audit indirection, on the single most
// correctness-sensitive path in the app.

/// Fetches every row of `$table` into `Vec<$row_ty>` inside the caller's
/// already-open transaction `$tx`. Mirrors the pre-refactor's repeated
/// `sqlx::query_as("SELECT * FROM <table>").fetch_all(&mut *tx).await.map_err(ApiError::from)?`
/// line exactly — same query, same error mapping, same "runs inside one
/// shared transaction" behavior — just not retyped 13 times.
macro_rules! export_table {
    ($tx:expr, $table:literal, $row_ty:ty) => {{
        let rows: Vec<$row_ty> = sqlx::query_as(concat!("SELECT * FROM ", $table))
            .fetch_all(&mut *$tx)
            .await
            .map_err(ApiError::from)?;
        rows
    }};
}

/// Chunks `$items` into `IMPORT_BATCH_SIZE`-row batches, builds a
/// multi-row INSERT from `$sql` (the `INSERT INTO ... (columns)` prefix,
/// verbatim from the pre-refactor code) via `QueryBuilder`, binds each row
/// with the `|$b, $item| $bind` closure, and executes each batch against
/// the caller's open transaction `$tx`. Only fits tables imported as a
/// batched multi-row INSERT; `profiles` and `preferences` insert one row
/// at a time by hand in import_impl (there's no natural "batch" shape for
/// either — a handful of profiles, one row per preference key) and don't
/// go through this macro.
macro_rules! import_table {
    ($tx:expr, $items:expr, $sql:literal, |$b:ident, $item:ident| $bind:block) => {
        for chunk in $items.chunks(IMPORT_BATCH_SIZE) {
            let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new($sql);
            qb.push_values(chunk, |mut $b, $item| $bind);
            qb.build()
                .execute(&mut *$tx)
                .await
                .map_err(ApiError::from)?;
        }
    };
}

pub(super) async fn export_impl(pool: &SqlitePool) -> Result<PortableData, ApiError> {
    // All 12 reads share one transaction so the export is a single logical
    // snapshot — without this, a write landing between two of these
    // `SELECT *` calls (e.g. a movie marked watched right as the export
    // reaches viewing_events) could produce a backup mixing state from two
    // different instants (a library entry not yet updated by the time
    // history reflects it, or vice versa).
    let mut tx = pool.begin().await.map_err(ApiError::from)?;

    let seen_movies = export_table!(tx, "seen_movies", SeenMovieRow);
    let episode_progress = export_table!(tx, "episode_progress", EpisodeProgressRow);
    let tracked_series = export_table!(tx, "tracked_series", TrackedSeriesRow);
    let history = export_table!(tx, "activity_log", HistoryRow);
    let preferences = export_table!(tx, "preferences", PreferenceRow);
    let library = export_table!(tx, "library_items", LibraryRow);
    let viewing_events = export_table!(tx, "viewing_events", ViewingEventRow);
    let profiles = export_table!(tx, "profiles", ProfileRow);
    let custom_lists = export_table!(tx, "custom_lists", CustomListRow);
    let custom_list_items = export_table!(tx, "custom_list_items", CustomListItemRow);
    let availability_snapshots = export_table!(tx, "availability_snapshots", SnapshotRow);
    let availability_alerts = export_table!(tx, "availability_alerts", AlertRow);
    let smart_lists = export_table!(tx, "smart_lists", SmartListRow);
    let saved_filters = export_table!(tx, "saved_filters", SavedFilterRow);

    tx.commit().await.map_err(ApiError::from)?;

    let mut preferences_map = serde_json::Map::new();
    for row in preferences {
        if let Ok(value) = serde_json::from_str(&row.value) {
            preferences_map.insert(row.key, value);
        }
    }

    Ok(PortableData {
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
                status: row.status,
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect(),
        history: history
            .into_iter()
            .map(|row| -> Result<ViewingHistoryItem, ApiError> {
                let action: HistoryAction =
                    serde_json::from_value(Value::String(row.action.clone())).map_err(|_| {
                        ApiError::internal(format!(
                            "Unknown history action in database: {}",
                            row.action
                        ))
                    })?;
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
                let status: LibraryStatus =
                    serde_json::from_value(Value::String(row.status.clone())).map_err(|_| {
                        ApiError::internal(format!(
                            "Unknown library status in database: {}",
                            row.status
                        ))
                    })?;
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
                    genres: serde_json::from_str(&row.genres)
                        .map_err(|e| ApiError::internal(e.to_string()))?,
                    status,
                    favourite: row.favourite,
                    user_rating: row.user_rating,
                    notes: row.notes,
                    tags: serde_json::from_str(&row.tags)
                        .map_err(|e| ApiError::internal(e.to_string()))?,
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
                let event_type: ViewingEventType = serde_json::from_value(Value::String(
                    row.event_type.clone(),
                ))
                .map_err(|_| {
                    ApiError::internal(format!(
                        "Unknown viewing event type in database: {}",
                        row.event_type
                    ))
                })?;
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
                    note: row.note,
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
        smart_lists: smart_lists
            .into_iter()
            .map(SmartList::try_from)
            .collect::<Result<Vec<_>, _>>()?,
        saved_filters: saved_filters
            .into_iter()
            .map(SavedFilter::try_from)
            .collect::<Result<Vec<_>, _>>()?,
    })
}

// ---------------------------------------------------------------------
// Import — replaces the entire database content inside one transaction
// (all-or-nothing). Tables are cleared child-first so FOREIGN KEY
// constraints never trip mid-import. Rows whose app-level identity is the
// `uuid` column (profiles, custom lists, history, viewing events, alerts)
// reuse the backup's `id` field as that uuid so identity survives a round
// trip; rows with no app-level identity (seen movies, episode progress,
// tracked series, list items, library items) get a fresh uuid.
// ---------------------------------------------------------------------

// Keeps each multi-row INSERT's placeholder count well under SQLite's
// bound-parameter limit even for the widest table here (library_items, 20
// columns): 200 * 20 = 4,000, far below the 32,766 default.
const IMPORT_BATCH_SIZE: usize = 200;

pub(super) async fn import_impl(pool: &SqlitePool, data: PortableData) -> Result<(), ApiError> {
    let mut tx = pool.begin().await.map_err(ApiError::from)?;

    // Child-first purge order: `custom_list_items` before `custom_lists`
    // (its own FK target), everything in `PROFILE_SCOPED_TABLES` before
    // `profiles` (what they all reference) — `availability_snapshots` and
    // `preferences` have no FK of their own, so they're unconstrained.
    let purge_order: Vec<&str> = ["availability_snapshots", "custom_list_items"]
        .into_iter()
        .chain(crate::database::PROFILE_SCOPED_TABLES.iter().copied())
        .chain(["preferences", "profiles"])
        .collect();
    for table in purge_order {
        // `table` iterates a fixed Rust list built above, never user input.
        sqlx::query(sqlx::AssertSqlSafe(format!("DELETE FROM {table}")))
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from)?;
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

    import_table!(
        tx,
        data.seen_movies,
        "INSERT INTO seen_movies (uuid,profile_id,movie_id,title,poster_path,backdrop_path,watched_at,created_at,updated_at) ",
        |b, item| {
            b.push_bind(new_uuid())
                .push_bind(
                    item.profile_id
                        .clone()
                        .unwrap_or_else(|| "default".to_string()),
                )
                .push_bind(item.movie_id)
                .push_bind(&item.title)
                .push_bind(&item.poster_path)
                .push_bind(&item.backdrop_path)
                .push_bind(&item.watched_at)
                .push_bind(&item.watched_at)
                .push_bind(&item.watched_at);
        }
    );

    import_table!(
        tx,
        data.episode_progress,
        "INSERT INTO episode_progress
              (uuid,profile_id,series_id,episode_id,season_number,episode_number,watched,watched_at,created_at,updated_at) ",
        |b, item| {
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
        }
    );

    import_table!(
        tx,
        data.tracked_series,
        "INSERT INTO tracked_series
              (uuid,profile_id,series_id,title,poster_path,backdrop_path,total_episodes,status,created_at,updated_at) ",
        |b, item| {
            b.push_bind(new_uuid())
                .push_bind(item.profile_id.clone().unwrap_or_else(|| "default".to_string()))
                .push_bind(item.series_id)
                .push_bind(&item.title)
                .push_bind(&item.poster_path)
                .push_bind(&item.backdrop_path)
                .push_bind(item.total_episodes)
                .push_bind(&item.status)
                .push_bind(&item.updated_at)
                .push_bind(&item.updated_at);
        }
    );

    import_table!(
        tx,
        data.history,
        "INSERT INTO activity_log
              (uuid,profile_id,media_id,media_type,title,action,season_number,episode_number,episode_title,metadata,timestamp,created_at,updated_at) ",
        |b, item| {
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
        }
    );

    import_table!(
        tx,
        data.library,
        "INSERT INTO library_items
              (uuid,profile_id,media_id,media_type,title,poster_path,backdrop_path,year,rating,genres,status,favourite,user_rating,notes,tags,started_at,completed_at,rewatch_count,created_at,updated_at) ",
        |b, item| {
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
        }
    );

    import_table!(
        tx,
        data.viewing_events,
        "INSERT INTO viewing_events
              (uuid,profile_id,media_id,media_type,title,event_type,watched_at,duration_minutes,episode_id,season_number,episode_number,note,created_at) ",
        |b, item| {
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
                .push_bind(&item.note)
                .push_bind(&item.watched_at);
        }
    );

    import_table!(
        tx,
        data.custom_lists,
        "INSERT INTO custom_lists (uuid, profile_id, name, description, created_at, updated_at) ",
        |b, item| {
            b.push_bind(&item.id)
                .push_bind(&item.profile_id)
                .push_bind(&item.name)
                .push_bind(&item.description)
                .push_bind(&item.created_at)
                .push_bind(&item.updated_at);
        }
    );

    import_table!(
        tx,
        data.custom_list_items,
        "INSERT INTO custom_list_items (uuid,list_id,media_id,media_type,title,poster_path,position,added_at,updated_at) ",
        |b, item| {
            b.push_bind(new_uuid())
                .push_bind(&item.list_id)
                .push_bind(item.media_id)
                .push_bind(item.media_type.as_db_str())
                .push_bind(&item.title)
                .push_bind(&item.poster_path)
                .push_bind(item.position)
                .push_bind(&item.added_at)
                .push_bind(&item.added_at);
        }
    );

    import_table!(
        tx,
        data.availability_snapshots,
        "INSERT INTO availability_snapshots (media_id, media_type, region, provider_ids, checked_at) ",
        |b, item| {
            b.push_bind(item.media_id)
                .push_bind(item.media_type.as_db_str())
                .push_bind(&item.region)
                .push_bind(serde_json::to_string(&item.provider_ids).unwrap())
                .push_bind(&item.checked_at);
        }
    );

    import_table!(
        tx,
        data.availability_alerts,
        "INSERT INTO availability_alerts
              (uuid,profile_id,media_id,media_type,title,region,provider_ids,enabled,created_at,updated_at) ",
        |b, item| {
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
        }
    );

    import_table!(
        tx,
        data.smart_lists,
        "INSERT INTO smart_lists (uuid,profile_id,name,rules,created_at,updated_at) ",
        |b, item| {
            b.push_bind(&item.id)
                .push_bind(&item.profile_id)
                .push_bind(&item.name)
                .push_bind(serde_json::to_string(&item.rules).unwrap())
                .push_bind(&item.created_at)
                .push_bind(&item.updated_at);
        }
    );

    import_table!(
        tx,
        data.saved_filters,
        "INSERT INTO saved_filters (uuid,profile_id,page,name,filters,created_at,updated_at) ",
        |b, item| {
            b.push_bind(&item.id)
                .push_bind(&item.profile_id)
                .push_bind(&item.page)
                .push_bind(&item.name)
                .push_bind(serde_json::to_string(&item.filters).unwrap())
                .push_bind(&item.created_at)
                .push_bind(&item.updated_at);
        }
    );

    tx.commit().await.map_err(ApiError::from)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use tauri::Manager;

    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database::migrations::run_migrations(&pool)
            .await
            .unwrap();
        pool
    }

    async fn table_columns(pool: &SqlitePool, table: &str) -> Vec<String> {
        let mut columns: Vec<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "SELECT name FROM pragma_table_info('{table}')"
        )))
        .fetch_all(pool)
        .await
        .unwrap();
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
            (
                "profiles",
                sorted(vec![
                    "uuid",
                    "name",
                    "avatar",
                    "supabase_user_id",
                    "created_at",
                    "updated_at",
                ]),
            ),
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
                    "status",
                    "created_at",
                    "updated_at",
                ]),
            ),
            (
                "custom_lists",
                sorted(vec![
                    "uuid",
                    "profile_id",
                    "name",
                    "description",
                    "created_at",
                    "updated_at",
                ]),
            ),
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
            (
                "availability_snapshots",
                sorted(vec![
                    "media_id",
                    "media_type",
                    "region",
                    "provider_ids",
                    "checked_at",
                ]),
            ),
        ] {
            assert_eq!(
                table_columns(&pool, table).await,
                expected,
                "{table} gained/lost a column vs its Row struct"
            );
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
            sorted(vec![
                "uuid",
                "profile_id",
                "movie_id",
                "title",
                "poster_path",
                "backdrop_path",
                "watched_at",
                "created_at",
                "updated_at"
            ]),
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
                "note",
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
        assert_eq!(
            table_columns(&pool, "preferences").await,
            sorted(vec!["key", "value", "updated_at"])
        );
        assert_eq!(
            table_columns(&pool, "smart_lists").await,
            sorted(vec![
                "uuid",
                "profile_id",
                "name",
                "rules",
                "created_at",
                "updated_at"
            ]),
        );
        assert_eq!(
            table_columns(&pool, "saved_filters").await,
            sorted(vec![
                "uuid",
                "profile_id",
                "page",
                "name",
                "filters",
                "created_at",
                "updated_at",
            ]),
        );
    }

    #[tokio::test]
    async fn quick_check_reports_healthy_on_a_fresh_database() {
        let pool = migrated_pool().await;
        let (healthy, detail) = quick_check_impl(&pool).await.unwrap();
        assert!(healthy);
        assert_eq!(detail, "ok");
    }

    #[tokio::test]
    async fn exports_and_reimports_library_round_trip() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at)
             VALUES ('l1', 'default', 1, 'movie', 'Round Trip', 'watching', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let exported = export_impl(&pool).await.unwrap();
        assert_eq!(exported.library.len(), 1);

        import_impl(&pool, exported).await.unwrap();

        let library_status: (String,) = sqlx::query_as("SELECT status FROM library_items")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(library_status.0, "watching");
    }

    #[tokio::test]
    async fn export_and_reimport_preserves_the_profiles_supabase_link() {
        let pool = migrated_pool().await;
        sqlx::query("UPDATE profiles SET supabase_user_id = 'user-1' WHERE uuid = 'default'")
            .execute(&pool)
            .await
            .unwrap();

        let exported = export_impl(&pool).await.unwrap();
        assert_eq!(exported.profiles.len(), 1);
        assert_eq!(
            exported.profiles[0].supabase_user_id.as_deref(),
            Some("user-1")
        );

        import_impl(&pool, exported).await.unwrap();

        let supabase_user_id: (Option<String>,) =
            sqlx::query_as("SELECT supabase_user_id FROM profiles WHERE uuid = 'default'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(supabase_user_id.0.as_deref(), Some("user-1"));
    }

    fn library_item(id: &str, media_id: i64, title: &str) -> LibraryItem {
        LibraryItem {
            id: id.to_string(),
            profile_id: "default".to_string(),
            media_id,
            media_type: MediaType::Movie,
            title: title.to_string(),
            poster_path: None,
            backdrop_path: None,
            year: None,
            rating: None,
            genres: Vec::new(),
            status: LibraryStatus::Planned,
            favourite: false,
            user_rating: None,
            notes: None,
            tags: Vec::new(),
            started_at: None,
            completed_at: None,
            rewatch_count: 0,
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            updated_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    #[tokio::test]
    async fn import_preserves_history_uuid_but_not_library_uuid() {
        let pool = migrated_pool().await;
        // export_impl already includes the migration-seeded "default"
        // profile — no need to add another one (that would violate the
        // profiles.uuid UNIQUE constraint on import).
        let mut data = export_impl(&pool).await.unwrap();
        data.library
            .push(library_item("original-library-id", 1, "Test"));
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

        let library_uuid: (String,) = sqlx::query_as("SELECT uuid FROM library_items")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_ne!(library_uuid.0, "original-library-id");

        let history_uuid: (String,) = sqlx::query_as("SELECT uuid FROM activity_log")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(history_uuid.0, "original-history-id");
    }

    #[tokio::test]
    async fn import_batches_a_table_spanning_more_than_one_chunk() {
        let pool = migrated_pool().await;
        let mut data = export_impl(&pool).await.unwrap();
        let row_count = IMPORT_BATCH_SIZE * 2 + 1;
        for index in 0..row_count {
            data.library.push(library_item(
                &format!("l{index}"),
                index as i64,
                &format!("Title {index}"),
            ));
        }

        import_impl(&pool, data).await.unwrap();

        let library_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM library_items")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(library_count.0, row_count as i64);
    }

    #[test]
    fn parse_number_array_parses_a_valid_json_array_of_numbers() {
        assert_eq!(parse_number_array("[1,2,3]"), vec![1, 2, 3]);
    }

    #[test]
    fn parse_number_array_returns_empty_for_non_array_json() {
        assert_eq!(parse_number_array("\"not-an-array\""), Vec::<i64>::new());
        assert_eq!(parse_number_array("not even json"), Vec::<i64>::new());
    }

    #[test]
    fn parse_number_array_filters_out_non_numeric_elements() {
        // Mirrors `tolerates_corrupt_provider_ids_json` in availability.rs:
        // non-number elements are silently dropped rather than failing the
        // whole parse.
        assert_eq!(parse_number_array("[1,\"two\",3,null,4.5]"), vec![1, 3]);
    }

    #[test]
    fn parse_metadata_parses_a_valid_json_string() {
        let parsed = parse_metadata(Some("{\"profileId\":\"default\"}".to_string()));
        assert_eq!(parsed, Some(serde_json::json!({ "profileId": "default" })));
    }

    #[test]
    fn parse_metadata_returns_none_for_invalid_json() {
        assert_eq!(parse_metadata(Some("not json".to_string())), None);
    }

    #[test]
    fn parse_metadata_returns_none_for_none_input() {
        assert_eq!(parse_metadata(None), None);
    }

    /// Inserts one representative row into every one of the 12 exported
    /// tables, exports, spot-checks every `PortableData` field is populated
    /// from its mapping closure (closing the gap where only `library_items`
    /// and `profiles` had non-empty coverage), then feeds the export back
    /// through `import_impl` and confirms each table's row count survives
    /// the round trip (closing the matching `import_table!` macro gap).
    #[tokio::test]
    async fn exports_and_reimports_every_table_with_representative_rows() {
        let pool = migrated_pool().await;

        sqlx::query(
            "INSERT INTO seen_movies (uuid, profile_id, movie_id, title, poster_path, backdrop_path, watched_at, created_at, updated_at)
             VALUES ('sm1', 'default', 10, 'Seen Movie', '/poster.jpg', '/backdrop.jpg', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO episode_progress (uuid, profile_id, series_id, episode_id, season_number, episode_number, watched, watched_at, created_at, updated_at)
             VALUES ('ep1', 'default', 20, 200, 1, 2, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO tracked_series (uuid, profile_id, series_id, title, poster_path, backdrop_path, total_episodes, created_at, updated_at, status)
             VALUES ('ts1', 'default', 20, 'Tracked Series', '/poster.jpg', '/backdrop.jpg', 10, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Returning Series')",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO activity_log (uuid, profile_id, media_id, media_type, title, action, season_number, episode_number, episode_title, metadata, timestamp, created_at, updated_at)
             VALUES ('hist1', 'default', 30, 'movie', 'History Movie', 'movie:watched', NULL, NULL, NULL, '{\"profileId\":\"default\"}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO preferences (key, value, updated_at) VALUES ('theme', '\"dark\"', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, poster_path, backdrop_path, year, rating, genres, status, favourite, user_rating, notes, tags, started_at, completed_at, rewatch_count, created_at, updated_at)
             VALUES ('lib1', 'default', 40, 'movie', 'Library Movie', '/poster.jpg', '/backdrop.jpg', 2020, 7.5, '[\"Action\"]', 'watching', 1, 8.0, 'notes', '[\"tag1\"]', '2026-01-01T00:00:00.000Z', NULL, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, episode_id, season_number, episode_number, note, created_at)
             VALUES ('ve1', 'default', 50, 'movie', 'Viewing Event Movie', 'watched', '2026-01-01T00:00:00.000Z', 120, NULL, NULL, NULL, 'Loved it', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO custom_lists (uuid, profile_id, name, description, created_at, updated_at)
             VALUES ('cl1', 'default', 'My List', 'A list', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO custom_list_items (uuid, list_id, media_id, media_type, title, poster_path, position, added_at, updated_at)
             VALUES ('cli1', 'cl1', 60, 'movie', 'List Item Movie', '/poster.jpg', 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO availability_snapshots (media_id, media_type, region, provider_ids, checked_at)
             VALUES (70, 'movie', 'US', '[8,9]', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO availability_alerts (uuid, profile_id, media_id, media_type, title, region, provider_ids, enabled, created_at, updated_at)
             VALUES ('aa1', 'default', 80, 'movie', 'Alert Movie', 'US', '[8]', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO smart_lists (uuid, profile_id, name, rules, created_at, updated_at)
             VALUES ('sl1', 'default', 'Short horror', '{\"genre\":\"Horror\",\"maxRuntimeMinutes\":100}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO saved_filters (uuid, profile_id, page, name, filters, created_at, updated_at)
             VALUES ('sf1', 'default', 'library', 'Paused shows', '{\"statusFilter\":\"paused\"}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let exported = export_impl(&pool).await.unwrap();

        assert_eq!(exported.seen_movies.len(), 1);
        assert_eq!(exported.seen_movies[0].movie_id, 10);
        assert_eq!(
            exported.seen_movies[0].profile_id.as_deref(),
            Some("default")
        );

        assert_eq!(exported.episode_progress.len(), 1);
        assert_eq!(exported.episode_progress[0].episode_id, 200);
        assert!(exported.episode_progress[0].watched);

        assert_eq!(exported.tracked_series.len(), 1);
        assert_eq!(exported.tracked_series[0].total_episodes, 10);
        assert_eq!(
            exported.tracked_series[0].status.as_deref(),
            Some("Returning Series")
        );

        assert_eq!(exported.history.len(), 1);
        assert_eq!(exported.history[0].action, HistoryAction::MovieWatched);
        assert_eq!(
            exported.history[0]
                .metadata
                .as_ref()
                .and_then(|value| value.get("profileId"))
                .and_then(Value::as_str),
            Some("default")
        );

        assert_eq!(
            exported.preferences.get("theme"),
            Some(&serde_json::json!("dark"))
        );

        assert_eq!(exported.library.len(), 1);
        assert_eq!(exported.library[0].status, LibraryStatus::Watching);
        assert_eq!(exported.library[0].genres, vec!["Action".to_string()]);

        assert_eq!(exported.viewing_events.len(), 1);
        assert_eq!(
            exported.viewing_events[0].event_type,
            ViewingEventType::Watched
        );
        assert_eq!(exported.viewing_events[0].duration_minutes, Some(120));
        assert_eq!(exported.viewing_events[0].note.as_deref(), Some("Loved it"));

        assert_eq!(exported.custom_lists.len(), 1);
        assert_eq!(exported.custom_lists[0].name, "My List");

        assert_eq!(exported.custom_list_items.len(), 1);
        assert_eq!(exported.custom_list_items[0].list_id, "cl1");

        assert_eq!(exported.availability_snapshots.len(), 1);
        assert_eq!(exported.availability_snapshots[0].provider_ids, vec![8, 9]);

        assert_eq!(exported.availability_alerts.len(), 1);
        assert_eq!(exported.availability_alerts[0].provider_ids, vec![8]);

        // Regression check for a real bug: smart_lists/saved_filters were
        // missing from PortableData entirely — both tables are in
        // PROFILE_SCOPED_TABLES, so import_impl's purge already deleted them
        // on every restore, but nothing re-inserted them since they were
        // never exported in the first place. A restore silently wiped every
        // smart list and saved filter a profile had.
        assert_eq!(exported.smart_lists.len(), 1);
        assert_eq!(exported.smart_lists[0].name, "Short horror");
        assert_eq!(exported.saved_filters.len(), 1);
        assert_eq!(exported.saved_filters[0].page, "library");

        import_impl(&pool, exported).await.unwrap();

        for (table, expected_count) in [
            ("seen_movies", 1),
            ("episode_progress", 1),
            ("tracked_series", 1),
            ("activity_log", 1),
            ("preferences", 1),
            ("library_items", 1),
            ("viewing_events", 1),
            ("custom_lists", 1),
            ("custom_list_items", 1),
            ("availability_snapshots", 1),
            ("availability_alerts", 1),
            ("smart_lists", 1),
            ("saved_filters", 1),
        ] {
            let count: (i64,) =
                sqlx::query_as(sqlx::AssertSqlSafe(format!("SELECT COUNT(*) FROM {table}")))
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(count.0, expected_count, "{table} row count after re-import");
        }

        let preference_value: (String,) =
            sqlx::query_as("SELECT value FROM preferences WHERE key = 'theme'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(preference_value.0, "\"dark\"");

        // Regression check for a real bug: viewing_events.note used to be
        // missing from both ViewingEventRow (export) and the import INSERT's
        // column list, so a restore-from-backup (which deletes-then-reinserts
        // every table, see import_impl) silently erased every note ever
        // written the moment someone restored a backup.
        let restored_note: Option<String> =
            sqlx::query_scalar("SELECT note FROM viewing_events WHERE uuid = 've1'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(restored_note.as_deref(), Some("Loved it"));
    }

    /// The `action` column has a schema `CHECK` constraint (see
    /// migrations.rs) restricting it to known history-action strings, so a
    /// plain `INSERT` can never produce the "unknown action" branch in
    /// `export_impl`'s history mapping — only manual DB corruption or an
    /// older schema could. `PRAGMA ignore_check_constraints` bypasses that
    /// constraint for exactly this one connection/insert so the branch can
    /// be exercised directly, then restores it.
    #[tokio::test]
    async fn export_surfaces_an_error_for_an_unknown_history_action_in_the_database() {
        let pool = migrated_pool().await;
        let mut conn = pool.acquire().await.unwrap();

        sqlx::query("PRAGMA ignore_check_constraints = 1")
            .execute(&mut *conn)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO activity_log (uuid, profile_id, media_id, media_type, title, action, timestamp, created_at, updated_at)
             VALUES ('bad-hist', 'default', 1, 'movie', 'Bad', 'not:a:real:action', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&mut *conn)
        .await
        .unwrap();
        sqlx::query("PRAGMA ignore_check_constraints = 0")
            .execute(&mut *conn)
            .await
            .unwrap();
        drop(conn);

        let err = export_impl(&pool).await.unwrap_err();
        assert!(
            err.message.contains("Unknown history action in database"),
            "unexpected error message: {}",
            err.message
        );
    }

    /// Same rationale as the history-action test above, for the
    /// `event_type` `CHECK` constraint on `viewing_events`.
    #[tokio::test]
    async fn export_surfaces_an_error_for_an_unknown_viewing_event_type_in_the_database() {
        let pool = migrated_pool().await;
        let mut conn = pool.acquire().await.unwrap();

        sqlx::query("PRAGMA ignore_check_constraints = 1")
            .execute(&mut *conn)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, created_at)
             VALUES ('bad-ve', 'default', 1, 'movie', 'Bad', 'not-a-real-event-type', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&mut *conn)
        .await
        .unwrap();
        sqlx::query("PRAGMA ignore_check_constraints = 0")
            .execute(&mut *conn)
            .await
            .unwrap();
        drop(conn);

        let err = export_impl(&pool).await.unwrap_err();
        assert!(
            err.message
                .contains("Unknown viewing event type in database"),
            "unexpected error message: {}",
            err.message
        );
    }

    // ------------------------------------------------------------------
    // #[tauri::command] wrapper tests — these three are pure one-line
    // delegations to already-tested `_impl` functions above, so each just
    // needs a minimal happy-path call through a real `tauri::State` (built
    // via `tauri::test::mock_app()`, see profiles.rs's
    // `list_profiles_command_returns_the_default_profile` for the same
    // shape) to close the wrapper-line coverage gap.
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn export_backup_data_command_returns_portable_data() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();
        let data = export_backup_data(state).await.unwrap();
        assert!(!data.profiles.is_empty());
    }

    #[tokio::test]
    async fn import_backup_data_command_reimports_an_exported_snapshot() {
        let pool = migrated_pool().await;
        let data = export_impl(&pool).await.unwrap();

        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();
        let result = import_backup_data(data, state).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn check_data_integrity_command_reports_healthy_on_a_fresh_database() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();
        let check = check_data_integrity(state).await.unwrap();
        assert!(check.healthy);
    }

    #[tokio::test]
    async fn export_skips_a_preference_row_with_a_malformed_json_value() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO preferences (key, value, updated_at) VALUES ('corrupted', 'not-json', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO preferences (key, value, updated_at) VALUES ('theme', '\"light\"', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let exported = export_impl(&pool).await.unwrap();

        assert!(!exported.preferences.contains_key("corrupted"));
        assert_eq!(
            exported.preferences.get("theme"),
            Some(&serde_json::json!("light"))
        );
    }

    /// `import_impl`'s doc comment describes it as an all-or-nothing replace
    /// of the entire database content, purging every table child-first
    /// before inserting the snapshot's rows — but every other test here only
    /// ever imports data that's a superset of (or identical to) what's
    /// already there, via an export/reimport round trip. None of them would
    /// catch a purge-order bug that left stale rows behind. This imports a
    /// snapshot that's strictly *emptier* than the seeded database and
    /// confirms the old rows are actually gone, not just untouched.
    #[tokio::test]
    async fn import_purges_data_absent_from_the_imported_snapshot() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, created_at, updated_at)
             VALUES ('stale', 'default', 1, 'movie', 'Stale', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO custom_lists (uuid, profile_id, name, created_at, updated_at)
             VALUES ('stale-list', 'default', 'Stale List', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let empty_pool = migrated_pool().await;
        let empty_snapshot = export_impl(&empty_pool).await.unwrap();
        assert!(empty_snapshot.library.is_empty());
        assert!(empty_snapshot.custom_lists.is_empty());

        import_impl(&pool, empty_snapshot).await.unwrap();

        let library_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM library_items")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(
            library_count.0, 0,
            "stale library item should have been purged"
        );

        let list_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM custom_lists")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(list_count.0, 0, "stale custom list should have been purged");
    }

    // ------------------------------------------------------------------
    // Custom backup-location file I/O — plain `std::fs` against a real,
    // uniquely-named temp directory (no SQLite involved, so no
    // `migrated_pool()` needed). Each test gets its own subdirectory of
    // `std::env::temp_dir()` (named with `new_uuid()`) so parallel test
    // threads never collide on the same files.
    // ------------------------------------------------------------------

    fn temp_test_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "cinetrack-backup-test-{}",
            crate::database::new_uuid()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test]
    async fn write_backup_to_path_then_read_backup_from_path_round_trips_the_contents() {
        let dir = temp_test_dir();
        let path = dir.join("backup.json").to_str().unwrap().to_string();

        write_backup_to_path(path.clone(), "{\"hello\":\"world\"}".to_string())
            .await
            .unwrap();

        let read_back = read_backup_from_path(path).await.unwrap();
        assert_eq!(read_back.as_deref(), Some("{\"hello\":\"world\"}"));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn write_backup_to_path_creates_missing_parent_directories() {
        let dir = temp_test_dir();
        let nested = dir.join("nested").join("backups").join("backup.json");
        let path = nested.to_str().unwrap().to_string();

        write_backup_to_path(path.clone(), "content".to_string())
            .await
            .unwrap();

        assert!(nested.exists());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn write_backup_to_path_never_corrupts_a_previous_backup_when_the_write_fails() {
        // Simulates a mid-write crash: point `path` at a directory instead of
        // a regular file, so the final `std::fs::rename` step fails, and
        // confirm only the `.tmp` sibling exists — the (nonexistent) target
        // is never partially written.
        let dir = temp_test_dir();
        let target_as_directory = dir.join("backup.json");
        std::fs::create_dir_all(&target_as_directory).unwrap();
        let path = target_as_directory.to_str().unwrap().to_string();

        let result = write_backup_to_path(path, "content".to_string()).await;
        assert!(result.is_err());

        let tmp_path = dir.join("backup.json.tmp");
        assert!(tmp_path.exists(), "the atomic tmp file should still exist");
        assert!(
            target_as_directory.is_dir(),
            "the failed rename must never touch the original target"
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn read_backup_from_path_returns_none_for_a_missing_file() {
        let dir = temp_test_dir();
        let path = dir.join("missing.json").to_str().unwrap().to_string();

        let result = read_backup_from_path(path).await.unwrap();
        assert_eq!(result, None);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn list_backup_directory_lists_only_files_directly_inside_the_directory() {
        let dir = temp_test_dir();
        std::fs::write(dir.join("auto-1.json"), "{}").unwrap();
        std::fs::write(dir.join("auto-2.json"), "{}").unwrap();
        std::fs::create_dir_all(dir.join("a-subdirectory")).unwrap();

        let mut names = list_backup_directory(dir.to_str().unwrap().to_string())
            .await
            .unwrap();
        names.sort();

        assert_eq!(
            names,
            vec!["auto-1.json".to_string(), "auto-2.json".to_string()]
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn list_backup_directory_returns_an_empty_list_for_a_directory_that_does_not_exist() {
        let dir = temp_test_dir();
        let missing = dir.join("never-created");

        let names = list_backup_directory(missing.to_str().unwrap().to_string())
            .await
            .unwrap();
        assert!(names.is_empty());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn remove_backup_file_deletes_an_existing_file() {
        let dir = temp_test_dir();
        let path = dir.join("to-remove.json");
        std::fs::write(&path, "{}").unwrap();

        remove_backup_file(path.to_str().unwrap().to_string())
            .await
            .unwrap();
        assert!(!path.exists());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn remove_backup_file_is_a_no_op_for_a_file_that_is_already_gone() {
        let dir = temp_test_dir();
        let path = dir.join("already-gone.json");

        // Never created — must not error, matching the idempotent-removal
        // contract callers (pruneOldAutoBackups) rely on.
        remove_backup_file(path.to_str().unwrap().to_string())
            .await
            .unwrap();

        std::fs::remove_dir_all(&dir).ok();
    }
}
