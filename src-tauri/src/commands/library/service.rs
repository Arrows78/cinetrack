use sqlx::SqlitePool;

use super::models::{LibraryItem, LibraryPatch, MediaSummaryInput};
use super::queries::{get_impl, has_impl, list_impl};
use super::{remove_if_planned_impl, remove_impl, upsert_impl};
use crate::database::current_profile_id;
use crate::error::ApiError;
use crate::models::MediaType;

pub(super) struct LibraryService<'a> {
    pool: &'a SqlitePool,
}

impl<'a> LibraryService<'a> {
    pub(super) fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    async fn profile_id(&self) -> Result<String, ApiError> {
        current_profile_id(self.pool).await
    }

    pub(super) async fn list(&self) -> Result<Vec<LibraryItem>, ApiError> {
        let profile_id = self.profile_id().await?;
        list_impl(self.pool, &profile_id).await
    }

    pub(super) async fn get(
        &self,
        media_id: i64,
        media_type: MediaType,
    ) -> Result<Option<LibraryItem>, ApiError> {
        let profile_id = self.profile_id().await?;
        get_impl(self.pool, &profile_id, media_id, media_type).await
    }

    pub(super) async fn has(&self, media_id: i64, media_type: MediaType) -> Result<bool, ApiError> {
        let profile_id = self.profile_id().await?;
        has_impl(self.pool, &profile_id, media_id, media_type).await
    }

    pub(super) async fn save(
        &self,
        media: MediaSummaryInput,
        patch: Option<LibraryPatch>,
    ) -> Result<LibraryItem, ApiError> {
        let profile_id = self.profile_id().await?;
        upsert_impl(self.pool, media, patch.unwrap_or_default(), &profile_id).await
    }

    pub(super) async fn remove(
        &self,
        media_id: i64,
        media_type: MediaType,
    ) -> Result<(), ApiError> {
        let profile_id = self.profile_id().await?;
        remove_impl(self.pool, &profile_id, media_id, media_type).await
    }

    pub(super) async fn remove_if_planned(
        &self,
        media_id: i64,
        media_type: MediaType,
    ) -> Result<bool, ApiError> {
        let profile_id = self.profile_id().await?;
        remove_if_planned_impl(self.pool, &profile_id, media_id, media_type).await
    }
}
