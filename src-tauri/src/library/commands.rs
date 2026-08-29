use sqlx::SqlitePool;
use tauri::State;

use super::domain::LibraryStatus;
use super::models::{
    LibraryItem, LibraryListParams, LibraryPage, LibraryPatch, LibrarySort, MediaSummaryInput,
};
use super::service::LibraryService;
use crate::diagnostics::timed;
use crate::error::ApiError;
use crate::models::MediaType;

#[tauri::command]
pub async fn list_library(pool: State<'_, SqlitePool>) -> Result<Vec<LibraryItem>, ApiError> {
    timed("list_library", async {
        LibraryService::new(pool.inner()).list().await
    })
    .await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn list_library_page(
    media_type: Option<MediaType>,
    status: Option<LibraryStatus>,
    favourites_only: bool,
    search: Option<String>,
    sort: LibrarySort,
    cursor: Option<String>,
    limit: i64,
    pool: State<'_, SqlitePool>,
) -> Result<LibraryPage, ApiError> {
    timed("list_library_page", async {
        let params = LibraryListParams {
            media_type,
            status,
            favourites_only,
            search,
            sort,
            cursor,
            limit,
        };
        LibraryService::new(pool.inner()).list_page(params).await
    })
    .await
}

#[tauri::command]
pub async fn get_library_item(
    media_id: i64,
    media_type: MediaType,
    pool: State<'_, SqlitePool>,
) -> Result<Option<LibraryItem>, ApiError> {
    timed("get_library_item", async {
        LibraryService::new(pool.inner())
            .get(media_id, media_type)
            .await
    })
    .await
}

#[tauri::command]
pub async fn has_library_item(
    media_id: i64,
    media_type: MediaType,
    pool: State<'_, SqlitePool>,
) -> Result<bool, ApiError> {
    timed("has_library_item", async {
        LibraryService::new(pool.inner())
            .has(media_id, media_type)
            .await
    })
    .await
}

#[tauri::command]
pub async fn save_library_item(
    media: MediaSummaryInput,
    patch: Option<LibraryPatch>,
    pool: State<'_, SqlitePool>,
) -> Result<LibraryItem, ApiError> {
    timed("save_library_item", async {
        LibraryService::new(pool.inner()).save(media, patch).await
    })
    .await
}

#[tauri::command]
pub async fn remove_library_item(
    media_id: i64,
    media_type: MediaType,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    timed("remove_library_item", async {
        LibraryService::new(pool.inner())
            .remove(media_id, media_type)
            .await
    })
    .await
}

#[tauri::command]
pub async fn remove_planned_library_item(
    media_id: i64,
    media_type: MediaType,
    pool: State<'_, SqlitePool>,
) -> Result<bool, ApiError> {
    timed("remove_planned_library_item", async {
        LibraryService::new(pool.inner())
            .remove_if_planned(media_id, media_type)
            .await
    })
    .await
}
