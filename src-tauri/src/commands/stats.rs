use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

use crate::database::current_profile_id;
use crate::error::ApiError;
use crate::models::MediaType;

mod milestones;
mod monthly_activity;
mod overview;
#[cfg(test)]
mod performance;
mod ratings;
mod recap;
mod rewatch;
mod viewing_events;

pub use viewing_events::{ViewingEvent, ViewingEventNote, ViewingEventType};
use viewing_events::{
    list_on_this_day_events_impl, list_viewing_events_for_media_impl,
    list_viewing_events_for_year_impl, list_viewing_events_since_impl,
};
use milestones::get_watch_milestones_impl;
use overview::{get_stats_overview_impl, list_yearly_activity_impl};
use ratings::get_rating_distribution_impl;
use recap::get_monthly_recap_impl;
use rewatch::get_rewatch_stats_impl;
#[cfg(test)]
use viewing_events::ViewingEventRow;

/// Bounded fetch for computations that only need a recent window (current
/// streak, catch-up pace) — avoids pulling a profile's entire lifetime of
/// events for a calculation that never looks further back than `since`.
#[tauri::command]
pub async fn list_recent_viewing_events(
    since: String,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ViewingEvent>, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    list_viewing_events_since_impl(&pool, &profile_id, &since).await
}

/// Bounded fetch for the yearly "wrapped" summary — only ever needs one
/// calendar year's worth of events, not the whole history. `range_start`/
/// `range_end` are ISO instants (end exclusive).
#[tauri::command]
pub async fn list_viewing_events_for_year(
    range_start: String,
    range_end: String,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ViewingEvent>, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    list_viewing_events_for_year_impl(&pool, &profile_id, &range_start, &range_end).await
}

/// Powers the opt-in "On this day" Home card for the active profile.
#[tauri::command]
pub async fn list_on_this_day_events(
    today: String,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ViewingEvent>, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    list_on_this_day_events_impl(&pool, &profile_id, &today).await
}

