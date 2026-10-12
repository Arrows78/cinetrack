use sqlx::SqlitePool;
use tauri::State;

use super::models::{
    EpisodeHistoryInput, EpisodeInput, EpisodeProgress, MovieInput, SeriesInput, TrackedSeriesItem,
    TrackedSeriesRefresh,
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

/// The ids among `movie_ids` the profile has seen — what a list of movie rows
/// asks instead of one `is_movie_seen` per row.
#[tauri::command]
pub async fn list_seen_movie_ids(
    movie_ids: Vec<i64>,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<i64>, ApiError> {
    timed("list_seen_movie_ids", async {
        ProgressService::new(pool.inner())
            .seen_movie_ids(&movie_ids)
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

/// Watches an already-seen movie again (see `rewatch_movie_impl`).
#[tauri::command]
pub async fn rewatch_movie(
    movie: MovieInput,
    watched_at: String,
    note: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    timed("rewatch_movie", async {
        ProgressService::new(pool.inner())
            .rewatch_movie(movie, &watched_at, note)
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

/// The watched episodes of several series at once, flat (each row carries its
/// `series_id`) — what a list of series asks instead of one
/// `get_episode_progress` per series.
#[tauri::command]
pub async fn get_episode_progress_batch(
    series_ids: Vec<i64>,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<EpisodeProgress>, ApiError> {
    timed("get_episode_progress_batch", async {
        ProgressService::new(pool.inner())
            .get_episode_progress_batch(&series_ids)
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
    total_episodes: Option<i64>,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    timed("refresh_tracked_series_status", async {
        ProgressService::new(pool.inner())
            .refresh_tracked_series_status(series_id, status, total_episodes)
            .await
    })
    .await
}

/// `refresh_tracked_series_status` for many series in one call (the Today Hub
/// refreshes dozens at once). Resolves to the ids whose refresh failed.
#[tauri::command]
pub async fn refresh_tracked_series_statuses(
    refreshes: Vec<TrackedSeriesRefresh>,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<i64>, ApiError> {
    timed("refresh_tracked_series_statuses", async {
        ProgressService::new(pool.inner())
            .refresh_tracked_series_statuses(refreshes)
            .await
    })
    .await
}

#[tauri::command]
pub async fn set_episode_rating(
    series_id: i64,
    episode_id: i64,
    rating: Option<i64>,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    timed("set_episode_rating", async {
        ProgressService::new(pool.inner())
            .set_episode_rating(series_id, episode_id, rating)
            .await
    })
    .await
}
