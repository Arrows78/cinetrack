//! What the statistics count: the *current state* of what the viewer has seen.
//!
//! The viewing-event log is append-only, but every statistic describes the
//! present state of the viewing, never the history of toggles:
//!
//! - a title (a movie, or one episode) is **seen** when its latest event is a
//!   `watched` or `rewatched`; a title whose latest event is an `unwatched`
//!   is in no statistic at all (overview, monthly and yearly activity, recap,
//!   streaks, heatmap, binge day, pace forecast, milestones, rating averages,
//!   "on this day", the year summary);
//! - a watch -> unwatch -> watch cycle is **one** watch, dated at the last
//!   active watch (the unwatch cancelled the first one for good);
//! - a `rewatched` event is an additional viewing of a title that stays seen.
//!   It never adds to the per-title counts above (a title is one watch no
//!   matter how often it was revisited) — it feeds the rewatch statistics
//!   only — and an `unwatched` cancels the rewatches logged before it, like
//!   it cancels the watch.
//!
//! The SQL half of that definition is `active_events_cte!` (queries/mod.rs);
//! this module runs it and hands the rows to the Rust-side bucketing, which
//! needs the viewer's time zone and so cannot be expressed in SQLite.

use sqlx::SqlitePool;

use super::viewing_events::ViewingEventRow;
use crate::error::ApiError;

/// One row per seen movie/episode: its counted watch (see
/// `active_events_cte!`), oldest first. `from` is inclusive and `until`
/// exclusive, both ISO instants compared on `watched_at`; `None` leaves that
/// side open.
pub(in crate::stats) async fn fetch_counted_watches(
    pool: &SqlitePool,
    profile_id: &str,
    from: Option<&str>,
    until: Option<&str>,
) -> Result<Vec<ViewingEventRow>, ApiError> {
    sqlx::query_as(concat!(
        active_events_cte!(),
        " SELECT uuid, media_id, media_type, title, event_type, watched_at, duration_minutes,
                 episode_id, season_number, episode_number
          FROM counted
          WHERE rk = 1
            AND ($2 IS NULL OR watched_at >= $2)
            AND ($3 IS NULL OR watched_at < $3)
          ORDER BY watched_at ASC, uuid ASC"
    ))
    .bind(profile_id)
    .bind(from)
    .bind(until)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)
}

/// Every `rewatched` event still standing (not cancelled by a later
/// `unwatched`), oldest first.
pub(in crate::stats) async fn fetch_active_rewatches(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<Vec<ViewingEventRow>, ApiError> {
    sqlx::query_as(concat!(
        active_events_cte!(),
        " SELECT uuid, media_id, media_type, title, event_type, watched_at, duration_minutes,
                 episode_id, season_number, episode_number
          FROM active
          WHERE event_type = 'rewatched'
          ORDER BY watched_at ASC, uuid ASC"
    ))
    .bind(profile_id)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)
}