/// One title's full watch history, notes included, for the active profile.
#[tauri::command]
pub async fn list_viewing_events_for_media(
    media_id: i64,
    media_type: MediaType,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ViewingEventNote>, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    list_viewing_events_for_media_impl(&pool, &profile_id, media_id, media_type).await
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsTotals {
    pub movies_watched: i64,
    pub episodes_watched: i64,
    pub minutes_watched: i64,
    /// Minutes from movie-typed events only — the movies/series split card
    /// on the Stats page reads this alongside `episode_minutes_watched`
    /// instead of re-deriving it from a second, unbounded events fetch.
    pub movie_minutes_watched: i64,
    pub episode_minutes_watched: i64,
    pub completed_series: i64,
    pub library_completion_percent: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyActivityBucket {
    pub month: String,
    pub count: i64,
    pub minutes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsOverview {
    pub totals: StatsTotals,
    pub monthly_activity: Vec<MonthlyActivityBucket>,
}

/// `window_start` and `month_labels` are computed client-side (date-fns
/// already owns "current month" logic elsewhere in the app) and passed in,
/// so this command stays a pure aggregation over a caller-specified window
/// rather than a second place that decides what "the last 12 months" means.
#[tauri::command]
pub async fn get_stats_overview(
    window_start: String,
    month_labels: Vec<String>,
    pool: State<'_, SqlitePool>,
) -> Result<StatsOverview, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    get_stats_overview_impl(&pool, &profile_id, &window_start, &month_labels).await
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YearlyActivityBucket {
    pub year: i64,
    pub movies_watched: i64,
    pub episodes_watched: i64,
    pub minutes_watched: i64,
}

#[tauri::command]
pub async fn list_yearly_activity(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<YearlyActivityBucket>, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    list_yearly_activity_impl(&pool, &profile_id).await
}

// ---------------------------------------------------------------------------
// Monthly recap
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitleRating {
    pub title: String,
    pub rating: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BiggestBingeDay {
    pub day: String,
    pub count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyRecap {
    pub month: String,
    // Like monthly_activity/yearly_activity above, a recap for a given
    // calendar month is a historical breakdown ("what did I watch in
    // March") rather than a current-state total — it counts every
    // watched/rewatched event that fell in the month, exactly like
    // `getYearSummary`'s Wrapped figures do for a year. It deliberately does
    // NOT dedupe to "the latest event per title" the way get_stats_overview's
    // headline totals do, since a title watched and later unwatched still
    // did happen in that month.
    pub movies_watched: i64,
    pub episodes_watched: i64,
    pub minutes_watched: i64,
    pub top_rated_title: Option<TitleRating>,
    pub favourite_genre: Option<String>,
    pub biggest_binge_day: Option<BiggestBingeDay>,
}

/// `month` is the "YYYY-MM" label to echo back; `range_start`/`range_end` are
/// ISO instants (end exclusive) computed client-side, same convention as
/// `list_viewing_events_for_year` above.
#[tauri::command]
pub async fn get_monthly_recap(
    month: String,
    range_start: String,
    range_end: String,
    pool: State<'_, SqlitePool>,
) -> Result<MonthlyRecap, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    get_monthly_recap_impl(&pool, &profile_id, &month, &range_start, &range_end).await
}

// ---------------------------------------------------------------------------
// Rewatch analytics
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComfortTitle {
    pub title: String,
    pub count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RewatchStats {
    // A rewatch is itself a historical action, not a reversible state like
    // "watched" — so unlike get_stats_overview's headline totals, this is
    // legitimately a raw count of every `rewatched` event ever logged, not
    // deduped to "the latest event per title".
    pub total_rewatches: i64,
    /// Rewatches as a percentage of every watch event (`watched` +
    /// `rewatched`), rounded to the nearest whole percent.
    pub rewatch_share_percent: i64,
    pub favourite_comfort_titles: Vec<ComfortTitle>,
    pub rewatch_activity: Vec<MonthlyActivityBucket>,
}

/// `window_start`/`month_labels` follow the same client-computed-window
/// convention as `get_stats_overview` above.
#[tauri::command]
pub async fn get_rewatch_stats(
    window_start: String,
    month_labels: Vec<String>,
    pool: State<'_, SqlitePool>,
) -> Result<RewatchStats, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    get_rewatch_stats_impl(&pool, &profile_id, &window_start, &month_labels).await
}

// ---------------------------------------------------------------------------
// Rating distribution & evolution
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RatingBucket {
    pub rating: f64,
    pub count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RatingPeriodAverage {
    pub period: String,
    pub average: f64,
    pub count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RatingDistribution {
    // Current-state: `library_items.user_rating` is a single mutable value
    // per title (no history kept), so a changed rating is reflected
    // immediately here and never accumulates — there is nothing to "undo".
    pub distribution: Vec<RatingBucket>,
    // Historical breakdowns, same exception as monthly/yearly activity: which
    // month/year a title was watched in doesn't change in hindsight, even
    // though the rating value read for it is always the *current* rating
    // (the schema has no rating-at-time-of-watch to read instead).
    pub average_by_month: Vec<RatingPeriodAverage>,
    pub average_by_year: Vec<RatingPeriodAverage>,
}

/// `window_start` bounds `average_by_month` only (same convention as
/// `get_stats_overview`'s window) — `average_by_year` groups a profile's
/// entire history, same as `list_yearly_activity` above, since one row per
/// year stays cheap no matter how long the app has been in use.
#[tauri::command]
pub async fn get_rating_distribution(
    window_start: String,
    pool: State<'_, SqlitePool>,
) -> Result<RatingDistribution, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    get_rating_distribution_impl(&pool, &profile_id, &window_start).await
}

// ---------------------------------------------------------------------------
// Watch milestones
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MilestoneCategory {
    Episodes,
    Movies,
    Hours,
    Series,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchMilestone {
    pub id: String,
    pub category: MilestoneCategory,
    pub threshold: i64,
    pub current_value: i64,
    pub achieved: bool,
    pub achieved_at: Option<String>,
}

#[tauri::command]
pub async fn get_watch_milestones(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<WatchMilestone>, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    get_watch_milestones_impl(&pool, &profile_id).await
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

    #[test]
    fn viewing_event_type_as_db_str_matches_the_wire_format() {
        assert_eq!(ViewingEventType::Watched.as_db_str(), "watched");
        assert_eq!(ViewingEventType::Unwatched.as_db_str(), "unwatched");
        assert_eq!(ViewingEventType::Rewatched.as_db_str(), "rewatched");
    }

    #[test]
    fn into_event_rejects_an_unrecognized_event_type() {
        let row = ViewingEventRow {
            uuid: "bogus-row".to_string(),
            media_id: 1,
            media_type: "movie".to_string(),
            title: "Test".to_string(),
            event_type: "bogus".to_string(),
            watched_at: "2026-01-01T00:00:00.000Z".to_string(),
            duration_minutes: None,
            episode_id: None,
            season_number: None,
            episode_number: None,
        };

        let result = row.into_event("default");

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn lists_recent_viewing_events_scoped_to_the_profile() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, created_at)
             VALUES ('a', 'default', 1, 'movie', 'Test', 'watched', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('guest', 'Guest', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, created_at)
             VALUES ('b', 'guest', 2, 'movie', 'Other profile', 'watched', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let events = list_viewing_events_since_impl(&pool, "default", "2025-01-01T00:00:00.000Z")
            .await
            .unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].title, "Test");
        assert_eq!(events[0].event_type, ViewingEventType::Watched);
    }

    #[tokio::test]
    async fn lists_a_titles_viewing_events_most_recent_first_with_notes_attached() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, note, created_at)
             VALUES ('first', 'default', 42, 'movie', 'Rewatched Movie', 'watched', '2025-01-01T00:00:00.000Z', 'first watch', '2025-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, note, created_at)
             VALUES ('second', 'default', 42, 'movie', 'Rewatched Movie', 'watched', '2026-01-01T00:00:00.000Z', 'even better the second time', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();
        // A different title entirely — must not leak into the result.
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, created_at)
             VALUES ('other', 'default', 99, 'movie', 'Other Movie', 'watched', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let events = list_viewing_events_for_media_impl(&pool, "default", 42, MediaType::Movie)
            .await
            .unwrap();

        assert_eq!(events.len(), 2);
        // Most recent watch first.
        assert_eq!(events[0].id, "second");
        assert_eq!(
            events[0].note.as_deref(),
            Some("even better the second time")
        );
        assert_eq!(events[1].id, "first");
        assert_eq!(events[1].note.as_deref(), Some("first watch"));
    }

    #[tokio::test]
    async fn a_titles_viewing_events_read_returns_none_when_no_note_was_recorded() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, created_at)
             VALUES ('a', 'default', 7, 'movie', 'No Note', 'watched', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let events = list_viewing_events_for_media_impl(&pool, "default", 7, MediaType::Movie)
            .await
            .unwrap();

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].note, None);
    }

    async fn insert_event(
        pool: &SqlitePool,
        uuid: &str,
        watched_at: &str,
        event_type: &str,
        media_type: &str,
        duration_minutes: Option<i64>,
        episode_id: Option<i64>,
    ) {
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, episode_id, created_at)
             VALUES ($1, 'default', 1, $2, 'Test', $3, $4, $5, $6, $4)",
        )
        .bind(uuid)
        .bind(media_type)
        .bind(event_type)
        .bind(watched_at)
        .bind(duration_minutes)
        .bind(episode_id)
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn list_recent_only_returns_events_on_or_after_the_cutoff() {
        let pool = migrated_pool().await;
        insert_event(
            &pool,
            "old",
            "2025-01-01T00:00:00.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;
        insert_event(
            &pool,
            "recent",
            "2026-06-01T00:00:00.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;

        let events = list_viewing_events_since_impl(&pool, "default", "2026-01-01T00:00:00.000Z")
            .await
            .unwrap();

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "recent");
    }

    #[tokio::test]
    async fn list_for_year_excludes_events_outside_the_range() {
        let pool = migrated_pool().await;
        insert_event(
            &pool,
            "before",
            "2025-12-31T23:59:59.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;
        insert_event(
            &pool,
            "inside",
            "2026-06-15T00:00:00.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;
        insert_event(
            &pool,
            "after",
            "2027-01-01T00:00:00.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;

        let events = list_viewing_events_for_year_impl(
            &pool,
            "default",
            "2026-01-01T00:00:00.000Z",
            "2027-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "inside");
    }

    #[tokio::test]
    async fn on_this_day_matches_the_same_month_day_across_multiple_past_years_most_recent_first() {
        let pool = migrated_pool().await;
        insert_event(
            &pool,
            "two-years-ago",
            "2024-08-22T10:00:00.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;
        insert_event(
            &pool,
            "one-year-ago",
            "2025-08-22T20:00:00.000Z",
            "watched",
            "series",
            None,
            Some(9001),
        )
        .await;

        let events = list_on_this_day_events_impl(&pool, "default", "2026-08-22T12:00:00.000Z")
            .await
            .unwrap();

        assert_eq!(events.len(), 2);
        // ORDER BY watched_at DESC -> the more recent year comes first.
        assert_eq!(events[0].id, "one-year-ago");
        assert_eq!(events[1].id, "two-years-ago");
    }

    #[tokio::test]
    async fn on_this_day_requires_an_exact_month_day_match() {
        let pool = migrated_pool().await;
        insert_event(
            &pool,
            "day-before",
            "2025-08-21T00:00:00.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;
        insert_event(
            &pool,
            "day-after",
            "2025-08-23T00:00:00.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;
        insert_event(
            &pool,
            "same-day-different-month",
            "2025-09-22T00:00:00.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;
        insert_event(
            &pool,
            "exact-match",
            "2025-08-22T00:00:00.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;

        let events = list_on_this_day_events_impl(&pool, "default", "2026-08-22T12:00:00.000Z")
            .await
            .unwrap();

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "exact-match");
    }

    #[tokio::test]
    async fn on_this_day_excludes_the_current_year_and_never_returns_a_future_year() {
        let pool = migrated_pool().await;
        // Same month-day, but this year — a "you watched this today" is not
        // "on this day in a past year" and must be excluded.
        insert_event(
            &pool,
            "this-year",
            "2026-08-22T00:00:00.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;
        // Same month-day, one year in the future — must never surface even
        // if a clock-skewed row like this ever existed.
        insert_event(
            &pool,
            "future-year",
            "2027-08-22T00:00:00.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;
        insert_event(
            &pool,
            "past-year",
            "2025-08-22T00:00:00.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;

        let events = list_on_this_day_events_impl(&pool, "default", "2026-08-22T12:00:00.000Z")
            .await
            .unwrap();

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "past-year");
    }

    #[tokio::test]
    async fn on_this_day_ignores_unwatched_toggles_and_is_scoped_to_the_active_profile() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('guest', 'Guest', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();

        insert_event(
            &pool,
            "default-watch",
            "2025-08-22T00:00:00.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;
        // An "unwatched" row on the exact matching day must not surface as a
        // watch memory.
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, created_at)
             VALUES ('default-unwatch', 'default', 2, 'movie', 'Test', 'unwatched', '2025-08-22T00:00:00.000Z', '2025-08-22T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();
        // Another profile's matching event must never leak in.
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, created_at)
             VALUES ('guest-watch', 'guest', 3, 'movie', 'Other profile', 'watched', '2025-08-22T00:00:00.000Z', '2025-08-22T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let events = list_on_this_day_events_impl(&pool, "default", "2026-08-22T12:00:00.000Z")
            .await
            .unwrap();

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "default-watch");
    }

    #[tokio::test]
    async fn list_on_this_day_events_wrapper_returns_an_empty_list_for_a_fresh_profile() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let events = list_on_this_day_events("2026-08-22T12:00:00.000Z".to_string(), state)
            .await
            .unwrap();

        assert!(events.is_empty());
    }

    #[tokio::test]
    async fn stats_overview_aggregates_totals_and_zero_fills_empty_months() {
        let pool = migrated_pool().await;
        insert_event(
            &pool,
            "movie-1",
            "2026-03-10T00:00:00.000Z",
            "watched",
            "movie",
            Some(100),
            None,
        )
        .await;
        insert_event(
            &pool,
            "episode-1",
            "2026-03-12T00:00:00.000Z",
            "watched",
            "series",
            Some(40),
            Some(9001),
        )
        .await;
        insert_event(
            &pool,
            "episode-2",
            "2026-03-15T00:00:00.000Z",
            "rewatched",
            "series",
            Some(40),
            Some(9002),
        )
        .await;
        // An "unwatched" toggle must not count toward totals or minutes.
        insert_event(
            &pool,
            "unwatch-1",
            "2026-03-20T00:00:00.000Z",
            "unwatched",
            "series",
            Some(999),
            Some(9003),
        )
        .await;

        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at)
             VALUES ('lib-1', 'default', 1, 'series', 'Show A', 'completed', 'now', 'now'),
                    ('lib-2', 'default', 2, 'series', 'Show B', 'watching', 'now', 'now'),
                    ('lib-3', 'default', 3, 'movie', 'Film A', 'planned', 'now', 'now'),
                    ('lib-4', 'default', 4, 'movie', 'Film B', 'completed', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let month_labels = vec![
            "2026-02".to_string(),
            "2026-03".to_string(),
            "2026-04".to_string(),
        ];
        let overview =
            get_stats_overview_impl(&pool, "default", "2026-02-01T00:00:00.000Z", &month_labels)
                .await
                .unwrap();

        assert_eq!(overview.totals.movies_watched, 1);
        assert_eq!(overview.totals.episodes_watched, 2);
        assert_eq!(overview.totals.minutes_watched, 180);
        assert_eq!(overview.totals.movie_minutes_watched, 100);
        assert_eq!(overview.totals.episode_minutes_watched, 80);
        assert_eq!(overview.totals.completed_series, 1);
        // 2 completed out of 4 library items.
        assert_eq!(overview.totals.library_completion_percent, 50);

        assert_eq!(overview.monthly_activity.len(), 3);
        assert_eq!(
            overview.monthly_activity[0],
            MonthlyActivityBucket {
                month: "2026-02".into(),
                count: 0,
                minutes: 0
            }
        );
        assert_eq!(
            overview.monthly_activity[1],
            MonthlyActivityBucket {
                month: "2026-03".into(),
                count: 3,
                minutes: 180
            }
        );
        assert_eq!(
            overview.monthly_activity[2],
            MonthlyActivityBucket {
                month: "2026-04".into(),
                count: 0,
                minutes: 0
            }
        );
    }

    #[tokio::test]
    async fn stats_overview_excludes_a_movie_and_episode_that_were_later_unwatched() {
        // Regression test: viewing_events is append-only, so a movie/episode
        // watched and then unwatched leaves BOTH rows in the table. The
        // totals must reflect only the latest event per (media_id,
        // media_type, episode_id), not every historical "watched" row ever
        // logged — otherwise unwatching something never reduces the
        // headline stats, which is the bug this test guards against.
        let pool = migrated_pool().await;

        // Movie 10: watched, then unwatched — must not count.
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, created_at)
             VALUES ('m10-watch', 'default', 10, 'movie', 'Movie Ten', 'watched', '2026-03-01T00:00:00.000Z', 100, '2026-03-01T00:00:00.000Z'),
                    ('m10-unwatch', 'default', 10, 'movie', 'Movie Ten', 'unwatched', '2026-03-02T00:00:00.000Z', 100, '2026-03-02T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        // Movie 20: watched and never unwatched — must still count.
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, created_at)
             VALUES ('m20-watch', 'default', 20, 'movie', 'Movie Twenty', 'watched', '2026-03-01T00:00:00.000Z', 90, '2026-03-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        // Series 30, episode 300: watched, then unwatched — must not count.
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, episode_id, created_at)
             VALUES ('e300-watch', 'default', 30, 'series', 'Show', 'watched', '2026-03-01T00:00:00.000Z', 40, 300, '2026-03-01T00:00:00.000Z'),
                    ('e300-unwatch', 'default', 30, 'series', 'Show', 'unwatched', '2026-03-02T00:00:00.000Z', 40, 300, '2026-03-02T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let month_labels = vec!["2026-03".to_string()];
        let overview =
            get_stats_overview_impl(&pool, "default", "2026-03-01T00:00:00.000Z", &month_labels)
                .await
                .unwrap();

        assert_eq!(
            overview.totals.movies_watched, 1,
            "only movie 20 should still count"
        );
        assert_eq!(
            overview.totals.episodes_watched, 0,
            "the unwatched episode must not count"
        );
        assert_eq!(
            overview.totals.minutes_watched, 90,
            "only movie 20's runtime should count"
        );
        assert_eq!(overview.totals.movie_minutes_watched, 90);
        assert_eq!(overview.totals.episode_minutes_watched, 0);
    }

    #[tokio::test]
    async fn stats_overview_zero_fills_completion_percent_when_library_is_empty() {
        let pool = migrated_pool().await;
        let month_labels = vec!["2026-03".to_string()];

        let overview =
            get_stats_overview_impl(&pool, "default", "2026-03-01T00:00:00.000Z", &month_labels)
                .await
                .unwrap();

        assert_eq!(overview.totals.library_completion_percent, 0);
    }

    #[tokio::test]
    async fn yearly_activity_groups_by_year_and_ignores_unwatched_toggles() {
        let pool = migrated_pool().await;
        insert_event(
            &pool,
            "y2025-movie",
            "2025-06-01T00:00:00.000Z",
            "watched",
            "movie",
            Some(100),
            None,
        )
        .await;
        insert_event(
            &pool,
            "y2026-movie",
            "2026-01-10T00:00:00.000Z",
            "watched",
            "movie",
            Some(120),
            None,
        )
        .await;
        insert_event(
            &pool,
            "y2026-episode",
            "2026-03-12T00:00:00.000Z",
            "watched",
            "series",
            Some(40),
            Some(9001),
        )
        .await;
        insert_event(
            &pool,
            "y2026-rewatch",
            "2026-05-01T00:00:00.000Z",
            "rewatched",
            "series",
            Some(40),
            Some(9002),
        )
        .await;
        insert_event(
            &pool,
            "y2026-unwatch",
            "2026-05-02T00:00:00.000Z",
            "unwatched",
            "series",
            Some(999),
            Some(9003),
        )
        .await;

        let yearly = list_yearly_activity_impl(&pool, "default").await.unwrap();

        assert_eq!(
            yearly,
            vec![
                YearlyActivityBucket {
                    year: 2025,
                    movies_watched: 1,
                    episodes_watched: 0,
                    minutes_watched: 100
                },
                YearlyActivityBucket {
                    year: 2026,
                    movies_watched: 1,
                    episodes_watched: 2,
                    minutes_watched: 200
                },
            ]
        );
    }

    #[tokio::test]
    async fn yearly_activity_is_scoped_to_the_active_profile() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('guest', 'Guest', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();
        insert_event(
            &pool,
            "default-movie",
            "2026-01-01T00:00:00.000Z",
            "watched",
            "movie",
            Some(100),
            None,
        )
        .await;
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, created_at)
             VALUES ('guest-movie', 'guest', 1, 'movie', 'Test', 'watched', '2026-01-01T00:00:00.000Z', 50, '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let yearly = list_yearly_activity_impl(&pool, "default").await.unwrap();

        assert_eq!(
            yearly,
            vec![YearlyActivityBucket {
                year: 2026,
                movies_watched: 1,
                episodes_watched: 0,
                minutes_watched: 100
            }]
        );
    }

    // The `#[tauri::command]` wrappers below only add profile resolution on
    // top of the `_impl` functions already thoroughly exercised above, so a
    // single happy-path call through a real `tauri::test::mock_app()` state
    // handle is enough per wrapper — see profiles.rs's
    // `list_profiles_command_returns_the_default_profile` for the pattern.

    #[tokio::test]
    async fn list_recent_viewing_events_wrapper_returns_events_for_the_active_profile() {
        let pool = migrated_pool().await;
        insert_event(
            &pool,
            "recent",
            "2026-06-01T00:00:00.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;

        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let events = list_recent_viewing_events("2026-01-01T00:00:00.000Z".to_string(), state)
            .await
            .unwrap();

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "recent");
    }

    #[tokio::test]
    async fn list_viewing_events_for_year_wrapper_returns_an_empty_list_for_a_fresh_profile() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let events = list_viewing_events_for_year(
            "2026-01-01T00:00:00.000Z".to_string(),
            "2027-01-01T00:00:00.000Z".to_string(),
            state,
        )
        .await
        .unwrap();

        assert!(events.is_empty());
    }

    #[tokio::test]
    async fn get_stats_overview_wrapper_returns_zeroed_totals_for_a_fresh_profile() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let overview = get_stats_overview(
            "2026-01-01T00:00:00.000Z".to_string(),
            vec!["2026-01".to_string()],
            state,
        )
        .await
        .unwrap();

        assert_eq!(overview.totals.movies_watched, 0);
        assert_eq!(overview.totals.episodes_watched, 0);
        assert_eq!(overview.totals.minutes_watched, 0);
        assert_eq!(overview.totals.library_completion_percent, 0);
        assert_eq!(
            overview.monthly_activity,
            vec![MonthlyActivityBucket {
                month: "2026-01".into(),
                count: 0,
                minutes: 0
            }]
        );
    }

    #[tokio::test]
    async fn list_yearly_activity_wrapper_returns_an_empty_list_for_a_fresh_profile() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let yearly = list_yearly_activity(state).await.unwrap();

        assert!(yearly.is_empty());
    }

    // -----------------------------------------------------------------
    // Monthly recap
    // -----------------------------------------------------------------

    #[allow(clippy::too_many_arguments)]
    async fn insert_library_item(
        pool: &SqlitePool,
        uuid: &str,
        media_id: i64,
        media_type: &str,
        title: &str,
        genres: &str,
        user_rating: Option<f64>,
        status: &str,
        completed_at: Option<&str>,
    ) {
        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, genres, user_rating, status, completed_at, created_at, updated_at)
             VALUES ($1, 'default', $2, $3, $4, $5, $6, $7, $8, 'now', 'now')",
        )
        .bind(uuid)
        .bind(media_id)
        .bind(media_type)
        .bind(title)
        .bind(genres)
        .bind(user_rating)
        .bind(status)
        .bind(completed_at)
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn monthly_recap_aggregates_only_events_inside_the_given_month() {
        let pool = migrated_pool().await;
        // Movie 1: watched inside March, rated 9 — should be top-rated and drive the genre.
        insert_library_item(
            &pool,
            "lib-1",
            1,
            "movie",
            "March Movie",
            r#"["Drama"]"#,
            Some(9.0),
            "completed",
            None,
        )
        .await;
        // Series 2: an episode watched inside March, rated lower. Also tagged
        // "Drama" (alongside "Comedy") so Drama unambiguously wins the
        // favourite-genre count (2 votes vs. Comedy's 1) instead of landing
        // on a count tie the test would then depend on tie-break order for.
        insert_library_item(
            &pool,
            "lib-2",
            2,
            "series",
            "March Show",
            r#"["Drama","Comedy"]"#,
            Some(6.0),
            "watching",
            None,
        )
        .await;
        // Movie 3: watched in February — outside the window, must not leak in.
        insert_library_item(
            &pool,
            "lib-3",
            3,
            "movie",
            "February Movie",
            r#"["Horror"]"#,
            Some(10.0),
            "completed",
            None,
        )
        .await;

        insert_event(
            &pool,
            "movie-1",
            "2026-03-05T00:00:00.000Z",
            "watched",
            "movie",
            Some(100),
            None,
        )
        .await;
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, episode_id, created_at)
             VALUES ('ep-2a', 'default', 2, 'series', 'March Show', 'watched', '2026-03-06T00:00:00.000Z', 30, 9001, '2026-03-06T00:00:00.000Z'),
                    ('ep-2b', 'default', 2, 'series', 'March Show', 'watched', '2026-03-06T01:00:00.000Z', 30, 9002, '2026-03-06T01:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();
        insert_event(
            &pool,
            "movie-3",
            "2026-02-20T00:00:00.000Z",
            "watched",
            "movie",
            Some(90),
            None,
        )
        .await;

        let recap = get_monthly_recap_impl(
            &pool,
            "default",
            "2026-03",
            "2026-03-01T00:00:00.000Z",
            "2026-04-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        assert_eq!(recap.month, "2026-03");
        assert_eq!(recap.movies_watched, 1);
        assert_eq!(recap.episodes_watched, 2);
        assert_eq!(recap.minutes_watched, 160);
        assert_eq!(
            recap.top_rated_title,
            Some(TitleRating {
                title: "March Movie".to_string(),
                rating: 9.0
            })
        );
        assert_eq!(recap.favourite_genre, Some("Drama".to_string()));
        // The two episodes landed on the same day -> biggest binge is that day, count 2.
        assert_eq!(
            recap.biggest_binge_day,
            Some(BiggestBingeDay {
                day: "2026-03-06".to_string(),
                count: 2
            })
        );
    }

    #[tokio::test]
    async fn monthly_recap_still_counts_a_watch_later_unwatched_in_the_same_month() {
        // Unlike get_stats_overview's current-state headline totals, a
        // monthly recap is a historical breakdown (like Wrapped/monthly
        // activity) — "I watched this movie in March" stays true even if it
        // was unwatched later that same month, so this must NOT dedupe to
        // "the latest event only" the way stats_overview does.
        let pool = migrated_pool().await;
        insert_event(
            &pool,
            "watch",
            "2026-03-01T00:00:00.000Z",
            "watched",
            "movie",
            Some(100),
            None,
        )
        .await;
        insert_event(
            &pool,
            "unwatch",
            "2026-03-02T00:00:00.000Z",
            "unwatched",
            "movie",
            Some(100),
            None,
        )
        .await;

        let recap = get_monthly_recap_impl(
            &pool,
            "default",
            "2026-03",
            "2026-03-01T00:00:00.000Z",
            "2026-04-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        assert_eq!(
            recap.movies_watched, 1,
            "the watch that happened this month must still be reflected, even though it was later unwatched"
        );
    }

    #[tokio::test]
    async fn monthly_recap_returns_none_fields_for_a_month_with_no_activity() {
        let pool = migrated_pool().await;

        let recap = get_monthly_recap_impl(
            &pool,
            "default",
            "2026-05",
            "2026-05-01T00:00:00.000Z",
            "2026-06-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        assert_eq!(recap.movies_watched, 0);
        assert_eq!(recap.episodes_watched, 0);
        assert_eq!(recap.minutes_watched, 0);
        assert_eq!(recap.top_rated_title, None);
        assert_eq!(recap.favourite_genre, None);
        assert_eq!(recap.biggest_binge_day, None);
    }

    #[tokio::test]
    async fn get_monthly_recap_wrapper_scopes_to_the_active_profile() {
        let pool = migrated_pool().await;
        insert_event(
            &pool,
            "movie-1",
            "2026-03-05T00:00:00.000Z",
            "watched",
            "movie",
            Some(100),
            None,
        )
        .await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let recap = get_monthly_recap(
            "2026-03".to_string(),
            "2026-03-01T00:00:00.000Z".to_string(),
            "2026-04-01T00:00:00.000Z".to_string(),
            state,
        )
        .await
        .unwrap();

        assert_eq!(recap.movies_watched, 1);
    }

    // -----------------------------------------------------------------
    // Rewatch analytics
    // -----------------------------------------------------------------

    #[tokio::test]
    async fn rewatch_stats_counts_every_rewatched_event_even_after_a_later_unwatch() {
        // A rewatch is a historical action, not reversible state like
        // "watched" — total_rewatches must stay a raw count of every
        // `rewatched` row ever logged, unlike get_stats_overview's headline
        // totals which dedupe to the latest event only.
        let pool = migrated_pool().await;
        insert_event(
            &pool,
            "watch",
            "2026-01-01T00:00:00.000Z",
            "watched",
            "movie",
            Some(100),
            None,
        )
        .await;
        insert_event(
            &pool,
            "rewatch",
            "2026-01-05T00:00:00.000Z",
            "rewatched",
            "movie",
            Some(100),
            None,
        )
        .await;
        insert_event(
            &pool,
            "unwatch",
            "2026-01-10T00:00:00.000Z",
            "unwatched",
            "movie",
            Some(100),
            None,
        )
        .await;

        let stats = get_rewatch_stats_impl(
            &pool,
            "default",
            "2025-01-01T00:00:00.000Z",
            &["2026-01".to_string()],
        )
        .await
        .unwrap();

        assert_eq!(
            stats.total_rewatches, 1,
            "the rewatch must still count even though the title was later unwatched"
        );
    }

    #[tokio::test]
    async fn rewatch_stats_computes_share_percent_and_ranks_comfort_titles() {
        let pool = migrated_pool().await;
        // Title A: watched once, rewatched 3 times -> the top comfort title.
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, created_at) VALUES
             ('a-watch', 'default', 1, 'movie', 'Title A', 'watched', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
             ('a-re1', 'default', 1, 'movie', 'Title A', 'rewatched', '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z'),
             ('a-re2', 'default', 1, 'movie', 'Title A', 'rewatched', '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z'),
             ('a-re3', 'default', 1, 'movie', 'Title A', 'rewatched', '2026-01-04T00:00:00.000Z', '2026-01-04T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();
        // Title B: watched once, rewatched once.
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, created_at) VALUES
             ('b-watch', 'default', 2, 'movie', 'Title B', 'watched', '2026-01-05T00:00:00.000Z', '2026-01-05T00:00:00.000Z'),
             ('b-re1', 'default', 2, 'movie', 'Title B', 'rewatched', '2026-01-06T00:00:00.000Z', '2026-01-06T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let stats = get_rewatch_stats_impl(
            &pool,
            "default",
            "2025-01-01T00:00:00.000Z",
            &["2026-01".to_string()],
        )
        .await
        .unwrap();

        // 4 rewatches out of 6 total watch events (2 watched + 4 rewatched) = 67%.
        assert_eq!(stats.total_rewatches, 4);
        assert_eq!(stats.rewatch_share_percent, 67);
        assert_eq!(
            stats.favourite_comfort_titles,
            vec![
                ComfortTitle {
                    title: "Title A".to_string(),
                    count: 3
                },
                ComfortTitle {
                    title: "Title B".to_string(),
                    count: 1
                },
            ]
        );
        assert_eq!(
            stats.rewatch_activity,
            vec![MonthlyActivityBucket {
                month: "2026-01".to_string(),
                count: 4,
                minutes: 0
            }]
        );
    }

    #[tokio::test]
    async fn rewatch_stats_zero_fills_months_with_no_rewatches() {
        let pool = migrated_pool().await;

        let stats = get_rewatch_stats_impl(
            &pool,
            "default",
            "2026-01-01T00:00:00.000Z",
            &["2026-01".to_string(), "2026-02".to_string()],
        )
        .await
        .unwrap();

        assert_eq!(stats.total_rewatches, 0);
        assert_eq!(stats.rewatch_share_percent, 0);
        assert!(stats.favourite_comfort_titles.is_empty());
        assert_eq!(
            stats.rewatch_activity,
            vec![
                MonthlyActivityBucket {
                    month: "2026-01".to_string(),
                    count: 0,
                    minutes: 0
                },
                MonthlyActivityBucket {
                    month: "2026-02".to_string(),
                    count: 0,
                    minutes: 0
                },
            ]
        );
    }

    #[tokio::test]
    async fn get_rewatch_stats_wrapper_scopes_to_the_active_profile() {
        let pool = migrated_pool().await;
        insert_event(
            &pool,
            "rewatch",
            "2026-01-01T00:00:00.000Z",
            "rewatched",
            "movie",
            None,
            None,
        )
        .await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let stats = get_rewatch_stats(
            "2025-01-01T00:00:00.000Z".to_string(),
            vec!["2026-01".to_string()],
            state,
        )
        .await
        .unwrap();

        assert_eq!(stats.total_rewatches, 1);
    }

    // -----------------------------------------------------------------
    // Rating distribution & evolution
    // -----------------------------------------------------------------

    #[tokio::test]
    async fn rating_distribution_buckets_by_exact_current_rating_value() {
        let pool = migrated_pool().await;
        insert_library_item(
            &pool,
            "lib-1",
            1,
            "movie",
            "A",
            "[]",
            Some(7.5),
            "completed",
            None,
        )
        .await;
        insert_library_item(
            &pool,
            "lib-2",
            2,
            "movie",
            "B",
            "[]",
            Some(7.5),
            "completed",
            None,
        )
        .await;
        insert_library_item(
            &pool,
            "lib-3",
            3,
            "movie",
            "C",
            "[]",
            Some(9.0),
            "completed",
            None,
        )
        .await;
        insert_library_item(&pool, "lib-4", 4, "movie", "D", "[]", None, "planned", None).await;

        let distribution =
            get_rating_distribution_impl(&pool, "default", "2020-01-01T00:00:00.000Z")
                .await
                .unwrap();

        assert_eq!(
            distribution.distribution,
            vec![
                RatingBucket {
                    rating: 7.5,
                    count: 2
                },
                RatingBucket {
                    rating: 9.0,
                    count: 1
                },
            ]
        );
    }

    #[tokio::test]
    async fn rating_distribution_reflects_only_the_current_rating_not_a_history_of_changes() {
        // library_items.user_rating is a single mutable value with no change
        // history — updating it must make the distribution show only the new
        // value, never both the old and new value at once.
        let pool = migrated_pool().await;
        insert_library_item(
            &pool,
            "lib-1",
            1,
            "movie",
            "A",
            "[]",
            Some(5.0),
            "completed",
            None,
        )
        .await;

        sqlx::query("UPDATE library_items SET user_rating = 8.0 WHERE uuid = 'lib-1'")
            .execute(&pool)
            .await
            .unwrap();

        let distribution =
            get_rating_distribution_impl(&pool, "default", "2020-01-01T00:00:00.000Z")
                .await
                .unwrap();

        assert_eq!(
            distribution.distribution,
            vec![RatingBucket {
                rating: 8.0,
                count: 1
            }]
        );
    }

    #[tokio::test]
    async fn rating_distribution_average_by_month_counts_a_rated_series_once_per_month_not_per_episode()
     {
        let pool = migrated_pool().await;
        insert_library_item(
            &pool,
            "lib-1",
            1,
            "series",
            "Show",
            "[]",
            Some(8.0),
            "watching",
            None,
        )
        .await;
        insert_library_item(
            &pool,
            "lib-2",
            2,
            "movie",
            "Film",
            "[]",
            Some(4.0),
            "completed",
            None,
        )
        .await;

        // Three episodes of the same series watched in the same month must
        // not triple-weight the series' rating in that month's average.
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, episode_id, created_at) VALUES
             ('ep1', 'default', 1, 'series', 'Show', 'watched', '2026-03-01T00:00:00.000Z', 1, '2026-03-01T00:00:00.000Z'),
             ('ep2', 'default', 1, 'series', 'Show', 'watched', '2026-03-02T00:00:00.000Z', 2, '2026-03-02T00:00:00.000Z'),
             ('ep3', 'default', 1, 'series', 'Show', 'watched', '2026-03-03T00:00:00.000Z', 3, '2026-03-03T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();
        // `insert_event` always hardcodes media_id 1 (see its definition
        // above), so the second title here is inserted directly with its own
        // media_id instead.
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, created_at)
             VALUES ('film', 'default', 2, 'movie', 'Film', 'watched', '2026-03-10T00:00:00.000Z', '2026-03-10T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let distribution =
            get_rating_distribution_impl(&pool, "default", "2026-01-01T00:00:00.000Z")
                .await
                .unwrap();

        assert_eq!(
            distribution.average_by_month,
            vec![RatingPeriodAverage {
                period: "2026-03".to_string(),
                average: 6.0,
                count: 2
            }]
        );
    }

    #[tokio::test]
    async fn rating_distribution_average_by_year_ignores_the_window_start() {
        let pool = migrated_pool().await;
        insert_library_item(
            &pool,
            "lib-1",
            1,
            "movie",
            "Old Film",
            "[]",
            Some(10.0),
            "completed",
            None,
        )
        .await;
        insert_event(
            &pool,
            "old",
            "2020-01-01T00:00:00.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;

        // window_start is well after the 2020 watch — average_by_year must
        // still include it, unlike average_by_month which is window-bounded.
        let distribution =
            get_rating_distribution_impl(&pool, "default", "2026-01-01T00:00:00.000Z")
                .await
                .unwrap();

        assert_eq!(
            distribution.average_by_year,
            vec![RatingPeriodAverage {
                period: "2020".to_string(),
                average: 10.0,
                count: 1
            }]
        );
        assert!(distribution.average_by_month.is_empty());
    }

    #[tokio::test]
    async fn get_rating_distribution_wrapper_scopes_to_the_active_profile() {
        let pool = migrated_pool().await;
        insert_library_item(
            &pool,
            "lib-1",
            1,
            "movie",
            "A",
            "[]",
            Some(6.0),
            "completed",
            None,
        )
        .await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let distribution = get_rating_distribution("2020-01-01T00:00:00.000Z".to_string(), state)
            .await
            .unwrap();

        assert_eq!(
            distribution.distribution,
            vec![RatingBucket {
                rating: 6.0,
                count: 1
            }]
        );
    }

    // -----------------------------------------------------------------
    // Watch milestones
    // -----------------------------------------------------------------

    #[tokio::test]
    async fn watch_milestones_use_current_state_not_a_raw_event_count() {
        // Same principle as get_stats_overview's own fix: watch 2 episodes,
        // then unwatch 1 of them — a threshold of 2 must NOT be reported as
        // achieved, since only 1 episode is currently watched.
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, episode_id, duration_minutes, created_at) VALUES
             ('ep1-watch', 'default', 1, 'series', 'Show', 'watched', '2026-01-01T00:00:00.000Z', 1, 30, '2026-01-01T00:00:00.000Z'),
             ('ep2-watch', 'default', 1, 'series', 'Show', 'watched', '2026-01-02T00:00:00.000Z', 2, 30, '2026-01-02T00:00:00.000Z'),
             ('ep2-unwatch', 'default', 1, 'series', 'Show', 'unwatched', '2026-01-03T00:00:00.000Z', 2, 30, '2026-01-03T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let milestones = get_watch_milestones_impl(&pool, "default").await.unwrap();
        let episodes_100 = milestones
            .iter()
            .find(|m| m.category == MilestoneCategory::Episodes && m.threshold == 100)
            .unwrap();

        assert_eq!(episodes_100.current_value, 1);
        assert!(!episodes_100.achieved);
        assert_eq!(episodes_100.achieved_at, None);
    }

    #[tokio::test]
    async fn watch_milestones_reports_achieved_with_a_crossing_date_once_the_threshold_is_reached()
    {
        let pool = migrated_pool().await;
        for index in 1..=100 {
            sqlx::query(
                "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, episode_id, duration_minutes, created_at)
                 VALUES ($1, 'default', 1, 'series', 'Show', 'watched', $2, $3, 30, $2)",
            )
            .bind(format!("ep-{index}"))
            .bind(format!("2026-01-{:02}T00:00:00.000Z", (index % 28) + 1))
            .bind(index)
            .execute(&pool)
            .await
            .unwrap();
        }

        let milestones = get_watch_milestones_impl(&pool, "default").await.unwrap();
        let episodes_100 = milestones
            .iter()
            .find(|m| m.category == MilestoneCategory::Episodes && m.threshold == 100)
            .unwrap();

        assert_eq!(episodes_100.current_value, 100);
        assert!(episodes_100.achieved);
        assert!(episodes_100.achieved_at.is_some());
    }

    #[tokio::test]
    async fn watch_milestones_computes_hours_from_cumulative_minutes_across_movies_and_episodes() {
        let pool = migrated_pool().await;
        insert_event(
            &pool,
            "movie",
            "2026-01-01T00:00:00.000Z",
            "watched",
            "movie",
            Some(300),
            None,
        )
        .await;
        insert_event(
            &pool,
            "episode",
            "2026-01-02T00:00:00.000Z",
            "watched",
            "series",
            Some(300),
            Some(9001),
        )
        .await;

        let milestones = get_watch_milestones_impl(&pool, "default").await.unwrap();
        let hours_10 = milestones
            .iter()
            .find(|m| m.category == MilestoneCategory::Hours && m.threshold == 10)
            .unwrap();

        // 600 minutes = 10 hours exactly.
        assert_eq!(hours_10.current_value, 10);
        assert!(hours_10.achieved);
        assert_eq!(
            hours_10.achieved_at.as_deref(),
            Some("2026-01-02T00:00:00.000Z")
        );
    }

    #[tokio::test]
    async fn watch_milestones_counts_completed_series_from_the_librarys_current_status() {
        let pool = migrated_pool().await;
        insert_library_item(
            &pool,
            "lib-1",
            1,
            "series",
            "Finished Show",
            "[]",
            None,
            "completed",
            Some("2026-01-15T00:00:00.000Z"),
        )
        .await;
        insert_library_item(
            &pool,
            "lib-2",
            2,
            "series",
            "In Progress",
            "[]",
            None,
            "watching",
            None,
        )
        .await;

        let milestones = get_watch_milestones_impl(&pool, "default").await.unwrap();
        let series_10 = milestones
            .iter()
            .find(|m| m.category == MilestoneCategory::Series && m.threshold == 10)
            .unwrap();

        assert_eq!(series_10.current_value, 1);
        assert!(!series_10.achieved);
    }

    #[tokio::test]
    async fn get_watch_milestones_wrapper_returns_unachieved_milestones_for_a_fresh_profile() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let milestones = get_watch_milestones(state).await.unwrap();

        assert!(!milestones.is_empty());
        assert!(milestones.iter().all(|m| !m.achieved));
    }
}
