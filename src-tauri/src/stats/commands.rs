use sqlx::SqlitePool;
use tauri::State;

use super::service::StatsService;
use super::{
    MonthlyRecap, RatingDistribution, RewatchStats, StatsOverview, ViewingEvent, ViewingEventNote,
    WatchMilestone, YearlyActivityBucket,
};
use crate::diagnostics::timed;
use crate::error::ApiError;
use crate::models::MediaType;

/// Bounded fetch for computations that only need a recent window (current
/// streak, catch-up pace) — avoids pulling a profile's entire lifetime of
/// events for a calculation that never looks further back than `since`.
#[tauri::command]
pub async fn list_recent_viewing_events(
    since: String,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ViewingEvent>, ApiError> {
    timed("list_recent_viewing_events", async {
        StatsService::new(pool.inner())
            .list_recent_viewing_events(&since)
            .await
    })
    .await
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
    timed("list_viewing_events_for_year", async {
        StatsService::new(pool.inner())
            .list_viewing_events_for_year(&range_start, &range_end)
            .await
    })
    .await
}

/// Powers the opt-in "On this day" Home card for the active profile.
#[tauri::command]
pub async fn list_on_this_day_events(
    today: String,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ViewingEvent>, ApiError> {
    timed("list_on_this_day_events", async {
        StatsService::new(pool.inner())
            .list_on_this_day_events(&today)
            .await
    })
    .await
}

/// One title's full watch history, notes included, for the active profile.
#[tauri::command]
pub async fn list_viewing_events_for_media(
    media_id: i64,
    media_type: MediaType,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ViewingEventNote>, ApiError> {
    timed("list_viewing_events_for_media", async {
        StatsService::new(pool.inner())
            .list_viewing_events_for_media(media_id, media_type)
            .await
    })
    .await
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
    timed("get_stats_overview", async {
        StatsService::new(pool.inner())
            .get_stats_overview(&window_start, &month_labels)
            .await
    })
    .await
}

#[tauri::command]
pub async fn list_yearly_activity(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<YearlyActivityBucket>, ApiError> {
    timed("list_yearly_activity", async {
        StatsService::new(pool.inner()).list_yearly_activity().await
    })
    .await
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
    timed("get_monthly_recap", async {
        StatsService::new(pool.inner())
            .get_monthly_recap(&month, &range_start, &range_end)
            .await
    })
    .await
}

/// `window_start`/`month_labels` follow the same client-computed-window
/// convention as `get_stats_overview` above.
#[tauri::command]
pub async fn get_rewatch_stats(
    window_start: String,
    month_labels: Vec<String>,
    pool: State<'_, SqlitePool>,
) -> Result<RewatchStats, ApiError> {
    timed("get_rewatch_stats", async {
        StatsService::new(pool.inner())
            .get_rewatch_stats(&window_start, &month_labels)
            .await
    })
    .await
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
    timed("get_rating_distribution", async {
        StatsService::new(pool.inner())
            .get_rating_distribution(&window_start)
            .await
    })
    .await
}

#[tauri::command]
pub async fn get_watch_milestones(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<WatchMilestone>, ApiError> {
    timed("get_watch_milestones", async {
        StatsService::new(pool.inner()).get_watch_milestones().await
    })
    .await
}
