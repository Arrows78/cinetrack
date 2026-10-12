use sqlx::SqlitePool;

use super::models::{
    EpisodeHistoryInput, EpisodeInput, EpisodeProgress, MovieInput, SeriesInput, TrackedSeriesItem,
    TrackedSeriesRefresh,
};
use super::queries::{
    get_episode_progress_batch_impl, get_episode_progress_impl, is_movie_seen_impl,
    list_seen_movie_ids_impl, list_tracked_series_impl,
};
use super::repository::{
    apply_episodes_and_log_impl, refresh_tracked_series_status_impl, rewatch_movie_impl,
    set_episode_rating_impl, toggle_movie_seen_with_note_impl,
};
use crate::database::current_profile_id;
use crate::error::ApiError;

/// A screen's worth of series, not "everything": a bound on one call.
const MAX_REFRESH_BATCH: usize = 500;

pub(super) struct ProgressService<'a> {
    pool: &'a SqlitePool,
}

impl<'a> ProgressService<'a> {
    pub(super) fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    async fn profile_id(&self) -> Result<String, ApiError> {
        current_profile_id(self.pool).await
    }

    pub(super) async fn is_movie_seen(&self, movie_id: i64) -> Result<bool, ApiError> {
        let profile_id = self.profile_id().await?;
        is_movie_seen_impl(self.pool, &profile_id, movie_id).await
    }

    pub(super) async fn seen_movie_ids(&self, movie_ids: &[i64]) -> Result<Vec<i64>, ApiError> {
        let profile_id = self.profile_id().await?;
        list_seen_movie_ids_impl(self.pool, &profile_id, movie_ids).await
    }

    pub(super) async fn toggle_movie_seen(
        &self,
        movie: MovieInput,
        watched: bool,
        watched_at: &str,
        note: Option<String>,
    ) -> Result<(), ApiError> {
        let profile_id = self.profile_id().await?;
        toggle_movie_seen_with_note_impl(self.pool, &profile_id, movie, watched, watched_at, note)
            .await
    }

    pub(super) async fn rewatch_movie(
        &self,
        movie: MovieInput,
        watched_at: &str,
        note: Option<String>,
    ) -> Result<(), ApiError> {
        let profile_id = self.profile_id().await?;
        rewatch_movie_impl(self.pool, &profile_id, movie, watched_at, note).await
    }

    pub(super) async fn get_episode_progress(
        &self,
        series_id: i64,
    ) -> Result<Vec<EpisodeProgress>, ApiError> {
        let profile_id = self.profile_id().await?;
        get_episode_progress_impl(self.pool, &profile_id, series_id).await
    }

    pub(super) async fn get_episode_progress_batch(
        &self,
        series_ids: &[i64],
    ) -> Result<Vec<EpisodeProgress>, ApiError> {
        let profile_id = self.profile_id().await?;
        get_episode_progress_batch_impl(self.pool, &profile_id, series_ids).await
    }

    #[allow(clippy::too_many_arguments)]
    pub(super) async fn toggle_episodes_watched(
        &self,
        series: &SeriesInput,
        episodes: &[EpisodeInput],
        watched: bool,
        watched_at: &str,
        history: Option<EpisodeHistoryInput>,
        note: Option<String>,
    ) -> Result<i64, ApiError> {
        let profile_id = self.profile_id().await?;
        apply_episodes_and_log_impl(
            self.pool,
            &profile_id,
            series,
            episodes,
            watched,
            watched_at,
            history,
            note,
        )
        .await
    }

    pub(super) async fn list_tracked_series(&self) -> Result<Vec<TrackedSeriesItem>, ApiError> {
        let profile_id = self.profile_id().await?;
        list_tracked_series_impl(self.pool, &profile_id).await
    }

    pub(super) async fn refresh_tracked_series_status(
        &self,
        series_id: i64,
        status: Option<String>,
        total_episodes: Option<i64>,
    ) -> Result<(), ApiError> {
        let profile_id = self.profile_id().await?;
        refresh_tracked_series_status_impl(
            self.pool,
            &profile_id,
            series_id,
            status,
            total_episodes,
        )
        .await
    }

    /// Runs `refresh_tracked_series_status` for each series in turn (each in
    /// its own transaction, exactly as the single command does) and returns the
    /// ids that failed: one failing series does not stop the others, and none
    /// is dropped silently.
    pub(super) async fn refresh_tracked_series_statuses(
        &self,
        refreshes: Vec<TrackedSeriesRefresh>,
    ) -> Result<Vec<i64>, ApiError> {
        let profile_id = self.profile_id().await?;
        let mut failed = Vec::new();
        for refresh in refreshes.into_iter().take(MAX_REFRESH_BATCH) {
            if let Err(error) = refresh_tracked_series_status_impl(
                self.pool,
                &profile_id,
                refresh.series_id,
                refresh.status,
                refresh.total_episodes,
            )
            .await
            {
                eprintln!(
                    "tracked series {}: status refresh failed: {}",
                    refresh.series_id, error.message
                );
                failed.push(refresh.series_id);
            }
        }
        Ok(failed)
    }

    pub(super) async fn set_episode_rating(
        &self,
        series_id: i64,
        episode_id: i64,
        rating: Option<i64>,
    ) -> Result<(), ApiError> {
        let profile_id = self.profile_id().await?;
        set_episode_rating_impl(self.pool, &profile_id, series_id, episode_id, rating).await
    }
}
