use sqlx::SqlitePool;

use super::activity::get_activity_stats_impl;
use super::forecast::get_watch_forecast_impl;
use super::library_extras::get_library_extras_impl;
use super::milestones::get_watch_milestones_impl;
use super::overview::{get_stats_overview_impl, list_yearly_activity_impl};
use super::ratings::get_rating_distribution_impl;
use super::recap::get_monthly_recap_impl;
use super::rewatch::get_rewatch_stats_impl;
use super::viewing_events::{
    list_on_this_day_events_impl, list_viewing_events_for_media_impl,
    list_viewing_events_for_year_impl, list_viewing_events_since_impl,
};
use super::{
    ActivityStats, LibraryExtras, MonthlyRecap, RatingDistribution, RewatchStats, StatsOverview,
    ViewingEvent, ViewingEventNote, WatchForecast, WatchMilestone, YearlyActivityBucket,
};
use crate::error::ApiError;
use crate::models::MediaType;

pub(super) struct StatsRepository<'a> {
    pool: &'a SqlitePool,
    profile_id: String,
}

impl<'a> StatsRepository<'a> {
    pub(super) fn new(pool: &'a SqlitePool, profile_id: String) -> Self {
        Self { pool, profile_id }
    }

    pub(super) async fn list_recent_viewing_events(
        &self,
        since: &str,
    ) -> Result<Vec<ViewingEvent>, ApiError> {
        list_viewing_events_since_impl(self.pool, &self.profile_id, since).await
    }

    pub(super) async fn list_viewing_events_for_year(
        &self,
        range_start: &str,
        range_end: &str,
    ) -> Result<Vec<ViewingEvent>, ApiError> {
        list_viewing_events_for_year_impl(self.pool, &self.profile_id, range_start, range_end).await
    }

    pub(super) async fn list_on_this_day_events(
        &self,
        today: &str,
    ) -> Result<Vec<ViewingEvent>, ApiError> {
        list_on_this_day_events_impl(self.pool, &self.profile_id, today).await
    }

    pub(super) async fn list_viewing_events_for_media(
        &self,
        media_id: i64,
        media_type: MediaType,
    ) -> Result<Vec<ViewingEventNote>, ApiError> {
        list_viewing_events_for_media_impl(self.pool, &self.profile_id, media_id, media_type).await
    }

    pub(super) async fn get_stats_overview(
        &self,
        window_start: &str,
        month_labels: &[String],
    ) -> Result<StatsOverview, ApiError> {
        get_stats_overview_impl(self.pool, &self.profile_id, window_start, month_labels).await
    }

    pub(super) async fn list_yearly_activity(&self) -> Result<Vec<YearlyActivityBucket>, ApiError> {
        list_yearly_activity_impl(self.pool, &self.profile_id).await
    }

    pub(super) async fn get_monthly_recap(
        &self,
        month: &str,
        range_start: &str,
        range_end: &str,
    ) -> Result<MonthlyRecap, ApiError> {
        get_monthly_recap_impl(self.pool, &self.profile_id, month, range_start, range_end).await
    }

    pub(super) async fn get_rewatch_stats(
        &self,
        window_start: &str,
        month_labels: &[String],
    ) -> Result<RewatchStats, ApiError> {
        get_rewatch_stats_impl(self.pool, &self.profile_id, window_start, month_labels).await
    }

    pub(super) async fn get_rating_distribution(
        &self,
        window_start: &str,
    ) -> Result<RatingDistribution, ApiError> {
        get_rating_distribution_impl(self.pool, &self.profile_id, window_start).await
    }

    pub(super) async fn get_watch_milestones(&self) -> Result<Vec<WatchMilestone>, ApiError> {
        get_watch_milestones_impl(self.pool, &self.profile_id).await
    }

    pub(super) async fn get_activity_stats(
        &self,
        since: &str,
        today: &str,
        tz_offset_minutes: i64,
    ) -> Result<ActivityStats, ApiError> {
        get_activity_stats_impl(self.pool, &self.profile_id, since, today, tz_offset_minutes).await
    }

    pub(super) async fn get_library_extras(&self) -> Result<LibraryExtras, ApiError> {
        get_library_extras_impl(self.pool, &self.profile_id).await
    }

    pub(super) async fn get_watch_forecast(
        &self,
        since: &str,
        pace_window_start: &str,
        now: &str,
    ) -> Result<WatchForecast, ApiError> {
        get_watch_forecast_impl(self.pool, &self.profile_id, since, pace_window_start, now).await
    }
}
