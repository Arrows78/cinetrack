use sqlx::SqlitePool;
use tauri::State;

use super::models::{LibraryItem, LibraryPatch, MediaSummaryInput};
use super::service::LibraryService;
use crate::error::ApiError;
use crate::models::MediaType;

#[tauri::command]
pub async fn list_library(pool: State<'_, SqlitePool>) -> Result<Vec<LibraryItem>, ApiError> {
    LibraryService::new(pool.inner()).list().await
}

#[tauri::command]
pub async fn get_library_item(
    media_id: i64,
    media_type: MediaType,
    pool: State<'_, SqlitePool>,
) -> Result<Option<LibraryItem>, ApiError> {
    LibraryService::new(pool.inner()).get(media_id, media_type).await
}

#[tauri::command]
pub async fn has_library_item(
    media_id: i64,
    media_type: MediaType,
    pool: State<'_, SqlitePool>,
) -> Result<bool, ApiError> {
    LibraryService::new(pool.inner()).has(media_id, media_type).await
}

#[tauri::command]
pub async fn save_library_item(
    media: MediaSummaryInput,
    patch: Option<LibraryPatch>,
    pool: State<'_, SqlitePool>,
) -> Result<LibraryItem, ApiError> {
    LibraryService::new(pool.inner()).save(media, patch).await
}

#[tauri::command]
pub async fn remove_library_item(
    media_id: i64,
    media_type: MediaType,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    LibraryService::new(pool.inner()).remove(media_id, media_type).await
}

#[tauri::command]
pub async fn remove_planned_library_item(
    media_id: i64,
    media_type: MediaType,
    pool: State<'_, SqlitePool>,
) -> Result<bool, ApiError> {
    LibraryService::new(pool.inner())
        .remove_if_planned(media_id, media_type)
        .await
}
