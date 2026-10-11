//! Keeps the viewing log's order consistent with the progress tables after a
//! sync.
//!
//! A title is *seen* in the statistics when its latest event, in the order the
//! events were logged in (`viewing_events.insert_seq`), is a watch. On one
//! device that order is the order things happened. Events another device
//! logged arrive in the order the cloud hands them over, which is not the
//! order the local ones were logged in, so two devices holding the very same
//! events can disagree on which is "latest" — and with the progress tables,
//! which the cloud settles row by row, not event by event. The statistics then
//! count a title the tables say is not seen (or the other way round).
//!
//! The tables are what the viewer sees and what the cloud agreed on, so after
//! a pull they win: for a title whose latest event contradicts the tables, the
//! event that matches the tables is moved to the end of the log (a new
//! `insert_seq`, local to this device, never synced).

use sqlx::{Sqlite, Transaction};

use crate::error::ApiError;
use crate::models::MediaType;

/// One movie, or one episode of the series, whose log disagrees with the
/// tables.
#[derive(sqlx::FromRow)]
struct Contradiction {
    episode_id: Option<i64>,
    /// What the tables say.
    seen: bool,
}

/// Brings the events of one title (a movie, or every episode of a series) in
/// line with the progress tables. Idempotent: a title that is already
/// consistent is not touched. Run inside the transaction that applied the
/// pulled changes.
pub(crate) async fn align_event_order_with_progress(
    tx: &mut Transaction<'_, Sqlite>,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
) -> Result<(), ApiError> {
    let contradictions: Vec<Contradiction> = match media_type {
        MediaType::Movie => sqlx::query_as(
            "WITH latest AS (
               SELECT event_type FROM viewing_events
               WHERE profile_id = $1 AND media_id = $2 AND media_type = 'movie'
               ORDER BY insert_seq DESC LIMIT 1
             )
             SELECT NULL AS episode_id, tables.seen AS seen
             FROM latest,
                  (SELECT EXISTS(SELECT 1 FROM seen_movies
                                 WHERE profile_id = $1 AND movie_id = $2) AS seen) tables
             WHERE (latest.event_type <> 'unwatched') <> tables.seen",
        ),
        MediaType::Series => sqlx::query_as(
            "WITH latest AS (
               SELECT episode_id, event_type,
                      ROW_NUMBER() OVER (PARTITION BY episode_id ORDER BY insert_seq DESC) AS rn
               FROM viewing_events
               WHERE profile_id = $1 AND media_id = $2 AND media_type = 'series'
                 AND episode_id IS NOT NULL
             )
             SELECT latest.episode_id AS episode_id,
                    EXISTS(SELECT 1 FROM episode_progress p
                           WHERE p.profile_id = $1 AND p.series_id = $2
                             AND p.episode_id = latest.episode_id AND p.watched = 1) AS seen
             FROM latest
             WHERE latest.rn = 1
               AND (latest.event_type <> 'unwatched') <> EXISTS(
                     SELECT 1 FROM episode_progress p
                     WHERE p.profile_id = $1 AND p.series_id = $2
                       AND p.episode_id = latest.episode_id AND p.watched = 1)",
        ),
    }
    .bind(profile_id)
    .bind(media_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(ApiError::from)?;

    for contradiction in contradictions {
        // The event that says what the tables say: the latest watch of a seen
        // item (a rewatch only when no plain watch exists), the latest
        // unwatch of an item that is not.
        let wanted: &str = if contradiction.seen {
            "event_type IN ('watched', 'rewatched')"
        } else {
            "event_type = 'unwatched'"
        };
        let sql = format!(
            "UPDATE viewing_events
             SET insert_seq = (SELECT MAX(insert_seq) + 1 FROM viewing_events)
             WHERE uuid = (
               SELECT uuid FROM viewing_events
               WHERE profile_id = $1 AND media_id = $2 AND media_type = $3
                 AND episode_id IS $4 AND {wanted}
               ORDER BY (event_type = 'watched') DESC, insert_seq DESC LIMIT 1
             )"
        );
        sqlx::query(sqlx::AssertSqlSafe(sql))
            .bind(profile_id)
            .bind(media_id)
            .bind(media_type.as_db_str())
            .bind(contradiction.episode_id)
            .execute(&mut **tx)
            .await
            .map_err(ApiError::from)?;
    }
    Ok(())
}
