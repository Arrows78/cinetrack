use sqlx::SqlitePool;

use super::{PortableData, import_impl};
use crate::error::ApiError;

pub(super) async fn import_backup(pool: &SqlitePool, data: PortableData) -> Result<(), ApiError> {
    import_impl(pool, data).await
}
