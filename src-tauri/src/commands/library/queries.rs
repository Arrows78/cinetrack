use sqlx::SqlitePool;

use super::models::{LibraryItem, LibraryRow};
use crate::error::ApiError;
use crate::models::MediaType;

const LIST_SAFETY_LIMIT: i64 = 5000;

pub(super) async fn list_impl(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<Vec<LibraryItem>, ApiError> {
    let rows: Vec<LibraryRow> = sqlx::query_as(
        "SELECT * FROM library_items WHERE profile_id = $1 ORDER BY updated_at DESC LIMIT $2",
    )
    .bind(profile_id)
    .bind(LIST_SAFETY_LIMIT)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;
    rows.into_iter().map(LibraryItem::try_from).collect()
}

pub(super) async fn get_impl(
    pool: &SqlitePool,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
) -> Result<Option<LibraryItem>, ApiError> {
    let row: Option<LibraryRow> = sqlx::query_as(
        "SELECT * FROM library_items WHERE profile_id = $1 AND media_id = $2 AND media_type = $3 LIMIT 1",
    )
    .bind(profile_id)
    .bind(media_id)
    .bind(media_type.as_db_str())
    .fetch_optional(pool)
    .await
    .map_err(ApiError::from)?;
    row.map(LibraryItem::try_from).transpose()
}

pub(super) async fn has_impl(
    pool: &SqlitePool,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
) -> Result<bool, ApiError> {
    let row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM library_items WHERE profile_id = $1 AND media_id = $2 AND media_type = $3",
    )
    .bind(profile_id)
    .bind(media_id)
    .bind(media_type.as_db_str())
    .fetch_one(pool)
    .await
    .map_err(ApiError::from)?;
    Ok(row.0 > 0)
}
