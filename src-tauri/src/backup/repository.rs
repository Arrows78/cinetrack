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
use crate::database::new_uuid;
use crate::error::ApiError;
use crate::history::{HistoryAction, HistoryRow, ViewingHistoryItem};
use crate::library::{LibraryItem, LibraryRow, LibraryStatus, LibraryStatusOrigin};
use crate::lists::custom::{CustomList, CustomListItem, CustomListItemRow, CustomListRow};
use crate::lists::saved_filters::{SavedFilter, SavedFilterRow};
use crate::lists::smart::{SmartList, SmartListRow};
use crate::models::MediaType;
use crate::profiles::{ProfileRow, UserProfile};
use crate::progress::{EpisodeProgress, TrackedSeriesItem};
use crate::recommendations::{DismissedRecommendation, DismissedRecommendationRow};
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
    pub dismissed_recommendations: Vec<DismissedRecommendation>,
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
    rating: Option<i64>,
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

/// `activity_log` as exported: the history DTO has no `profile_id` field (the
/// owner travels as `metadata.profileId`), so the column is read next to the
/// regular row to write it back into that mirror.
#[derive(sqlx::FromRow)]
struct HistoryExportRow {
    profile_id: String,
    #[sqlx(flatten)]
    row: HistoryRow,
}

/// `metadata.profileId` must name the row's real owner: rows that came from a
/// sync pull or from an older build can have no metadata at all, or one
/// naming another profile, and `import_impl` rebuilds `profile_id` from this
/// key (defaulting to the `default` profile).
fn metadata_owned_by(raw: Option<String>, profile_id: &str) -> Option<Value> {
    let mut metadata = match parse_metadata(raw) {
        Some(Value::Object(map)) => map,
        _ => serde_json::Map::new(),
    };
    metadata.insert(
        "profileId".to_string(),
        Value::String(profile_id.to_string()),
    );
    Some(Value::Object(metadata))
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
    insert_seq: i64,
}

