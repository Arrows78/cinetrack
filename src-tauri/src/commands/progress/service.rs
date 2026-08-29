use sqlx::SqlitePool;

use super::models::{
    EpisodeHistoryInput, EpisodeInput, EpisodeProgress, MovieInput, SeriesInput, TrackedSeriesItem,
};
use super::queries::{get_episode_progress_impl, is_movie_seen_impl, list_tracked_series_impl};
use super::repository::{
    apply_episodes_and_log_impl, refresh_tracked_series_status_impl,
    toggle_movie_seen_with_note_impl,
};
use crate::database::current_profile_id;
use crate::error::ApiError;

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

    pub(super) async fn get_episode_progress(
        &self,
        series_id: i64,
    ) -> Result<Vec<EpisodeProgress>, ApiError> {
        let profile_id = self.profile_id().await?;
        get_episode_progress_impl(self.pool, &profile_id, series_id).await
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
    ) -> Result<(), ApiError> {
        let profile_id = self.profile_id().await?;
        refresh_tracked_series_status_impl(self.pool, &profile_id, series_id, status).await
    }
}
