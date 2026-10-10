use sqlx::SqlitePool;
use tauri::State;

use crate::error::ApiError;
use crate::preferences::{PreferencesCache, refresh as refresh_preferences_cache};

use super::models::{
    RemoteSyncChange, SyncConflict, SyncConflictDetail, SyncMutationAck, SyncOutboxMutation,
    SyncStatus,
};
use super::service;

#[tauri::command]
pub async fn get_sync_device_id(pool: State<'_, SqlitePool>) -> Result<String, ApiError> {
    service::device_id(pool.inner()).await
}

#[tauri::command]
pub async fn prepare_sync(
    pool: State<'_, SqlitePool>,
    supabase_user_id: String,
) -> Result<String, ApiError> {
    service::prepare_for_account(pool.inner(), &supabase_user_id).await
}

#[tauri::command]
pub async fn get_sync_status(pool: State<'_, SqlitePool>) -> Result<SyncStatus, ApiError> {
    service::status(pool.inner()).await
}

#[tauri::command]
pub async fn get_sync_cursor(
    pool: State<'_, SqlitePool>,
    profile_id: String,
) -> Result<i64, ApiError> {
    service::assert_run_profile(pool.inner(), &profile_id).await?;
    service::cursor(pool.inner()).await
}

#[tauri::command]
pub async fn mark_sync_completed(
    pool: State<'_, SqlitePool>,
    profile_id: String,
) -> Result<(), ApiError> {
    service::assert_run_profile(pool.inner(), &profile_id).await?;
    service::mark_synced(pool.inner()).await
}

#[tauri::command]
pub async fn list_sync_outbox(
    pool: State<'_, SqlitePool>,
    profile_id: String,
    limit: Option<i64>,
) -> Result<Vec<SyncOutboxMutation>, ApiError> {
    service::assert_run_profile(pool.inner(), &profile_id).await?;
    service::list_outbox(pool.inner(), limit.unwrap_or(100)).await
}

#[tauri::command]
pub async fn list_sync_conflicts(
    pool: State<'_, SqlitePool>,
    limit: Option<i64>,
) -> Result<Vec<SyncConflictDetail>, ApiError> {
    service::list_conflicts(pool.inner(), limit.unwrap_or(50)).await
}

#[tauri::command]
pub async fn ack_sync_mutations(
    pool: State<'_, SqlitePool>,
    profile_id: String,
    acks: Vec<SyncMutationAck>,
) -> Result<(), ApiError> {
    service::assert_run_profile(pool.inner(), &profile_id).await?;
    service::ack_mutations(pool.inner(), &acks).await
}

#[tauri::command]
pub async fn rebase_sync_conflicts(
    pool: State<'_, SqlitePool>,
    profile_id: String,
    conflicts: Vec<SyncConflict>,
) -> Result<(), ApiError> {
    service::assert_run_profile(pool.inner(), &profile_id).await?;
    service::rebase_conflicts(pool.inner(), &conflicts).await
}

#[tauri::command]
pub async fn apply_remote_sync_changes(
    pool: State<'_, SqlitePool>,
    cache: State<'_, PreferencesCache>,
    profile_id: String,
    changes: Vec<RemoteSyncChange>,
) -> Result<(), ApiError> {
    service::assert_run_profile(pool.inner(), &profile_id).await?;
    service::apply_remote_changes(pool.inner(), &changes).await?;
    // Account preferences are written straight into the `preferences` table
    // by the apply, behind the in-memory cache's back: without dropping it,
    // a pulled language/region/... wouldn't show until the next launch.
    if changes
        .iter()
        .any(|change| change.entity_type == "account_preferences")
    {
        refresh_preferences_cache(cache.inner());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::SqlitePoolOptions;
    use tauri::Manager;

    use super::*;

    async fn pool() -> SqlitePool {
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

    #[tokio::test]
    async fn device_id_is_stable() {
        let pool = pool().await;
        let first = service::device_id(&pool).await.unwrap();
        let second = service::device_id(&pool).await.unwrap();
        assert_eq!(first, second);
    }

    #[tokio::test]
    async fn list_sync_conflicts_command_returns_rebased_rows() {
        let pool = pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        sqlx::query("INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at) VALUES ('local-1','default',42,'movie','Test','planned','t','t')")
            .execute(state.inner())
            .await
            .unwrap();
        let pending = list_sync_outbox(state.clone(), "default".to_string(), None)
            .await
            .unwrap();

        rebase_sync_conflicts(
            state.clone(),
            "default".to_string(),
            vec![SyncConflict {
                mutation_id: pending[0].mutation_id.clone(),
                entity_type: "library_item".to_string(),
                entity_id: "local-1".to_string(),
                server_version: 3,
            }],
        )
        .await
        .unwrap();

        let conflicts = list_sync_conflicts(state, None).await.unwrap();
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].entity_id, "local-1");
    }

    #[tokio::test]
    async fn pulled_account_preferences_show_up_without_restarting() {
        let pool = pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        app.manage(PreferencesCache::default());
        let state: State<'_, SqlitePool> = app.state();
        let cache: State<'_, PreferencesCache> = app.state();

        // Prime the in-memory cache with the defaults.
        let before = crate::preferences::get_preferences(state.clone(), cache.clone())
            .await
            .unwrap();
        assert_eq!(serde_json::to_value(before.language).unwrap(), "en");

        let change = RemoteSyncChange {
            sequence: 1,
            entity_type: "account_preferences".to_string(),
            entity_id: "language".to_string(),
            operation: "upsert".to_string(),
            version: 1,
            data: Some(serde_json::json!({
                "key": "language", "value": "\"fr\"", "updatedAt": "2026-01-01T00:00:00.000Z"
            })),
        };
        apply_remote_sync_changes(
            state.clone(),
            cache.clone(),
            "default".to_string(),
            vec![change],
        )
        .await
        .unwrap();

        let after = crate::preferences::get_preferences(state, cache)
            .await
            .unwrap();
        assert_eq!(serde_json::to_value(after.language).unwrap(), "fr");
    }

    #[tokio::test]
    async fn sync_commands_refuse_a_run_bound_to_another_profile() {
        let pool = pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        assert!(
            get_sync_cursor(state.clone(), "someone-else".to_string())
                .await
                .is_err()
        );
        assert!(
            list_sync_outbox(state.clone(), "someone-else".to_string(), None)
                .await
                .is_err()
        );
        assert!(
            prepare_sync(state, "user_not_linked".to_string())
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn business_insert_is_captured_transactionally() {
        let pool = pool().await;
        sqlx::query("INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, created_at, updated_at) VALUES ('sync-1','default',42,'movie','Test','now','now')")
            .execute(&pool).await.unwrap();
        let rows = service::list_outbox(&pool, 10).await.unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].entity_type, "library_item");
        assert_eq!(rows[0].entity_id, "sync-1");
    }
}
