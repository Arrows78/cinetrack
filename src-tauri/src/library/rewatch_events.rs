//! `rewatched` viewing events, written from the two places a rewatch happens:
//! the viewer explicitly watching an already-seen movie again
//! (`progress::rewatch_movie`) and the library editor's rewatch count going
//! up. A rewatch is never guessed from the history.
//!
//! The rules, shared by both writers and read by the rewatch statistics (see
//! `stats/queries/active_events.rs` for the current-state rule they sit under):
//!
//! - only a title that is currently seen can be rewatched — a counter set on
//!   a title that is not seen changes the counter and nothing else, so it can
//!   never make a title look seen in the statistics;
//! - a movie's rewatches are cancelled by unwatching it (and its counter goes
//!   back to 0, see `progress::toggle_movie_seen_with_note_impl`); a series'
//!   rewatches are title-level events (no episode) that only the counter
//!   writes, and only lowering the counter takes back;
//! - raising the counter by N logs N events dated now; lowering it by N
//!   deletes the N most recent rewatch events of the title; saving the same
//!   value again writes nothing.

use sqlx::{Sqlite, Transaction};

use crate::database::new_uuid;
use crate::error::ApiError;
use crate::models::MediaType;

/// Raising the counter in the editor can type any number; this bounds how
/// many events one save writes.
const MAX_EVENTS_PER_SAVE: i64 = 100;

/// Is the title currently seen: a movie in `seen_movies`, or a series with at
/// least one watched episode.
pub(crate) async fn title_is_seen(
    tx: &mut Transaction<'_, Sqlite>,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
) -> Result<bool, ApiError> {
    let sql = match media_type {
        MediaType::Movie => {
            "SELECT EXISTS(SELECT 1 FROM seen_movies WHERE profile_id = $1 AND movie_id = $2)"
        }
        MediaType::Series => {
            "SELECT EXISTS(SELECT 1 FROM episode_progress WHERE profile_id = $1 AND series_id = $2 AND watched = 1)"
        }
    };
    sqlx::query_scalar(sql)
        .bind(profile_id)
        .bind(media_id)
        .fetch_one(&mut **tx)
        .await
        .map_err(ApiError::from)
}

/// Appends one `rewatched` event for the title itself (no episode).
#[allow(clippy::too_many_arguments)]
pub(crate) async fn insert_rewatch_event(
    tx: &mut Transaction<'_, Sqlite>,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
    title: &str,
    duration_minutes: Option<i64>,
    watched_at: &str,
    note: Option<&str>,
) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, episode_id, season_number, episode_number, note, created_at)
         VALUES ($1,$2,$3,$4,$5,'rewatched',$6,$7,NULL,NULL,NULL,$8,$6)",
    )
    .bind(new_uuid())
    .bind(profile_id)
    .bind(media_id)
    .bind(media_type.as_db_str())
    .bind(title)
    .bind(watched_at)
    .bind(duration_minutes)
    .bind(note)
    .execute(&mut **tx)
    .await
    .map_err(ApiError::from)?;
    Ok(())
}

/// Brings the title's rewatch events in line with a change of the library
/// editor's rewatch count from `previous` to `new` (see the module doc). Run
/// inside the same transaction as the library write that changed the count.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn apply_counter_change(
    tx: &mut Transaction<'_, Sqlite>,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
    title: &str,
    previous: i64,
    new: i64,
    now: &str,
) -> Result<(), ApiError> {
    if new > previous {
        if !title_is_seen(tx, profile_id, media_id, media_type).await? {
            return Ok(());
        }
        // A movie's rewatch lasts as long as its watch did; a series has no
        // single runtime.
        let duration: Option<i64> = match media_type {
            MediaType::Movie => sqlx::query_scalar(
                "SELECT duration_minutes FROM viewing_events
                 WHERE profile_id = $1 AND media_id = $2 AND media_type = 'movie'
                   AND event_type = 'watched'
                 ORDER BY insert_seq DESC LIMIT 1",
            )
            .bind(profile_id)
            .bind(media_id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(ApiError::from)?
            .flatten(),
            MediaType::Series => None,
        };
        for _ in 0..(new - previous).min(MAX_EVENTS_PER_SAVE) {
            insert_rewatch_event(
                tx, profile_id, media_id, media_type, title, duration, now, None,
            )
            .await?;
        }
    } else if new < previous {
        sqlx::query(
            "DELETE FROM viewing_events WHERE uuid IN (
               SELECT uuid FROM viewing_events
               WHERE profile_id = $1 AND media_id = $2 AND media_type = $3
                 AND event_type = 'rewatched' AND episode_id IS NULL
               ORDER BY insert_seq DESC LIMIT $4
             )",
        )
        .bind(profile_id)
        .bind(media_id)
        .bind(media_type.as_db_str())
        .bind(previous - new)
        .execute(&mut **tx)
        .await
        .map_err(ApiError::from)?;
    }
    Ok(())
}
