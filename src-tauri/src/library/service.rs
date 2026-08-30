use sqlx::SqlitePool;

use super::models::{
    LibraryFilterParams, LibraryItem, LibraryListParams, LibraryMediaKey, LibraryPage,
    LibraryPatch, LibraryStatusCounts, MediaSummaryInput,
};
use super::queries::{
    get_best_recommendation_seed_impl, get_impl, get_items_by_keys_impl, has_impl,
    list_completed_candidates_impl, list_ids_matching_filters_impl, list_impl,
    list_media_keys_impl, list_page_impl, list_planned_candidates_impl, list_status_counts_impl,
};
use super::repository::{remove_if_planned_impl, remove_impl, upsert_impl};
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

    pub(super) async fn list_page(
        &self,
        params: LibraryListParams,
    ) -> Result<LibraryPage, ApiError> {
        let profile_id = self.profile_id().await?;
        list_page_impl(self.pool, &profile_id, params).await
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

    pub(super) async fn list_media_keys(&self) -> Result<Vec<LibraryMediaKey>, ApiError> {
        let profile_id = self.profile_id().await?;
        list_media_keys_impl(self.pool, &profile_id).await
    }

    pub(super) async fn get_items_by_keys(
        &self,
        keys: Vec<LibraryMediaKey>,
    ) -> Result<Vec<LibraryItem>, ApiError> {
        let profile_id = self.profile_id().await?;
        get_items_by_keys_impl(self.pool, &profile_id, &keys).await
    }

    pub(super) async fn status_counts(&self) -> Result<LibraryStatusCounts, ApiError> {
        let profile_id = self.profile_id().await?;
        list_status_counts_impl(self.pool, &profile_id).await
    }

    pub(super) async fn planned_candidates(
        &self,
        media_type: MediaType,
        limit: i64,
    ) -> Result<Vec<LibraryItem>, ApiError> {
        let profile_id = self.profile_id().await?;
        list_planned_candidates_impl(self.pool, &profile_id, media_type, limit).await
    }

    pub(super) async fn completed_candidates(
        &self,
        media_type: Option<MediaType>,
        limit: i64,
    ) -> Result<Vec<LibraryItem>, ApiError> {
        let profile_id = self.profile_id().await?;
        list_completed_candidates_impl(self.pool, &profile_id, media_type, limit).await
    }

    pub(super) async fn best_recommendation_seed(&self) -> Result<Option<LibraryItem>, ApiError> {
        let profile_id = self.profile_id().await?;
        get_best_recommendation_seed_impl(self.pool, &profile_id).await
    }

    pub(super) async fn ids_matching_filters(
        &self,
        filters: LibraryFilterParams,
    ) -> Result<Vec<LibraryMediaKey>, ApiError> {
        let profile_id = self.profile_id().await?;
        list_ids_matching_filters_impl(self.pool, &profile_id, filters).await
    }
}
