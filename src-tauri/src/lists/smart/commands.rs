use serde_json::Value;
use sqlx::SqlitePool;
use tauri::State;

use super::models::SmartList;
use super::repository::{create_impl, list_impl, remove_impl, update_impl};
use crate::database::current_profile_id;
use crate::error::ApiError;

#[tauri::command]
pub async fn list_smart_lists(pool: State<'_, SqlitePool>) -> Result<Vec<SmartList>, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    list_impl(&pool, &profile_id).await
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
