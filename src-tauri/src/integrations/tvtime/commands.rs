use sqlx::SqlitePool;
use tauri::State;

use super::importer::{
    ImportableEpisode, ImportableMovie, import_movie_seen_impl, import_series_progress_impl,
};
use crate::database::current_profile_id;
use crate::error::ApiError;
use crate::progress::SeriesInput;

#[tauri::command]
pub async fn import_series_progress(
    series: SeriesInput,
    episodes: Vec<ImportableEpisode>,
    pool: State<'_, SqlitePool>,
) -> Result<i64, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    import_series_progress_impl(&pool, &profile_id, series, episodes).await
}

#[tauri::command]
pub async fn import_movie_seen(
    movie: ImportableMovie,
    pool: State<'_, SqlitePool>,
) -> Result<bool, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    import_movie_seen_impl(&pool, &profile_id, movie).await
}
