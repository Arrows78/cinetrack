use serde_json::Value;
use sqlx::SqlitePool;

use super::models::{SmartList, SmartListRow, validate_name, validate_rules};
use crate::database::now_iso;
use crate::error::ApiError;

pub(super) async fn list_impl(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<Vec<SmartList>, ApiError> {
    let rows: Vec<SmartListRow> =
        sqlx::query_as("SELECT * FROM smart_lists WHERE profile_id = $1 ORDER BY updated_at DESC")
            .bind(profile_id)
            .fetch_all(pool)
            .await
            .map_err(ApiError::from)?;
    rows.into_iter().map(SmartList::try_from).collect()
}

pub(super) async fn create_impl(
    pool: &SqlitePool,
    profile_id: &str,
    name: &str,
    rules: Value,
) -> Result<SmartList, ApiError> {
    let name = validate_name(name)?;
    let rules_json = validate_rules(&rules)?;

    let now = now_iso(pool).await?;
    let smart_list = SmartList {
        id: crate::database::new_uuid(),
        profile_id: profile_id.to_string(),
        name,
        rules,
        created_at: now.clone(),
        updated_at: now,
    };

    sqlx::query(
        "INSERT INTO smart_lists (uuid, profile_id, name, rules, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)",
    )
    .bind(&smart_list.id)
    .bind(&smart_list.profile_id)
    .bind(&smart_list.name)
    .bind(&rules_json)
    .bind(&smart_list.created_at)
    .bind(&smart_list.updated_at)
    .execute(pool)
    .await
    .map_err(ApiError::from)?;

    Ok(smart_list)
}

/// Every command below takes a bare `list_id` from the frontend with no
/// other proof of ownership, so each one must confirm the smart list
/// belongs to the caller's active profile before reading or writing it —
/// same rule `lists::custom`'s own `assert_owns_list` documents, otherwise a
/// profile that merely knows another profile's smart list UUID could read,
/// rename, or delete it. `not_found` (rather than a distinct "forbidden")
/// avoids confirming to the caller that a smart list with that UUID exists
/// at all under a different profile.
async fn assert_owns_smart_list(
    pool: &SqlitePool,
    profile_id: &str,
    smart_list_id: &str,
) -> Result<(), ApiError> {
    let owned: Option<(i64,)> =
        sqlx::query_as("SELECT 1 FROM smart_lists WHERE uuid = $1 AND profile_id = $2")
            .bind(smart_list_id)
            .bind(profile_id)
            .fetch_optional(pool)
            .await
            .map_err(ApiError::from)?;
    owned
        .map(|_| ())
        .ok_or_else(|| ApiError::not_found("Smart list not found."))
}

pub(super) async fn update_impl(
    pool: &SqlitePool,
    profile_id: &str,
    smart_list_id: &str,
    name: &str,
    rules: Value,
) -> Result<SmartList, ApiError> {
    assert_owns_smart_list(pool, profile_id, smart_list_id).await?;
    let name = validate_name(name)?;
    let rules_json = validate_rules(&rules)?;
    let now = now_iso(pool).await?;

    sqlx::query("UPDATE smart_lists SET name = $1, rules = $2, updated_at = $3 WHERE uuid = $4")
        .bind(&name)
        .bind(&rules_json)
        .bind(&now)
        .bind(smart_list_id)
        .execute(pool)
        .await
        .map_err(ApiError::from)?;

    // Re-read rather than reconstructing a SmartList by hand from the
    // caller's inputs: this function's caller only ever supplies a new
    // name/rules, never the row's original created_at.
    let row: SmartListRow = sqlx::query_as("SELECT * FROM smart_lists WHERE uuid = $1")
        .bind(smart_list_id)
        .fetch_one(pool)
        .await
        .map_err(ApiError::from)?;

    SmartList::try_from(row)
}

pub(super) async fn remove_impl(
    pool: &SqlitePool,
    profile_id: &str,
    smart_list_id: &str,
) -> Result<(), ApiError> {
    assert_owns_smart_list(pool, profile_id, smart_list_id).await?;
    sqlx::query("DELETE FROM smart_lists WHERE uuid = $1")
        .bind(smart_list_id)
        .execute(pool)
        .await
        .map_err(ApiError::from)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    use crate::lists::smart::models::{MAX_NAME_LENGTH, MAX_RULES_JSON_LENGTH};

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

    fn sample_rules() -> Value {
        serde_json::json!({
            "status": "planned",
            "mediaType": "movie",
            "genre": "Horror",
            "maxRuntimeMinutes": 100,
            "minRating": null,
            "provider": "any",
            "hasEpisodeWaiting": false,
        })
    }

    #[tokio::test]
    async fn creates_a_smart_list_with_a_trimmed_name_and_stores_rules_verbatim() {
        let pool = migrated_pool().await;
        let smart_list = create_impl(&pool, "default", "  Cozy horror night  ", sample_rules())
            .await
            .unwrap();

        assert_eq!(smart_list.name, "Cozy horror night");
        assert_eq!(smart_list.rules, sample_rules());
        assert_eq!(list_impl(&pool, "default").await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn rejects_a_whitespace_only_name() {
        let pool = migrated_pool().await;
        assert!(
            create_impl(&pool, "default", "   ", sample_rules())
                .await
                .is_err()
        );
        assert_eq!(list_impl(&pool, "default").await.unwrap().len(), 0);
    }

    #[tokio::test]
    async fn rejects_a_name_over_the_length_limit() {
        let pool = migrated_pool().await;
        let too_long = "a".repeat(MAX_NAME_LENGTH + 1);
        assert!(
            create_impl(&pool, "default", &too_long, sample_rules())
                .await
                .is_err()
        );

        let exactly_at_limit = "a".repeat(MAX_NAME_LENGTH);
        assert!(
            create_impl(&pool, "default", &exactly_at_limit, sample_rules())
                .await
                .is_ok()
        );
    }

    #[tokio::test]
    async fn rejects_rules_that_are_not_a_json_object() {
        let pool = migrated_pool().await;
        assert!(
            create_impl(&pool, "default", "List", Value::Array(vec![]))
                .await
                .is_err()
        );
        assert!(
            create_impl(&pool, "default", "List", Value::Null)
                .await
                .is_err()
        );
        assert_eq!(list_impl(&pool, "default").await.unwrap().len(), 0);
    }

    #[tokio::test]
    async fn rejects_oversized_rules() {
        let pool = migrated_pool().await;
        let huge = serde_json::json!({ "padding": "x".repeat(MAX_RULES_JSON_LENGTH) });
        assert!(create_impl(&pool, "default", "List", huge).await.is_err());
    }

    #[tokio::test]
    async fn updates_name_and_rules_of_an_existing_smart_list() {
        let pool = migrated_pool().await;
        let smart_list = create_impl(&pool, "default", "Original", sample_rules())
            .await
            .unwrap();

        let new_rules = serde_json::json!({ "status": "any", "mediaType": "series" });
        let updated = update_impl(
            &pool,
            "default",
            &smart_list.id,
            "Renamed",
            new_rules.clone(),
        )
        .await
        .unwrap();

        assert_eq!(updated.name, "Renamed");
        assert_eq!(updated.rules, new_rules);

        let reloaded = list_impl(&pool, "default").await.unwrap();
        assert_eq!(reloaded.len(), 1);
        assert_eq!(reloaded[0].name, "Renamed");
        assert_eq!(reloaded[0].rules, new_rules);
    }

    #[tokio::test]
    async fn removes_a_smart_list() {
        let pool = migrated_pool().await;
        let smart_list = create_impl(&pool, "default", "To delete", sample_rules())
            .await
            .unwrap();

        remove_impl(&pool, "default", &smart_list.id).await.unwrap();

        assert_eq!(list_impl(&pool, "default").await.unwrap().len(), 0);
    }

    #[tokio::test]
    async fn removing_an_unknown_smart_list_is_a_not_found_error() {
        let pool = migrated_pool().await;
        let error = remove_impl(&pool, "default", "ghost").await.unwrap_err();
        assert_eq!(error.status, Some(404));
    }

    #[tokio::test]
    async fn a_profile_cannot_read_update_or_delete_another_profiles_smart_list() {
        let pool = migrated_pool().await;
        let smart_list = create_impl(&pool, "default", "Private", sample_rules())
            .await
            .unwrap();

        assert!(
            update_impl(&pool, "other", &smart_list.id, "Hijacked", sample_rules())
                .await
                .is_err()
        );
        assert!(remove_impl(&pool, "other", &smart_list.id).await.is_err());

        // Neither rejected call mutated anything, and "other" sees no lists.
        assert_eq!(list_impl(&pool, "other").await.unwrap().len(), 0);
        let reloaded = list_impl(&pool, "default").await.unwrap();
        assert_eq!(reloaded.len(), 1);
        assert_eq!(reloaded[0].name, "Private");
    }

    #[tokio::test]
    async fn lists_are_scoped_to_the_requesting_profile_only() {
        let pool = migrated_pool().await;
        create_impl(&pool, "default", "Mine", sample_rules())
            .await
            .unwrap();
        create_impl(&pool, "other", "Theirs", sample_rules())
            .await
            .unwrap();

        assert_eq!(list_impl(&pool, "default").await.unwrap().len(), 1);
        assert_eq!(list_impl(&pool, "other").await.unwrap().len(), 1);
    }
}
