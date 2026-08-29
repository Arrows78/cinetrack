use sqlx::SqlitePool;
use tauri::State;

use super::models::{CustomList, CustomListItem, MediaSummaryInput};
use super::repository::{
    add_impl, create_impl, items_impl, list_impl, remove_impl, remove_item_impl,
};
use crate::database::current_profile_id;
use crate::diagnostics::timed;
use crate::error::ApiError;
use crate::models::MediaType;

#[tauri::command]
pub async fn list_custom_lists(pool: State<'_, SqlitePool>) -> Result<Vec<CustomList>, ApiError> {
    timed("list_custom_lists", async {
        let profile_id = current_profile_id(&pool).await?;
        list_impl(&pool, &profile_id).await
    })
    .await
}

#[tauri::command]
pub async fn create_custom_list(
    name: String,
    description: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<CustomList, ApiError> {
    timed("create_custom_list", async {
        let profile_id = current_profile_id(&pool).await?;
        create_impl(&pool, &profile_id, &name, description).await
    })
    .await
}

#[tauri::command]
pub async fn remove_custom_list(
    list_id: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    timed("remove_custom_list", async {
        let profile_id = current_profile_id(&pool).await?;
        remove_impl(&pool, &profile_id, &list_id).await
    })
    .await
}

#[tauri::command]
pub async fn list_custom_list_items(
    list_id: String,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<CustomListItem>, ApiError> {
    timed("list_custom_list_items", async {
        let profile_id = current_profile_id(&pool).await?;
        items_impl(&pool, &profile_id, &list_id).await
    })
    .await
}

#[tauri::command]
pub async fn add_custom_list_item(
    list_id: String,
    media: MediaSummaryInput,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    timed("add_custom_list_item", async {
        let profile_id = current_profile_id(&pool).await?;
        add_impl(&pool, &profile_id, &list_id, media).await
    })
    .await
}

#[tauri::command]
pub async fn remove_custom_list_item(
    list_id: String,
    media_id: i64,
    media_type: MediaType,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    timed("remove_custom_list_item", async {
        let profile_id = current_profile_id(&pool).await?;
        remove_item_impl(&pool, &profile_id, &list_id, media_id, media_type).await
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lists::custom::repository::items_impl;
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

    fn media(id: i64, title: &str) -> MediaSummaryInput {
        MediaSummaryInput {
            id,
            media_type: MediaType::Movie,
            title: title.to_string(),
            poster_path: None,
        }
    }

    #[tokio::test]
    async fn create_custom_list_command_creates_a_list_for_the_active_profile() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let list = create_custom_list("Ma liste".to_string(), None, state)
            .await
            .unwrap();
        assert_eq!(list.name, "Ma liste");
        assert_eq!(list.profile_id, "default");
    }

    #[tokio::test]
    async fn remove_custom_list_command_removes_the_callers_list() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let list = create_custom_list("À supprimer".to_string(), None, state.clone())
            .await
            .unwrap();
        remove_custom_list(list.id.clone(), state.clone())
            .await
            .unwrap();

        assert_eq!(list_custom_lists(state).await.unwrap().len(), 0);
    }

    #[tokio::test]
    async fn list_custom_list_items_command_returns_the_lists_items() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let list = create_custom_list("Ma liste".to_string(), None, state.clone())
            .await
            .unwrap();
        add_custom_list_item(list.id.clone(), media(1, "Un"), state.clone())
            .await
            .unwrap();

        let items = list_custom_list_items(list.id.clone(), state)
            .await
            .unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].media_id, 1);
    }

    #[tokio::test]
    async fn add_custom_list_item_command_adds_the_item_to_the_list() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let list = create_custom_list("Ma liste".to_string(), None, state.clone())
            .await
            .unwrap();
        add_custom_list_item(list.id.clone(), media(1, "Un"), state.clone())
            .await
            .unwrap();

        let items = items_impl(&app.state::<SqlitePool>(), "default", &list.id)
            .await
            .unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].media_id, 1);
    }

    #[tokio::test]
    async fn remove_custom_list_item_command_removes_only_the_named_item() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let list = create_custom_list("Ma liste".to_string(), None, state.clone())
            .await
            .unwrap();
        add_custom_list_item(list.id.clone(), media(1, "Un"), state.clone())
            .await
            .unwrap();
        add_custom_list_item(list.id.clone(), media(2, "Deux"), state.clone())
            .await
            .unwrap();

        remove_custom_list_item(list.id.clone(), 1, MediaType::Movie, state.clone())
            .await
            .unwrap();

        let items = items_impl(&app.state::<SqlitePool>(), "default", &list.id)
            .await
            .unwrap();
        assert_eq!(
            items.iter().map(|i| i.media_id).collect::<Vec<_>>(),
            vec![2]
        );
    }
}
