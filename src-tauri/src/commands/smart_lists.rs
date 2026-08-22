use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::SqlitePool;
use tauri::State;

use crate::commands::macros::profile_scoped_command;
use crate::database::{current_profile_id, new_uuid, now_iso};
use crate::error::ApiError;

/// A smart list is a saved, named filter rule set — "Unwatched + Horror +
/// under 100 min", "My Services + rating >= 8", "Series with episodes
/// waiting" are the three README examples this ships for. Unlike a custom
/// list (`custom_lists`/`custom_list_items`), it never stores which media
/// items match: `rules` is evaluated live against the current library every
/// time the smart list is opened (see
/// src/features/library/smart-list-evaluation.ts), so this command layer's
/// only job is CRUD over the rule definition itself.
///
/// `rules` is deliberately an opaque `serde_json::Value` here rather than a
/// typed Rust struct mirroring `SmartListRules` (src/types/media.ts):
/// nothing in Rust ever inspects a rule's fields — evaluation is 100%
/// client-side TypeScript, reusing the same library/tracked-series/
/// preferences data `LibraryExplorer` already loads for its own manual
/// filters. Keeping the shape untyped here means the two sides can't drift
/// out of a shared enum in the first place, at the cost of only shallow
/// validation (must be a JSON object, see `validate_rules`) rather than a
/// fully-checked schema.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartList {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub rules: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(sqlx::FromRow)]
pub(crate) struct SmartListRow {
    uuid: String,
    profile_id: String,
    name: String,
    rules: String,
    created_at: String,
    updated_at: String,
}

impl TryFrom<SmartListRow> for SmartList {
    type Error = ApiError;

    fn try_from(row: SmartListRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.uuid,
            profile_id: row.profile_id,
            name: row.name,
            rules: serde_json::from_str(&row.rules)
                .map_err(|e| ApiError::internal(format!("Corrupt smart list rules: {e}")))?,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }
}

const MAX_NAME_LENGTH: usize = 100;
// Generous but bounded: every real rule set (the fixed set of dimensions in
// SmartListRules) serializes to well under a kilobyte — this only guards
// against a caller sending something pathological, not a real usage limit.
const MAX_RULES_JSON_LENGTH: usize = 10_000;

fn validate_name(name: &str) -> Result<String, ApiError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(ApiError::bad_request("The smart list name is required."));
    }
    if trimmed.chars().count() > MAX_NAME_LENGTH {
        return Err(ApiError::bad_request(format!(
            "The smart list name cannot exceed {MAX_NAME_LENGTH} characters."
        )));
    }
    Ok(trimmed.to_string())
}

/// Only checks the rules value is a JSON object within a sane size — see
/// this module's doc comment for why deeper (per-field) validation
/// deliberately isn't Rust's job here.
fn validate_rules(rules: &Value) -> Result<String, ApiError> {
    if !rules.is_object() {
        return Err(ApiError::bad_request("Smart list rules must be an object."));
    }
    let serialized = serde_json::to_string(rules).map_err(|e| ApiError::internal(e.to_string()))?;
    if serialized.len() > MAX_RULES_JSON_LENGTH {
        return Err(ApiError::bad_request("Smart list rules are too large."));
    }
    Ok(serialized)
}

async fn list_impl(pool: &SqlitePool, profile_id: &str) -> Result<Vec<SmartList>, ApiError> {
    let rows: Vec<SmartListRow> =
        sqlx::query_as("SELECT * FROM smart_lists WHERE profile_id = $1 ORDER BY updated_at DESC")
            .bind(profile_id)
            .fetch_all(pool)
            .await
            .map_err(ApiError::from)?;
    rows.into_iter().map(SmartList::try_from).collect()
}

async fn create_impl(
    pool: &SqlitePool,
    profile_id: &str,
    name: &str,
    rules: Value,
) -> Result<SmartList, ApiError> {
    let name = validate_name(name)?;
    let rules_json = validate_rules(&rules)?;

    let now = now_iso(pool).await?;
    let smart_list = SmartList {
        id: new_uuid(),
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
/// same rule custom_lists.rs's own `assert_owns_list` documents, otherwise a
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

async fn update_impl(
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

async fn remove_impl(
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

profile_scoped_command! {
    pub async fn list_smart_lists() -> Vec<SmartList> => list_impl
}

#[tauri::command]
pub async fn create_smart_list(
    name: String,
    rules: Value,
    pool: State<'_, SqlitePool>,
) -> Result<SmartList, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    create_impl(&pool, &profile_id, &name, rules).await
}

#[tauri::command]
pub async fn update_smart_list(
    smart_list_id: String,
    name: String,
    rules: Value,
    pool: State<'_, SqlitePool>,
) -> Result<SmartList, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    update_impl(&pool, &profile_id, &smart_list_id, &name, rules).await
}

#[tauri::command]
pub async fn remove_smart_list(
    smart_list_id: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    remove_impl(&pool, &profile_id, &smart_list_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use tauri::Manager;

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

    // --- tauri::command wrapper coverage -----------------------------
    //
    // Thin happy-path checks that the wrapper wiring itself (tauri::State
    // extraction, active-profile resolution) works — not a re-test of the
    // underlying business logic already covered above.

    #[tokio::test]
    async fn create_smart_list_command_creates_a_list_for_the_active_profile() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let smart_list = create_smart_list("Weeknight picks".to_string(), sample_rules(), state)
            .await
            .unwrap();
        assert_eq!(smart_list.name, "Weeknight picks");
        assert_eq!(smart_list.profile_id, "default");
    }

    #[tokio::test]
    async fn list_smart_lists_command_returns_a_saved_list() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        create_smart_list("Weeknight picks".to_string(), sample_rules(), state.clone())
            .await
            .unwrap();

        let lists = list_smart_lists(state).await.unwrap();
        assert_eq!(lists.len(), 1);
    }

    #[tokio::test]
    async fn update_smart_list_command_updates_the_callers_list() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let smart_list = create_smart_list("Original".to_string(), sample_rules(), state.clone())
            .await
            .unwrap();

        let updated = update_smart_list(
            smart_list.id.clone(),
            "Updated".to_string(),
            sample_rules(),
            state,
        )
        .await
        .unwrap();
        assert_eq!(updated.name, "Updated");
    }

    #[tokio::test]
    async fn remove_smart_list_command_removes_the_callers_list() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let smart_list = create_smart_list("To delete".to_string(), sample_rules(), state.clone())
            .await
            .unwrap();

        remove_smart_list(smart_list.id, state.clone())
            .await
            .unwrap();

        assert_eq!(list_smart_lists(state).await.unwrap().len(), 0);
    }
}
