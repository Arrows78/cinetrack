use sqlx::SqlitePool;
use tauri::State;

use super::models::ViewingHistoryItem;
use super::service::HistoryService;
use crate::error::ApiError;

#[tauri::command]
pub async fn list_history(
    limit: Option<u32>,
    before_timestamp: Option<String>,
    before_id: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ViewingHistoryItem>, ApiError> {
    let before = before_timestamp.as_deref().zip(before_id.as_deref());
    HistoryService::new(pool.inner())
        .list(limit.unwrap_or(50), before)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::history::models::HistoryAction;
    use crate::history::repository::add_history_item_impl;
    use crate::models::MediaType;
    use sqlx::sqlite::SqlitePoolOptions;
    use tauri::Manager;

    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database::migrations::run_migrations(&pool)
            .await
            .unwrap();
        pool
    }

    fn entry(id: &str, timestamp: &str, title: &str) -> ViewingHistoryItem {
        ViewingHistoryItem {
            id: id.to_string(),
            media_id: 1,
            media_type: MediaType::Movie,
            title: title.to_string(),
            action: HistoryAction::MovieWatched,
            timestamp: timestamp.to_string(),
            season_number: None,
            episode_number: None,
            episode_title: None,
            metadata: None,
        }
    }

    // `list_history` only adds the `Option` defaulting/zip on top of
    // `list_history_impl`, already thoroughly exercised in repository.rs —
    // cover it through a real `tauri::test::mock_app()` state handle, see
    // profiles.rs's `list_profiles_command_returns_the_default_profile` for
    // the pattern.

    #[tokio::test]
    async fn list_history_wrapper_returns_seeded_entries_for_the_active_profile() {
        let pool = migrated_pool().await;
        add_history_item_impl(
            &pool,
            &pool,
            entry("1", "2026-01-01T00:00:00.000Z", "First"),
        )
        .await
        .unwrap();
        add_history_item_impl(
            &pool,
            &pool,
            entry("2", "2026-01-02T00:00:00.000Z", "Second"),
        )
        .await
        .unwrap();

        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let list = list_history(None, None, None, state).await.unwrap();

        assert_eq!(
            list.into_iter().map(|item| item.title).collect::<Vec<_>>(),
            vec!["Second", "First"]
        );
    }

    #[tokio::test]
    async fn list_history_wrapper_threads_the_limit_parameter_through() {
        let pool = migrated_pool().await;
        for index in 0..3 {
            add_history_item_impl(
                &pool,
                &pool,
                entry(
                    &index.to_string(),
                    &format!("2026-01-0{}T00:00:00.000Z", index + 1),
                    "Title",
                ),
            )
            .await
            .unwrap();
        }

        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let list = list_history(Some(1), None, None, state).await.unwrap();

        assert_eq!(list.len(), 1);
    }
}
