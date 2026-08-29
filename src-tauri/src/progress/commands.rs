use sqlx::SqlitePool;
use tauri::State;

use super::models::{
    EpisodeHistoryInput, EpisodeInput, EpisodeProgress, MovieInput, SeriesInput, TrackedSeriesItem,
};
use super::service::ProgressService;
use crate::diagnostics::timed;
use crate::error::ApiError;

#[tauri::command]
pub async fn is_movie_seen(movie_id: i64, pool: State<'_, SqlitePool>) -> Result<bool, ApiError> {
    timed("is_movie_seen", async {
        ProgressService::new(pool.inner())
            .is_movie_seen(movie_id)
            .await
    })
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
    timed("toggle_movie_seen", async {
        ProgressService::new(pool.inner())
            .toggle_movie_seen(movie, watched, &watched_at, note)
            .await
    })
    .await
}

#[tauri::command]
pub async fn get_episode_progress(
    series_id: i64,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<EpisodeProgress>, ApiError> {
    timed("get_episode_progress", async {
        ProgressService::new(pool.inner())
            .get_episode_progress(series_id)
            .await
    })
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
    timed("toggle_episodes_watched", async {
        ProgressService::new(pool.inner())
            .toggle_episodes_watched(&series, &episodes, watched, &watched_at, history, note)
            .await
    })
    .await
}

#[tauri::command]
pub async fn list_tracked_series(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<TrackedSeriesItem>, ApiError> {
    timed("list_tracked_series", async {
        ProgressService::new(pool.inner())
            .list_tracked_series()
            .await
    })
    .await
}

#[tauri::command]
pub async fn refresh_tracked_series_status(
    series_id: i64,
    status: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    timed("refresh_tracked_series_status", async {
        ProgressService::new(pool.inner())
            .refresh_tracked_series_status(series_id, status)
            .await
    })
    .await
}
