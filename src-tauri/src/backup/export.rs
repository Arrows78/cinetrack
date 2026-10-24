//! Backup export: every table read in full, in one transaction, and mapped to
//! the portable DTOs. Each table is read independent of the other command
//! modules' own (profile-scoped) queries, matching how the original
//! portable-data-export.ts never reused library-repository.ts's queries
//! either.

use serde_json::Value;
use sqlx::SqlitePool;

use super::PortableData;
use super::repository::SeenMovie;
use crate::availability::{AlertRow, AvailabilityAlert, AvailabilitySnapshot, SnapshotRow};
use crate::database::DEFAULT_PROFILE_ID;
use crate::error::ApiError;
use crate::history::{HistoryAction, HistoryRow, ViewingHistoryItem};
use crate::library::{LibraryItem, LibraryRow, LibraryStatus, LibraryStatusOrigin};
use crate::lists::custom::{CustomList, CustomListItem, CustomListItemRow, CustomListRow};
use crate::lists::saved_filters::{SavedFilter, SavedFilterRow};
use crate::lists::smart::{SmartList, SmartListRow};
use crate::models::MediaType;
use crate::profiles::{ProfileRow, UserProfile};
use crate::progress::{EpisodeProgress, TrackedSeriesItem};
use crate::recommendations::DismissedRecommendationRow;
use crate::stats::{ViewingEvent, ViewingEventType};

pub(super) fn parse_number_array(raw: &str) -> Vec<i64> {
    let Ok(Value::Array(values)) = serde_json::from_str::<Value>(raw) else {
        return Vec::new();
    };
    values
        .into_iter()
        .filter_map(|value| value.as_i64())
        .collect()
}

pub(super) fn parse_metadata(raw: Option<String>) -> Option<Value> {
    raw.and_then(|value| serde_json::from_str(&value).ok())
}

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

// "Fetch every row of a table, mapped by sqlx::FromRow" is the shape repeated
// once per table below. A declarative macro was chosen over a trait +
// `Box<dyn Trait>` dispatch because the 15-table set is fixed at compile
// time, never an open set discovered at runtime, so there's nothing to gain
// from erasing each table's concrete Row/domain type behind a trait object.
//
// Per-table *conversion* logic (Row -> domain type) stays written out by
// hand in export_impl: those differ enough table-to-table (preserved id,
// JSON-encoded columns, fallible enum parsing, computed defaults) that
// folding them into the macro too would trade a readable, greppable
// per-table block for a harder-to-audit indirection, on the single most
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

pub(super) async fn export_impl(pool: &SqlitePool) -> Result<PortableData, ApiError> {
    // All 15 reads share one transaction so the export is a single logical
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

    // A profile locked by a PIN (other than the active one) stays out of the file.
    let withheld = super::scope::withheld_profile_ids(&mut tx).await?;

    tx.commit().await.map_err(ApiError::from)?;

    let mut preferences_map = serde_json::Map::new();
    for row in preferences {
        if let Ok(value) = serde_json::from_str(&row.value) {
            preferences_map.insert(row.key, value);
        }
    }

    let mut data = PortableData {
        seen_movies: seen_movies
            .into_iter()
            .map(|row| SeenMovie {
                profile_id: Some(
                    row.profile_id
                        .unwrap_or_else(|| DEFAULT_PROFILE_ID.to_string()),
                ),
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
                profile_id: Some(
                    row.profile_id
                        .unwrap_or_else(|| DEFAULT_PROFILE_ID.to_string()),
                ),
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
                profile_id: Some(
                    row.profile_id
                        .unwrap_or_else(|| DEFAULT_PROFILE_ID.to_string()),
                ),
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
    };
    data.drop_profiles(&withheld);
    Ok(data)
}
