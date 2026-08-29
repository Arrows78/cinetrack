use sqlx::SqlitePool;
use tauri::State;

use super::PortableData;
use super::integrity::DataIntegrityCheck;
use super::service::BackupService;
use crate::error::ApiError;

#[tauri::command]
pub async fn export_backup_data(pool: State<'_, SqlitePool>) -> Result<PortableData, ApiError> {
    BackupService::new(pool.inner()).export().await
}

#[tauri::command]
pub async fn import_backup_data(
    data: PortableData,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    BackupService::new(pool.inner()).import(data).await
}

#[tauri::command]
pub async fn check_data_integrity(
    pool: State<'_, SqlitePool>,
) -> Result<DataIntegrityCheck, ApiError> {
    BackupService::new(pool.inner()).check_integrity().await
}

#[tauri::command]
pub async fn write_backup_to_path(path: String, contents: String) -> Result<(), ApiError> {
    BackupService::write_file(path, contents).await
}

#[tauri::command]
pub async fn read_backup_from_path(path: String) -> Result<Option<String>, ApiError> {
    BackupService::read_file(path).await
}

#[tauri::command]
pub async fn list_backup_directory(directory: String) -> Result<Vec<String>, ApiError> {
    BackupService::list_directory(directory).await
}

#[tauri::command]
pub async fn remove_backup_file(path: String) -> Result<(), ApiError> {
    BackupService::remove_file(path).await
}
