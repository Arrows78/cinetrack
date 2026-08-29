use sqlx::SqlitePool;
use tauri::State;

use super::models::{
    EpisodeHistoryInput, EpisodeInput, EpisodeProgress, MovieInput, SeriesInput, TrackedSeriesItem,
};
use super::service::ProgressService;
use crate::error::ApiError;

#[tauri::command]
pub async fn is_movie_seen(movie_id: i64, pool: State<'_, SqlitePool>) -> Result<bool, ApiError> {
    ProgressService::new(pool.inner())
        .is_movie_seen(movie_id)
        .await
}

#[tauri::command]
pub async fn toggle_movie_seen(
    movie: MovieInput,
    watched: bool,
    watched_at: String,
    note: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    ProgressService::new(pool.inner())
        .toggle_movie_seen(movie, watched, &watched_at, note)
        .await
}

#[tauri::command]
pub async fn get_episode_progress(
    series_id: i64,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<EpisodeProgress>, ApiError> {
    ProgressService::new(pool.inner())
        .get_episode_progress(series_id)
        .await
}

#[tauri::command]
pub async fn toggle_episodes_watched(
    series: SeriesInput,
    episodes: Vec<EpisodeInput>,
    watched: bool,
    watched_at: String,
    history: Option<EpisodeHistoryInput>,
    note: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<i64, ApiError> {
    ProgressService::new(pool.inner())
        .toggle_episodes_watched(&series, &episodes, watched, &watched_at, history, note)
        .await
}

#[tauri::command]
pub async fn list_tracked_series(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<TrackedSeriesItem>, ApiError> {
    ProgressService::new(pool.inner())
        .list_tracked_series()
        .await
}

#[tauri::command]
pub async fn refresh_tracked_series_status(
    series_id: i64,
    status: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    ProgressService::new(pool.inner())
        .refresh_tracked_series_status(series_id, status)
        .await
}
