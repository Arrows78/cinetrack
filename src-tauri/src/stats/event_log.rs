//! The one place a row is appended to the `viewing_events` log. Every writer
//! (marking a movie or an episode watched, logging a rewatch, importing) goes
//! through [`insert_viewing_event`] so the column list, the `created_at =
//! watched_at` rule and the event-type spelling cannot drift between copies.

use sqlx::SqliteConnection;

use super::ViewingEventType;
use crate::database::new_uuid;
use crate::error::ApiError;
use crate::models::MediaType;

/// One event to append. `created_at` is always the event's own `watched_at`.
pub(crate) struct NewViewingEvent<'a> {
    pub profile_id: &'a str,
    pub media_id: i64,
    pub media_type: MediaType,
    pub title: &'a str,
    pub event_type: ViewingEventType,
    pub watched_at: &'a str,
    pub duration_minutes: Option<i64>,
    pub episode_id: Option<i64>,
    pub season_number: Option<i64>,
    pub episode_number: Option<i64>,
    pub note: Option<&'a str>,
}

/// Appends `event` to the log under a fresh uuid. Not idempotent by itself:
/// callers check that the state actually changes first (see CLAUDE.md's
/// "Idempotent mutations").
pub(crate) async fn insert_viewing_event(
    conn: &mut SqliteConnection,
    event: &NewViewingEvent<'_>,
) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, episode_id, season_number, episode_number, note, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$7)",
    )
    .bind(new_uuid())
    .bind(event.profile_id)
    .bind(event.media_id)
    .bind(event.media_type.as_db_str())
    .bind(event.title)
    .bind(event.event_type.as_db_str())
    .bind(event.watched_at)
    .bind(event.duration_minutes)
    .bind(event.episode_id)
    .bind(event.season_number)
    .bind(event.episode_number)
    .bind(event.note)
    .execute(conn)
    .await
    .map_err(ApiError::from)?;
    Ok(())
}
