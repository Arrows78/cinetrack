use sqlx::SqlitePool;

use super::models::{EpisodeProgress, TrackedSeriesItem};
use crate::error::ApiError;

#[derive(sqlx::FromRow)]
struct EpisodeProgressRow {
    uuid: String,
    series_id: i64,
    episode_id: i64,
    season_number: i64,
    episode_number: i64,
    watched: bool,
    watched_at: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(sqlx::FromRow)]
struct TrackedSeriesRow {
    uuid: String,
    series_id: i64,
    title: String,
    poster_path: Option<String>,
    backdrop_path: Option<String>,
    total_episodes: i64,
    status: Option<String>,
    created_at: String,
    updated_at: String,
    watched_episodes: i64,
}

pub(super) async fn is_movie_seen_impl<'e, E>(
    executor: E,
    profile_id: &str,
    movie_id: i64,
) -> Result<bool, ApiError>
where
    E: sqlx::Executor<'e, Database = sqlx::Sqlite>,
{
    let row: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM seen_movies WHERE profile_id = $1 AND movie_id = $2")
            .bind(profile_id)
            .bind(movie_id)
            .fetch_one(executor)
            .await
            .map_err(ApiError::from)?;
    Ok(row.0 > 0)
}

pub(super) async fn get_episode_progress_impl(
    pool: &SqlitePool,
    profile_id: &str,
    series_id: i64,
) -> Result<Vec<EpisodeProgress>, ApiError> {
    let rows: Vec<EpisodeProgressRow> = sqlx::query_as(
        "SELECT uuid, series_id, episode_id, season_number, episode_number, watched, watched_at, created_at, updated_at
         FROM episode_progress WHERE profile_id = $1 AND series_id = $2 AND watched = 1",
    )
    .bind(profile_id)
    .bind(series_id)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    Ok(rows
        .into_iter()
        .map(|row| EpisodeProgress {
            id: row.uuid,
            profile_id: Some(profile_id.to_string()),
            series_id: row.series_id,
            episode_id: row.episode_id,
            season_number: row.season_number,
            episode_number: row.episode_number,
            watched: row.watched,
            watched_at: row.watched_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
        .collect())
}

pub(super) async fn list_tracked_series_impl(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<Vec<TrackedSeriesItem>, ApiError> {
    let rows: Vec<TrackedSeriesRow> = sqlx::query_as(
        "SELECT ts.uuid, ts.series_id, ts.title, ts.poster_path, ts.backdrop_path, ts.total_episodes, ts.status, ts.created_at, ts.updated_at,
                COUNT(ep.episode_id) as watched_episodes
         FROM tracked_series ts
         LEFT JOIN episode_progress ep ON ep.profile_id = ts.profile_id AND ep.series_id = ts.series_id AND ep.watched = 1
         WHERE ts.profile_id = $1
         GROUP BY ts.uuid, ts.series_id, ts.title, ts.poster_path, ts.backdrop_path, ts.total_episodes, ts.status, ts.created_at, ts.updated_at
         ORDER BY ts.updated_at DESC",
    )
    .bind(profile_id)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    Ok(rows
        .into_iter()
        .map(|row| TrackedSeriesItem {
            id: row.uuid,
            profile_id: Some(profile_id.to_string()),
            series_id: row.series_id,
            title: row.title,
            poster_path: row.poster_path,
            backdrop_path: row.backdrop_path,
            total_episodes: row.total_episodes,
            watched_episodes: row.watched_episodes,
            status: row.status,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
        .collect())
}
