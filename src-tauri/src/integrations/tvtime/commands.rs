use sqlx::SqlitePool;
use tauri::State;

use super::importer::{
    ImportableEpisode, ImportableMovie, MovieImportOutcome, SeriesImportOutcome,
    import_movie_seen_impl, import_series_progress_impl,
};
use crate::database::current_profile_id;
use crate::diagnostics::timed;
use crate::error::ApiError;
use crate::library::{CreatedLibraryItem, UntouchedRemoval, remove_untouched_items_impl};
use crate::progress::SeriesInput;

#[tauri::command]
pub async fn import_series_progress(
    series: SeriesInput,
    episodes: Vec<ImportableEpisode>,
    pool: State<'_, SqlitePool>,
) -> Result<SeriesImportOutcome, ApiError> {
    timed("import_series_progress", async {
        let profile_id = current_profile_id(&pool).await?;
        import_series_progress_impl(&pool, &profile_id, series, episodes).await
    })
    .await
}

#[tauri::command]
pub async fn import_movie_seen(
    movie: ImportableMovie,
    pool: State<'_, SqlitePool>,
) -> Result<MovieImportOutcome, ApiError> {
    timed("import_movie_seen", async {
        let profile_id = current_profile_id(&pool).await?;
        import_movie_seen_impl(&pool, &profile_id, movie).await
    })
    .await
}

/// Library half of "undo this import": removes the entries the import
/// created that the user hasn't edited since, and reports how many it kept.
/// Acts only on the active profile's rows, and a second call is a no-op.
#[tauri::command]
pub async fn undo_tvtime_import_library(
    items: Vec<CreatedLibraryItem>,
    pool: State<'_, SqlitePool>,
) -> Result<UntouchedRemoval, ApiError> {
    timed("undo_tvtime_import_library", async {
        let profile_id = current_profile_id(&pool).await?;
        remove_untouched_items_impl(&pool, &profile_id, &items).await
    })
    .await
}
