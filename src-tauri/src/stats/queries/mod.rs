// The single SQL definition of "what is currently watched" — see
// `active_events` below for the rules. A macro (not a `const`) because sqlx
// wants a `&'static str` literal and `concat!` only accepts literals.
// Defined before the `mod` declarations so every query module can use it.
//
// Bind `$1` = profile id; everything after the CTE chain is the caller's.
//
// - `ordered`: every event of the profile numbered in log order inside its
//   item (`media_id`, `media_type`, `episode_id` — NULL for a movie).
// - `marked`: each event's `cut` = the position of the item's last
//   `unwatched` event (0 when there is none).
// - `active`: events that are still standing — not themselves an
//   `unwatched`, and logged after the item's last `unwatched`. An item is
//   "seen" exactly when it has at least one active event, i.e. when its
//   latest event is a `watched`/`rewatched`.
// - `counted`: one row per seen movie/episode, ranked so `rk = 1` is its
//   counted watch: the latest active `watched` event (the date of the last
//   active watch), or — only for data that has a `rewatched` without any
//   `watched` — the earliest active `rewatched`. Series-level events
//   (episode NULL) never count as a watch of their own.
macro_rules! active_events_cte {
    () => {
        "WITH ordered AS (
           SELECT uuid, media_id, media_type, title, event_type, watched_at, duration_minutes,
                  episode_id, season_number, episode_number,
                  ROW_NUMBER() OVER (
                    PARTITION BY media_id, media_type, episode_id
                    ORDER BY watched_at ASC, created_at ASC, rowid ASC
                  ) AS pos
           FROM viewing_events WHERE profile_id = $1
         ),
         marked AS (
           SELECT *,
                  COALESCE(MAX(CASE WHEN event_type = 'unwatched' THEN pos END) OVER (
                    PARTITION BY media_id, media_type, episode_id
                  ), 0) AS cut
           FROM ordered
         ),
         active AS (
           SELECT * FROM marked WHERE event_type <> 'unwatched' AND pos > cut
         ),
         counted AS (
           SELECT *,
                  ROW_NUMBER() OVER (
                    PARTITION BY media_id, media_type, episode_id
                    ORDER BY (event_type = 'watched') DESC,
                             CASE event_type WHEN 'watched' THEN -pos ELSE pos END ASC
                  ) AS rk
           FROM active
           WHERE media_type = 'movie' OR episode_id IS NOT NULL
         )"
    };
}

pub(super) mod active_events;
pub(super) mod activity;
pub(super) mod forecast;
pub(super) mod library_extras;
pub(super) mod local_time;
pub(super) mod milestones;
pub(super) mod monthly_activity;
pub(super) mod overview;
pub(super) mod ratings;
pub(super) mod recap;
pub(super) mod rewatch;
pub(super) mod viewing_events;
pub(super) mod year_favourite_genre;

pub use viewing_events::{ViewingEvent, ViewingEventNote, ViewingEventType};

// Query modules historically imported their DTOs from `super`. Keep that
// relationship local to the query layer while the canonical DTO definitions
// live in stats/models.rs.
pub(super) use super::models::*;
