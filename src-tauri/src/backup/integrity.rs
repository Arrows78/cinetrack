use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::ApiError;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataIntegrityCheck {
    pub healthy: bool,
    pub detail: String,
}

pub(super) async fn quick_check_impl(pool: &SqlitePool) -> Result<(bool, String), ApiError> {
    let rows: Vec<(String,)> = sqlx::query_as("PRAGMA quick_check")
        .fetch_all(pool)
        .await
        .map_err(ApiError::from)?;
    let detail = rows
        .into_iter()
        .map(|(value,)| value)
        .collect::<Vec<_>>()
        .join(", ");
    let detail = if detail.is_empty() {
        "unknown".to_string()
    } else {
        detail
    };
    let healthy = detail == "ok";
    Ok((healthy, detail))
}

pub(super) async fn check(pool: &SqlitePool) -> Result<DataIntegrityCheck, ApiError> {
    let (healthy, detail) = quick_check_impl(pool).await?;
    Ok(DataIntegrityCheck { healthy, detail })
}
