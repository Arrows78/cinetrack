use sqlx::SqlitePool;
use tauri::State;

use crate::error::ApiError;

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
pub async fn prepare_sync(pool: State<'_, SqlitePool>) -> Result<(), ApiError> {
    service::prepare(pool.inner()).await
}

#[tauri::command]
pub async fn get_sync_status(pool: State<'_, SqlitePool>) -> Result<SyncStatus, ApiError> {
    service::status(pool.inner()).await
}

#[tauri::command]
pub async fn get_sync_cursor(pool: State<'_, SqlitePool>) -> Result<i64, ApiError> {
    service::cursor(pool.inner()).await
}

#[tauri::command]
pub async fn mark_sync_completed(pool: State<'_, SqlitePool>) -> Result<(), ApiError> {
    service::mark_synced(pool.inner()).await
}

#[tauri::command]
pub async fn list_sync_outbox(
    pool: State<'_, SqlitePool>,
    limit: Option<i64>,
) -> Result<Vec<SyncOutboxMutation>, ApiError> {
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
    acks: Vec<SyncMutationAck>,
) -> Result<(), ApiError> {
    service::ack_mutations(pool.inner(), &acks).await
}

#[tauri::command]
pub async fn rebase_sync_conflicts(
    pool: State<'_, SqlitePool>,
    conflicts: Vec<SyncConflict>,
) -> Result<(), ApiError> {
    service::rebase_conflicts(pool.inner(), &conflicts).await
}

#[tauri::command]
pub async fn apply_remote_sync_changes(
    pool: State<'_, SqlitePool>,
    changes: Vec<RemoteSyncChange>,
) -> Result<(), ApiError> {
    service::apply_remote_changes(pool.inner(), &changes).await
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
        let pending = list_sync_outbox(state.clone(), None).await.unwrap();

        rebase_sync_conflicts(
            state.clone(),
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
