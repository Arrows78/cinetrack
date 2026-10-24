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
    if detail != "ok" {
        return Ok((false, detail));
    }
    // quick_check does not look at foreign keys: rows left orphaned by an old
    // import or restore bug would pass it.
    let orphans: Vec<(String,)> = sqlx::query_as("SELECT \"table\" FROM pragma_foreign_key_check")
        .fetch_all(pool)
        .await
        .map_err(ApiError::from)?;
    if orphans.is_empty() {
        Ok((true, detail))
    } else {
        Ok((false, format!("{} rows break a foreign key", orphans.len())))
    }
}

pub(super) async fn check(pool: &SqlitePool) -> Result<DataIntegrityCheck, ApiError> {
    let (healthy, detail) = quick_check_impl(pool).await?;
    Ok(DataIntegrityCheck { healthy, detail })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_fresh_database_is_healthy() {
        let pool = crate::test_support::migrated_pool().await;
        assert_eq!(
            quick_check_impl(&pool).await.unwrap(),
            (true, "ok".to_string())
        );
    }

    #[tokio::test]
    async fn an_orphaned_row_is_reported_even_though_quick_check_passes() {
        let pool = crate::test_support::migrated_pool_with_connections(1).await;
        let mut conn = pool.acquire().await.unwrap();
        sqlx::query("PRAGMA foreign_keys = OFF")
            .execute(&mut *conn)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO custom_lists (uuid, profile_id, name, created_at, updated_at)
             VALUES ('orphan', 'no-such-profile', 'Lost', 'now', 'now')",
        )
        .execute(&mut *conn)
        .await
        .unwrap();
        drop(conn);

        let (healthy, detail) = quick_check_impl(&pool).await.unwrap();

        assert!(!healthy);
        assert!(detail.contains("foreign key"), "{detail}");
    }
}
