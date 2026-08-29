use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::ApiError;
use crate::models::MediaType;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ViewingEventType {
    Watched,
    Unwatched,
    Rewatched,
}

impl ViewingEventType {
    pub(crate) fn as_db_str(self) -> &'static str {
        match self {
            ViewingEventType::Watched => "watched",
            ViewingEventType::Unwatched => "unwatched",
            ViewingEventType::Rewatched => "rewatched",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewingEvent {
    pub id: String,
    pub profile_id: String,
    pub media_id: i64,
    pub media_type: MediaType,
    pub title: String,
    pub event_type: ViewingEventType,
    pub watched_at: String,
    pub duration_minutes: Option<i64>,
    pub episode_id: Option<i64>,
    pub season_number: Option<i64>,
    pub episode_number: Option<i64>,
    /// Only ever populated by backup.rs's export (a plain `SELECT *`, which
    /// picks up the column for free) — `list_viewing_events_since_impl`
    /// below never selects it, since nothing consuming *that* endpoint
    /// (stats/wrapped aggregation) needs it. `#[serde(default)]` so
    /// importing a pre-this-field backup (no `note` key at all in its JSON)
    /// deserializes as `None` instead of failing.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(sqlx::FromRow)]
pub(in crate::stats) struct ViewingEventRow {
    pub(in crate::stats) uuid: String,
    pub(in crate::stats) media_id: i64,
    pub(in crate::stats) media_type: String,
    pub(in crate::stats) title: String,
    pub(in crate::stats) event_type: String,
    pub(in crate::stats) watched_at: String,
    pub(in crate::stats) duration_minutes: Option<i64>,
    pub(in crate::stats) episode_id: Option<i64>,
    pub(in crate::stats) season_number: Option<i64>,
    pub(in crate::stats) episode_number: Option<i64>,
}

impl ViewingEventRow {
    pub(in crate::stats) fn into_event(self, profile_id: &str) -> Result<ViewingEvent, ApiError> {
        let event_type = match self.event_type.as_str() {
            "watched" => ViewingEventType::Watched,
            "unwatched" => ViewingEventType::Unwatched,
            "rewatched" => ViewingEventType::Rewatched,
            other => {
                return Err(ApiError::internal(format!(
                    "Unknown viewing event type in database: {other}"
                )));
            }
        };

        Ok(ViewingEvent {
            id: self.uuid,
            profile_id: profile_id.to_string(),
            media_id: self.media_id,
            media_type: MediaType::from_db_str(&self.media_type),
            title: self.title,
            event_type,
            watched_at: self.watched_at,
            duration_minutes: self.duration_minutes,
            episode_id: self.episode_id,
            season_number: self.season_number,
            episode_number: self.episode_number,
            // This query never selects `note` — see `ViewingEvent::note`'s
            // doc comment.
            note: None,
        })
    }
}

pub(in crate::stats) async fn list_viewing_events_since_impl(
    pool: &SqlitePool,
    profile_id: &str,
    since: &str,
) -> Result<Vec<ViewingEvent>, ApiError> {
    let rows: Vec<ViewingEventRow> = sqlx::query_as(
        "SELECT uuid, media_id, media_type, title, event_type, watched_at, duration_minutes, episode_id, season_number, episode_number
         FROM viewing_events WHERE profile_id = $1 AND watched_at >= $2",
    )
    .bind(profile_id)
    .bind(since)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    rows.into_iter()
        .map(|row| row.into_event(profile_id))
        .collect()
}

pub(in crate::stats) async fn list_viewing_events_for_year_impl(
    pool: &SqlitePool,
    profile_id: &str,
    range_start: &str,
    range_end: &str,
) -> Result<Vec<ViewingEvent>, ApiError> {
    let rows: Vec<ViewingEventRow> = sqlx::query_as(
        "SELECT uuid, media_id, media_type, title, event_type, watched_at, duration_minutes, episode_id, season_number, episode_number
         FROM viewing_events WHERE profile_id = $1 AND watched_at >= $2 AND watched_at < $3",
    )
    .bind(profile_id)
    .bind(range_start)
    .bind(range_end)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    rows.into_iter()
        .map(|row| row.into_event(profile_id))
        .collect()
}

/// Powers the opt-in "On this day" Home card: every `watched`/`rewatched`
/// event whose `watched_at` falls on the same month-day as `today` in a
/// strictly earlier year — never the current year, never a future one —
/// most recent year first. `today` is an ISO instant computed client-side
/// (mirroring how `list_viewing_events_for_year`'s range bounds above are
/// computed client-side) rather than read from SQLite's own `now()`, so this
/// stays deterministically testable and immune to whatever timezone the
/// SQLite build happens to be running under.
pub(in crate::stats) async fn list_on_this_day_events_impl(
    pool: &SqlitePool,
    profile_id: &str,
    today: &str,
) -> Result<Vec<ViewingEvent>, ApiError> {
    let rows: Vec<ViewingEventRow> = sqlx::query_as(
        "SELECT uuid, media_id, media_type, title, event_type, watched_at, duration_minutes, episode_id, season_number, episode_number
         FROM viewing_events
         WHERE profile_id = $1
           AND event_type IN ('watched','rewatched')
           AND strftime('%m-%d', watched_at) = strftime('%m-%d', $2)
           AND strftime('%Y', watched_at) < strftime('%Y', $2)
         ORDER BY watched_at DESC",
    )
    .bind(profile_id)
    .bind(today)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    rows.into_iter()
        .map(|row| row.into_event(profile_id))
        .collect()
}

/// A single title's own viewing history, notes included — deliberately a
/// separate type from `ViewingEvent` above rather than that struct plus a
/// `note` field: `ViewingEvent` is also constructed by backup.rs's
/// export/import round trip (see `ViewingEvent { .. }` there), and giving it
/// a new required field would force edits to that unrelated, actively
/// changing file for a column those code paths never need to touch (a
/// backup round-trips `note` fine as-is, via `SELECT *`/`INSERT ... note`
/// there once that file's own column list picks it up independently). This
/// type exists purely to answer "what did I write about media X across all
/// my past watches", scoped to one (media_id, media_type).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewingEventNote {
    pub id: String,
    pub event_type: ViewingEventType,
    pub watched_at: String,
    pub episode_id: Option<i64>,
    pub season_number: Option<i64>,
    pub episode_number: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(sqlx::FromRow)]
struct ViewingEventNoteRow {
    uuid: String,
    event_type: String,
    watched_at: String,
    episode_id: Option<i64>,
    season_number: Option<i64>,
    episode_number: Option<i64>,
    note: Option<String>,
}

pub(in crate::stats) async fn list_viewing_events_for_media_impl(
    pool: &SqlitePool,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
) -> Result<Vec<ViewingEventNote>, ApiError> {
    let rows: Vec<ViewingEventNoteRow> = sqlx::query_as(
        "SELECT uuid, event_type, watched_at, episode_id, season_number, episode_number, note
         FROM viewing_events
         WHERE profile_id = $1 AND media_id = $2 AND media_type = $3
         ORDER BY watched_at DESC",
    )
    .bind(profile_id)
    .bind(media_id)
    .bind(media_type.as_db_str())
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    rows.into_iter()
        .map(|row| -> Result<ViewingEventNote, ApiError> {
            let event_type = match row.event_type.as_str() {
                "watched" => ViewingEventType::Watched,
                "unwatched" => ViewingEventType::Unwatched,
                "rewatched" => ViewingEventType::Rewatched,
                other => {
                    return Err(ApiError::internal(format!(
                        "Unknown viewing event type in database: {other}"
                    )));
                }
            };
            Ok(ViewingEventNote {
                id: row.uuid,
                event_type,
                watched_at: row.watched_at,
                episode_id: row.episode_id,
                season_number: row.season_number,
                episode_number: row.episode_number,
                note: row.note,
            })
        })
        .collect()
}
