use sqlx::SqlitePool;

use super::PortableData;
use super::repository::export_impl;
use crate::error::ApiError;

pub(super) async fn export_backup(pool: &SqlitePool) -> Result<PortableData, ApiError> {
    export_impl(pool).await
}
