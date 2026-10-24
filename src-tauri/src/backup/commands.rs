use sqlx::SqlitePool;
use tauri::State;

use super::PortableData;
use super::integrity::DataIntegrityCheck;
use super::service::BackupService;
use crate::diagnostics::timed;
use crate::error::ApiError;

#[tauri::command]
pub async fn export_backup_data(pool: State<'_, SqlitePool>) -> Result<PortableData, ApiError> {
    timed("export_backup_data", async {
        BackupService::new(pool.inner()).export().await
    })
    .await
}

#[tauri::command]
pub async fn import_backup_data(
    data: PortableData,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    timed("import_backup_data", async {
        BackupService::new(pool.inner()).import(data).await
    })
    .await
}

#[tauri::command]
pub async fn check_data_integrity(
    pool: State<'_, SqlitePool>,
) -> Result<DataIntegrityCheck, ApiError> {
    timed("check_data_integrity", async {
        BackupService::new(pool.inner()).check_integrity().await
    })
    .await
}

#[tauri::command]
pub async fn write_backup_to_path(
    path: String,
    contents: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    timed("write_backup_to_path", async {
        BackupService::new(pool.inner())
            .write_file(path, contents)
            .await
    })
    .await
}

#[tauri::command]
pub async fn read_backup_from_path(
    path: String,
    pool: State<'_, SqlitePool>,
) -> Result<Option<String>, ApiError> {
    timed("read_backup_from_path", async {
        BackupService::new(pool.inner()).read_file(path).await
    })
    .await
}

#[tauri::command]
pub async fn list_backup_directory(
    directory: String,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<String>, ApiError> {
    timed("list_backup_directory", async {
        BackupService::new(pool.inner())
            .list_directory(directory)
            .await
    })
    .await
}

#[tauri::command]
pub async fn remove_backup_file(path: String, pool: State<'_, SqlitePool>) -> Result<(), ApiError> {
    timed("remove_backup_file", async {
        BackupService::new(pool.inner()).remove_file(path).await
    })
    .await
}
