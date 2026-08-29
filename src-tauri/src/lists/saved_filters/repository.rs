use serde_json::Value;
use sqlx::SqlitePool;

use super::models::{SavedFilter, SavedFilterRow, validate_filters, validate_name, validate_page};
use crate::database::{new_uuid, now_iso};
use crate::error::ApiError;

pub(super) async fn list_impl(
    pool: &SqlitePool,
    profile_id: &str,
    page: String,
) -> Result<Vec<SavedFilter>, ApiError> {
    validate_page(&page)?;
    let rows: Vec<SavedFilterRow> = sqlx::query_as(
        "SELECT * FROM saved_filters WHERE profile_id = $1 AND page = $2 ORDER BY updated_at DESC",
    )
    .bind(profile_id)
    .bind(&page)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;
    rows.into_iter().map(SavedFilter::try_from).collect()
}

pub(super) async fn create_impl(
    pool: &SqlitePool,
    profile_id: &str,
    page: &str,
    name: &str,
    filters: Value,
) -> Result<SavedFilter, ApiError> {
    validate_page(page)?;
    let name = validate_name(name)?;
    let filters_json = validate_filters(&filters)?;

    let now = now_iso(pool).await?;
    let saved_filter = SavedFilter {
        id: new_uuid(),
        profile_id: profile_id.to_string(),
        page: page.to_string(),
        name,
        filters,
        created_at: now.clone(),
        updated_at: now,
    };

    sqlx::query(
        "INSERT INTO saved_filters (uuid, profile_id, page, name, filters, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    )
    .bind(&saved_filter.id)
    .bind(&saved_filter.profile_id)
    .bind(&saved_filter.page)
    .bind(&saved_filter.name)
    .bind(&filters_json)
    .bind(&saved_filter.created_at)
    .bind(&saved_filter.updated_at)
    .execute(pool)
    .await
    .map_err(ApiError::from)?;

    Ok(saved_filter)
}

/// `remove_saved_filter` takes a bare `saved_filter_id` from the frontend
/// with no other proof of ownership, so it must confirm the row belongs to
/// the caller's active profile before deleting it — same rule
/// `lists::custom`'s own `assert_owns_list` documents, otherwise a profile
/// that merely knows another profile's saved-filter UUID could delete it.
/// `not_found` (rather than a distinct "forbidden") avoids confirming to the
/// caller that a saved filter with that UUID exists at all under a
/// different profile.
async fn assert_owns_saved_filter(
    pool: &SqlitePool,
    profile_id: &str,
    saved_filter_id: &str,
) -> Result<(), ApiError> {
    let owned: Option<(i64,)> =
        sqlx::query_as("SELECT 1 FROM saved_filters WHERE uuid = $1 AND profile_id = $2")
            .bind(saved_filter_id)
            .bind(profile_id)
            .fetch_optional(pool)
            .await
            .map_err(ApiError::from)?;
    owned
        .map(|_| ())
        .ok_or_else(|| ApiError::not_found("Saved filter not found."))
}

pub(super) async fn remove_impl(
    pool: &SqlitePool,
    profile_id: &str,
    saved_filter_id: &str,
) -> Result<(), ApiError> {
    assert_owns_saved_filter(pool, profile_id, saved_filter_id).await?;
    sqlx::query("DELETE FROM saved_filters WHERE uuid = $1")
        .bind(saved_filter_id)
        .execute(pool)
        .await
        .map_err(ApiError::from)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use sqlx::sqlite::SqlitePoolOptions;

    use crate::lists::saved_filters::models::MAX_NAME_LENGTH;

    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database::migrations::run_migrations(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('other', 'Other', '2026-01-01', '2026-01-01')",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    #[tokio::test]
    async fn creates_and_lists_a_saved_filter_scoped_to_its_page() {
        let pool = migrated_pool().await;
        let saved = create_impl(
            &pool,
            "default",
            "library",
            "  Paused shows  ",
            json!({ "statusFilter": "paused" }),
        )
        .await
        .unwrap();
        assert_eq!(saved.name, "Paused shows");
        assert_eq!(saved.page, "library");

        let library_filters = list_impl(&pool, "default", "library".to_string())
            .await
            .unwrap();
        assert_eq!(library_filters.len(), 1);
        let search_filters = list_impl(&pool, "default", "search".to_string())
            .await
            .unwrap();
        assert_eq!(search_filters.len(), 0);
    }

    #[tokio::test]
    async fn rejects_an_unknown_page() {
        let pool = migrated_pool().await;
        assert!(
            create_impl(&pool, "default", "bogus", "Name", json!({}))
                .await
                .is_err()
        );
        assert!(
            list_impl(&pool, "default", "bogus".to_string())
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn rejects_a_whitespace_only_name() {
        let pool = migrated_pool().await;
        assert!(
            create_impl(&pool, "default", "library", "   ", json!({}))
                .await
                .is_err()
        );
        assert_eq!(
            list_impl(&pool, "default", "library".to_string())
                .await
                .unwrap()
                .len(),
            0
        );
    }

    #[tokio::test]
    async fn rejects_a_name_over_the_length_limit() {
        let pool = migrated_pool().await;
        let too_long = "a".repeat(MAX_NAME_LENGTH + 1);
        assert!(
            create_impl(&pool, "default", "library", &too_long, json!({}))
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn rejects_non_object_filter_state() {
        let pool = migrated_pool().await;
        assert!(
            create_impl(
                &pool,
                "default",
                "library",
                "Name",
                json!(["not", "an", "object"])
            )
            .await
            .is_err()
        );
    }

    #[tokio::test]
    async fn removes_a_saved_filter() {
        let pool = migrated_pool().await;
        let saved = create_impl(
            &pool,
            "default",
            "search",
            "Sci-fi",
            json!({ "genreSeries": "878" }),
        )
        .await
        .unwrap();

        remove_impl(&pool, "default", &saved.id).await.unwrap();

        assert_eq!(
            list_impl(&pool, "default", "search".to_string())
                .await
                .unwrap()
                .len(),
            0
        );
    }

    #[tokio::test]
    async fn a_profile_cannot_read_or_delete_another_profiles_saved_filter() {
        let pool = migrated_pool().await;
        let saved = create_impl(&pool, "default", "library", "Privé", json!({}))
            .await
            .unwrap();

        assert!(remove_impl(&pool, "other", &saved.id).await.is_err());
        assert_eq!(
            list_impl(&pool, "default", "library".to_string())
                .await
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            list_impl(&pool, "other", "library".to_string())
                .await
                .unwrap()
                .len(),
            0
        );
    }
}