// ---------------------------------------------------------------------
// Per-table macros — replace the shape repeated once per table below:
// in export_impl, "fetch every row of a table, mapped by sqlx::FromRow";
// in import_impl, "chunk rows into IMPORT_BATCH_SIZE, build a multi-row
// INSERT via QueryBuilder, execute". A declarative macro was chosen over
// a trait + `Box<dyn Trait>` dispatch because the 13-table set is fixed
// at compile time, never an open set discovered at runtime, so there's
// nothing to gain from erasing each table's concrete Row/domain type
// behind a trait object — a macro expands to exactly the hand-written
// fetch/insert code, just without retyping the surrounding scaffolding
// for every table.
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
/// already-open transaction `$tx`.
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
    // All 14 reads share one transaction so the export is a single logical
    // snapshot — without this, a write landing between two of these
    // `SELECT *` calls (e.g. a movie marked watched right as the export
    // reaches viewing_events) could produce a backup mixing state from two
    // different instants (a library entry not yet updated by the time
    // history reflects it, or vice versa).
    let mut tx = pool.begin().await.map_err(ApiError::from)?;

    let seen_movies = export_table!(tx, "seen_movies", SeenMovieRow);
    let episode_progress = export_table!(tx, "episode_progress", EpisodeProgressRow);
    let tracked_series = export_table!(tx, "tracked_series", TrackedSeriesRow);
    let history = export_table!(tx, "activity_log", HistoryExportRow);
    let preferences = export_table!(tx, "preferences", PreferenceRow);
    let library = export_table!(tx, "library_items", LibraryRow);
    let mut viewing_events = export_table!(tx, "viewing_events", ViewingEventRow);
    // In log order, so the file reads in the order things happened.
    viewing_events.sort_by_key(|row| row.insert_seq);
    let profiles = export_table!(tx, "profiles", ProfileRow);
    let custom_lists = export_table!(tx, "custom_lists", CustomListRow);
    let custom_list_items = export_table!(tx, "custom_list_items", CustomListItemRow);
    let availability_snapshots = export_table!(tx, "availability_snapshots", SnapshotRow);
    let availability_alerts = export_table!(tx, "availability_alerts", AlertRow);
    let smart_lists = export_table!(tx, "smart_lists", SmartListRow);
    let saved_filters = export_table!(tx, "saved_filters", SavedFilterRow);
    let dismissed_recommendations =
        export_table!(tx, "dismissed_recommendations", DismissedRecommendationRow);

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
                rating: row.rating,
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
            .map(|export_row| -> Result<ViewingHistoryItem, ApiError> {
                let HistoryExportRow { profile_id, row } = export_row;
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
                    metadata: metadata_owned_by(row.metadata, &profile_id),
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
                    status_origin: Some(LibraryStatusOrigin::from_db_str(&row.status_origin)?),
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
                    insert_seq: Some(row.insert_seq),
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
                // A PIN lock is a per-device convenience, not something a
                // portable backup file should carry (restoring on another
                // device shouldn't silently re-lock a profile, and the
                // hash/salt themselves never leave the backend regardless —
                // see profiles/models.rs's doc comment on UserProfile).
                has_pin: false,
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
        dismissed_recommendations: dismissed_recommendations
            .into_iter()
            .map(Into::into)
            .collect(),
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

/// The events in the order they were originally logged in: by the position
/// the export recorded, or — for a backup from before events carried one, or
/// a file that lost it — by date, which is the order such events were read in.
fn events_in_log_order(mut events: Vec<ViewingEvent>) -> Vec<ViewingEvent> {
    if events.iter().all(|event| event.insert_seq.is_some()) {
        events.sort_by_key(|event| event.insert_seq);
    } else {
        events.sort_by(|a, b| a.watched_at.cmp(&b.watched_at));
    }
    events
}

/// Rewrites a readable instant to the canonical stored form (RFC 3339 UTC,
/// millis) so string comparisons in SQL order it correctly. An unreadable one
/// is left as it was: only the viewing log refuses those.
fn canonicalize_in_place(value: &mut String) {
    if let Ok(canonical) = crate::database::canonical_instant(value) {
        *value = canonical;
    }
}

pub(super) async fn import_impl(pool: &SqlitePool, mut data: PortableData) -> Result<(), ApiError> {
    // One unreadable date in the log would make every statistic fail once the
    // restore has replaced the database, so such a file is refused up front.
    // The dates are stored in canonical form (SQL compares them as strings).
    for event in &mut data.viewing_events {
        event.watched_at = crate::database::canonical_instant(&event.watched_at)?;
    }
    for movie in &mut data.seen_movies {
        canonicalize_in_place(&mut movie.watched_at);
    }
    for episode in &mut data.episode_progress {
        if let Some(watched_at) = episode.watched_at.as_mut() {
            canonicalize_in_place(watched_at);
        }
    }
    let mut tx = pool.begin().await.map_err(ApiError::from)?;

    // The export never carries a PIN (hash and salt are device secrets), so
    // the purge below would unlock every profile. A profile whose uuid is
    // already in the database is the same person on the same device: its PIN
    // is read here and put back after the profiles are re-inserted. A
    // profile absent before the restore (another device) arrives unlocked.
    let existing_pins: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT uuid, pin_hash, pin_salt FROM profiles WHERE pin_hash IS NOT NULL AND pin_salt IS NOT NULL",
    )
    .fetch_all(&mut *tx)
    .await
    .map_err(ApiError::from)?;

    // Same reasoning for the cloud account link: a profile already in this
    // database keeps the link it has here (set or not), whatever the file says.
    let existing_links: Vec<(String, Option<String>)> =
        sqlx::query_as("SELECT uuid, supabase_user_id FROM profiles")
            .fetch_all(&mut *tx)
            .await
            .map_err(ApiError::from)?;

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

    for (uuid, pin_hash, pin_salt) in &existing_pins {
        // Matches nothing when the backup has no such profile.
        sqlx::query("UPDATE profiles SET pin_hash = $1, pin_salt = $2 WHERE uuid = $3")
            .bind(pin_hash)
            .bind(pin_salt)
            .bind(uuid)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from)?;
    }

    for (uuid, supabase_user_id) in &existing_links {
        // Matches nothing when the backup has no such profile.
        sqlx::query("UPDATE profiles SET supabase_user_id = $1 WHERE uuid = $2")
            .bind(supabase_user_id)
            .bind(uuid)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from)?;
    }

    // The purge above emptied the outbox and the per-entity sync state (they
    // cascade with the profiles), but not these: a kept cursor or bootstrap
    // flag would tell the next sync the restored rows are already known to
    // the cloud. Without them, it pulls from the start and reseeds.
    sqlx::query("DELETE FROM sync_metadata WHERE key LIKE 'cursor:%' OR key LIKE 'bootstrap:%'")
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;

    // Preferences go through the same rules as a write: an invalid value is
    // dropped (the default applies), and an active profile the restore does
    // not bring back falls back to the default one rather than breaking every
    // later write scoped to it.
    let mut preferences = crate::preferences::sanitize_imported(&data.preferences);
    let active_is_restored = preferences
        .get("activeProfileId")
        .and_then(Value::as_str)
        .is_none_or(|active| data.profiles.iter().any(|profile| profile.id == active));
    if !active_is_restored {
        preferences.remove("activeProfileId");
        if !data.profiles.iter().any(|profile| profile.id == "default")
            && let Some(first) = data.profiles.first()
        {
            preferences.insert(
                "activeProfileId".to_string(),
                Value::String(first.id.clone()),
            );
        }
    }

    let now = crate::database::now_iso(&mut *tx).await?;
    for (key, value) in &preferences {
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
              (uuid,profile_id,series_id,episode_id,season_number,episode_number,watched,watched_at,created_at,updated_at,rating) ",
        |b, item| {
            b.push_bind(new_uuid())
                .push_bind(item.profile_id.clone().unwrap_or_else(|| "default".to_string()))
                .push_bind(item.series_id)
                .push_bind(item.episode_id)
                .push_bind(item.season_number)
                .push_bind(item.episode_number)
                .push_bind(item.watched)
                .push_bind(item.watched_at.clone())
                .push_bind(&item.created_at)
                .push_bind(&item.updated_at)
                .push_bind(item.rating);
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
                .push_bind(&item.created_at)
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
              (uuid,profile_id,media_id,media_type,title,poster_path,backdrop_path,year,rating,genres,status,favourite,user_rating,notes,tags,started_at,completed_at,rewatch_count,created_at,updated_at,status_origin) ",
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
                .push_bind(&item.updated_at)
                .push_bind(item.status_origin.unwrap_or_default().as_db_str());
        }
    );

    // The order events were logged in decides which one is a title's latest
    // (see `viewing_events.insert_seq`), and the database numbers rows in the
    // order they are inserted — so replay them in the order they were logged.
    let viewing_events = events_in_log_order(data.viewing_events.clone());
    import_table!(
        tx,
        viewing_events,
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
                .push_bind(&item.updated_at);
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

    import_table!(
        tx,
        data.dismissed_recommendations,
        "INSERT INTO dismissed_recommendations (uuid,profile_id,media_id,media_type,title,poster_path,dismissed_at,created_at,updated_at) ",
        |b, item| {
            b.push_bind(&item.id)
                .push_bind(&item.profile_id)
                .push_bind(item.media_id)
                .push_bind(item.media_type.as_db_str())
                .push_bind(&item.title)
                .push_bind(&item.poster_path)
                .push_bind(&item.dismissed_at)
                .push_bind(&item.created_at)
                .push_bind(&item.updated_at);
        }
    );

    tx.commit().await.map_err(ApiError::from)?;
    Ok(())
}

#[cfg(test)]
mod tests;
