use sqlx::SqlitePool;

use super::models::{DismissedRecommendation, MediaSummaryInput};
use super::repository::{dismiss_impl, list_impl, undismiss_impl};
use crate::database::current_profile_id;
use crate::error::ApiError;
use crate::models::MediaType;

pub(super) struct RecommendationsService<'a> {
    pool: &'a SqlitePool,
}

impl<'a> RecommendationsService<'a> {
    pub(super) fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    async fn profile_id(&self) -> Result<String, ApiError> {
        current_profile_id(self.pool).await
    }

    pub(super) async fn list(&self) -> Result<Vec<DismissedRecommendation>, ApiError> {
        let profile_id = self.profile_id().await?;
        list_impl(self.pool, &profile_id).await
    }

    pub(super) async fn dismiss(&self, media: MediaSummaryInput) -> Result<(), ApiError> {
        let profile_id = self.profile_id().await?;
        dismiss_impl(self.pool, &profile_id, media).await
    }

    pub(super) async fn undismiss(
        &self,
        media_id: i64,
        media_type: MediaType,
    ) -> Result<(), ApiError> {
        let profile_id = self.profile_id().await?;
        undismiss_impl(self.pool, &profile_id, media_id, media_type).await
    }
}
