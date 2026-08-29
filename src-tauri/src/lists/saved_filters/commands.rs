use serde_json::Value;
use sqlx::SqlitePool;
use tauri::State;

use super::models::SavedFilter;
use super::repository::{create_impl, list_impl, remove_impl};
use crate::database::current_profile_id;
use crate::error::ApiError;

#[tauri::command]
pub async fn list_saved_filters(
    page: String,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<SavedFilter>, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    list_impl(&pool, &profile_id, page).await
}

#[tauri::command]
pub async fn create_saved_filter(
    page: String,
    name: String,
    filters: Value,
    pool: State<'_, SqlitePool>,
) -> Result<SavedFilter, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    create_impl(&pool, &profile_id, &page, &name, filters).await
}

#[tauri::command]
pub async fn remove_saved_filter(
    saved_filter_id: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    remove_impl(&pool, &profile_id, &saved_filter_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lists::saved_filters::repository::list_impl;
    use serde_json::json;
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

    #[tokio::test]
    async fn create_saved_filter_command_creates_a_filter_for_the_active_profile() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let saved = create_saved_filter(
            "library".to_string(),
            "Ma vue".to_string(),
            json!({ "sort": "rating" }),
            state,
        )
        .await
        .unwrap();
        assert_eq!(saved.name, "Ma vue");
        assert_eq!(saved.profile_id, "default");
    }

    #[tokio::test]
    async fn list_saved_filters_command_returns_only_the_requested_pages_filters() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        create_saved_filter(
            "library".to_string(),
            "Lib".to_string(),
            json!({}),
            state.clone(),
        )
        .await
        .unwrap();
        create_saved_filter(
            "search".to_string(),
            "Search".to_string(),
            json!({}),
            state.clone(),
        )
        .await
        .unwrap();

        let results = list_saved_filters("search".to_string(), state)
            .await
            .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Search");
    }

    #[tokio::test]
    async fn remove_saved_filter_command_removes_the_callers_filter() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let saved = create_saved_filter(
            "library".to_string(),
            "À supprimer".to_string(),
            json!({}),
            state.clone(),
        )
        .await
        .unwrap();
        remove_saved_filter(saved.id.clone(), state.clone())
            .await
            .unwrap();

        assert_eq!(
            list_impl(&app.state::<SqlitePool>(), "default", "library".to_string())
                .await
                .unwrap()
                .len(),
            0
        );
    }
}
