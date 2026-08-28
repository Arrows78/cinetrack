use sqlx::SqlitePool;

use super::repository::StatsRepository;
use super::{
    MonthlyRecap, RatingDistribution, RewatchStats, StatsOverview, ViewingEvent,
    ViewingEventNote, WatchMilestone, YearlyActivityBucket,
};
use crate::database::current_profile_id;
use crate::error::ApiError;
use crate::models::MediaType;

pub(super) struct StatsService<'a> {
    pool: &'a SqlitePool,
}

impl<'a> StatsService<'a> {
    pub(super) fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    async fn repository(&self) -> Result<StatsRepository<'a>, ApiError> {
        let profile_id = current_profile_id(self.pool).await?;
        Ok(StatsRepository::new(self.pool, profile_id))
    }

    pub(super) async fn list_recent_viewing_events(
        &self,
        since: &str,
    ) -> Result<Vec<ViewingEvent>, ApiError> {
        self.repository().await?.list_recent_viewing_events(since).await
    }

    pub(super) async fn list_viewing_events_for_year(
        &self,
        range_start: &str,
        range_end: &str,
    ) -> Result<Vec<ViewingEvent>, ApiError> {
        self.repository()
            .await?
            .list_viewing_events_for_year(range_start, range_end)
            .await
    }

    pub(super) async fn list_on_this_day_events(
        &self,
        today: &str,
    ) -> Result<Vec<ViewingEvent>, ApiError> {
        self.repository().await?.list_on_this_day_events(today).await
    }

    pub(super) async fn list_viewing_events_for_media(
        &self,
        media_id: i64,
        media_type: MediaType,
    ) -> Result<Vec<ViewingEventNote>, ApiError> {
        self.repository()
            .await?
            .list_viewing_events_for_media(media_id, media_type)
            .await
    }

    pub(super) async fn get_stats_overview(
        &self,
        window_start: &str,
        month_labels: &[String],
    ) -> Result<StatsOverview, ApiError> {
        self.repository()
            .await?
            .get_stats_overview(window_start, month_labels)
            .await
    }

    pub(super) async fn list_yearly_activity(
        &self,
    ) -> Result<Vec<YearlyActivityBucket>, ApiError> {
        self.repository().await?.list_yearly_activity().await
    }

    pub(super) async fn get_monthly_recap(
        &self,
        month: &str,
        range_start: &str,
        range_end: &str,
    ) -> Result<MonthlyRecap, ApiError> {
        self.repository()
            .await?
            .get_monthly_recap(month, range_start, range_end)
            .await
    }

    pub(super) async fn get_rewatch_stats(
        &self,
        window_start: &str,
        month_labels: &[String],
    ) -> Result<RewatchStats, ApiError> {
        self.repository()
            .await?
            .get_rewatch_stats(window_start, month_labels)
            .await
    }

    pub(super) async fn get_rating_distribution(
        &self,
        window_start: &str,
    ) -> Result<RatingDistribution, ApiError> {
        self.repository()
            .await?
            .get_rating_distribution(window_start)
            .await
    }

    pub(super) async fn get_watch_milestones(&self) -> Result<Vec<WatchMilestone>, ApiError> {
        self.repository().await?.get_watch_milestones().await
    }
}
