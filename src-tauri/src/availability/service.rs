use sqlx::SqlitePool;

use super::models::{AvailabilityAlert, AvailabilitySnapshot, MediaSummaryInput};
use super::repository::{
    get_alert_impl, get_snapshot_impl, list_alerts_impl, list_snapshots_impl, remove_impl,
    save_snapshot_impl, toggle_impl,
};
use crate::database::current_profile_id;
use crate::error::ApiError;
use crate::models::MediaType;

pub(super) struct AvailabilityService<'a> {
    pool: &'a SqlitePool,
}

impl<'a> AvailabilityService<'a> {
    pub(super) fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    async fn profile_id(&self) -> Result<String, ApiError> {
        current_profile_id(self.pool).await
    }

    pub(super) async fn list_alerts(&self) -> Result<Vec<AvailabilityAlert>, ApiError> {
        let profile_id = self.profile_id().await?;
        list_alerts_impl(self.pool, &profile_id).await
    }

    pub(super) async fn get_alert(
        &self,
        media_id: i64,
        media_type: MediaType,
    ) -> Result<Option<AvailabilityAlert>, ApiError> {
        let profile_id = self.profile_id().await?;
        get_alert_impl(self.pool, &profile_id, media_id, media_type).await
    }

    pub(super) async fn toggle_alert(
        &self,
        media: MediaSummaryInput,
        region: String,
        provider_ids: Vec<i64>,
    ) -> Result<Option<AvailabilityAlert>, ApiError> {
        let profile_id = self.profile_id().await?;
        toggle_impl(self.pool, &profile_id, media, region, provider_ids).await
    }

    pub(super) async fn remove_alert(&self, id: &str) -> Result<(), ApiError> {
        let profile_id = self.profile_id().await?;
        remove_impl(self.pool, &profile_id, id).await
    }

    // Not profile-scoped: `availability_snapshots` is a global TTL cache
    // shared across every local profile (see repository::LIST_SNAPSHOTS_
    // SAFETY_LIMIT's doc comment) — these methods never resolve an active
    // profile, unlike every alert method above.
    pub(super) async fn get_snapshot(
        &self,
        media_id: i64,
        media_type: MediaType,
        region: &str,
    ) -> Result<Option<AvailabilitySnapshot>, ApiError> {
        get_snapshot_impl(self.pool, media_id, media_type, region).await
    }

    pub(super) async fn list_snapshots(&self) -> Result<Vec<AvailabilitySnapshot>, ApiError> {
        list_snapshots_impl(self.pool).await
    }

    pub(super) async fn save_snapshot(
        &self,
        snapshot: AvailabilitySnapshot,
    ) -> Result<(), ApiError> {
        save_snapshot_impl(self.pool, snapshot).await
    }
}
