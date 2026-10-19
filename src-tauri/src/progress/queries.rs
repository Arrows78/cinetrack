use sqlx::{QueryBuilder, Sqlite, SqlitePool};

use super::domain::regular_episodes_watched;
use super::models::{EpisodeProgress, TrackedSeriesItem};
use crate::error::ApiError;

/// A caller-bounded batch (the rows of one screen), not "give me everything":
/// the same guard `library::queries` puts on its batch-by-keys read.
const MAX_BATCH_IDS: usize = 500;

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
    rating: Option<i64>,
}

impl EpisodeProgressRow {
    fn into_progress(self, profile_id: &str) -> EpisodeProgress {
        EpisodeProgress {
            id: self.uuid,
            profile_id: Some(profile_id.to_string()),
            series_id: self.series_id,
            episode_id: self.episode_id,
            season_number: self.season_number,
            episode_number: self.episode_number,
            watched: self.watched,
            watched_at: self.watched_at,
            created_at: self.created_at,
            updated_at: self.updated_at,
            rating: self.rating,
        }
    }
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

/// Which of `movie_ids` the profile has seen — a batch form of
/// `is_movie_seen_impl`.
pub(super) async fn list_seen_movie_ids_impl(
    pool: &SqlitePool,
    profile_id: &str,
    movie_ids: &[i64],
) -> Result<Vec<i64>, ApiError> {
    if movie_ids.is_empty() {
        return Ok(Vec::new());
    }
    let movie_ids = &movie_ids[..movie_ids.len().min(MAX_BATCH_IDS)];
    let mut qb: QueryBuilder<Sqlite> =
        QueryBuilder::new("SELECT movie_id FROM seen_movies WHERE profile_id = ");
    qb.push_bind(profile_id.to_string());
    qb.push(" AND movie_id IN (");
    let mut separated = qb.separated(", ");
    for movie_id in movie_ids {
        separated.push_bind(*movie_id);
    }
    separated.push_unseparated(")");
    qb.build_query_scalar()
        .fetch_all(pool)
        .await
        .map_err(ApiError::from)
}

/// The watched episodes of several series in one read — a batch form of
/// `get_episode_progress_impl`, flat: every row carries its `series_id`.
pub(super) async fn get_episode_progress_batch_impl(
    pool: &SqlitePool,
    profile_id: &str,
    series_ids: &[i64],
) -> Result<Vec<EpisodeProgress>, ApiError> {
    if series_ids.is_empty() {
        return Ok(Vec::new());
    }
    let series_ids = &series_ids[..series_ids.len().min(MAX_BATCH_IDS)];
    let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
        "SELECT uuid, series_id, episode_id, season_number, episode_number, watched, watched_at, created_at, updated_at, rating
         FROM episode_progress WHERE watched = 1 AND profile_id = ",
    );
    qb.push_bind(profile_id.to_string());
    qb.push(" AND series_id IN (");
    let mut separated = qb.separated(", ");
    for series_id in series_ids {
        separated.push_bind(*series_id);
    }
    separated.push_unseparated(")");
    let rows: Vec<EpisodeProgressRow> = qb
        .build_query_as()
        .fetch_all(pool)
        .await
        .map_err(ApiError::from)?;
    Ok(rows
        .into_iter()
        .map(|row| row.into_progress(profile_id))
        .collect())
}

pub(super) async fn get_episode_progress_impl(
    pool: &SqlitePool,
    profile_id: &str,
    series_id: i64,
) -> Result<Vec<EpisodeProgress>, ApiError> {
    let rows: Vec<EpisodeProgressRow> = sqlx::query_as(
        "SELECT uuid, series_id, episode_id, season_number, episode_number, watched, watched_at, created_at, updated_at, rating
         FROM episode_progress WHERE profile_id = $1 AND series_id = $2 AND watched = 1",
    )
    .bind(profile_id)
    .bind(series_id)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    Ok(rows
        .into_iter()
        .map(|row| row.into_progress(profile_id))
        .collect())
}

/// The series a profile currently follows: a `tracked_series` row only counts
/// while the series is also in the profile's library. Removing a series from
/// the library keeps its tracking (episode progress and this cache row), so
/// re-adding it brings the progress back, but it stops feeding Watch Next,
/// the Today Hub, reminders and the watch forecast in the meantime.
pub(super) async fn list_tracked_series_impl(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<Vec<TrackedSeriesItem>, ApiError> {
    let rows: Vec<TrackedSeriesRow> = sqlx::query_as(
        concat!(
            "SELECT ts.uuid, ts.series_id, ts.title, ts.poster_path, ts.backdrop_path, ts.total_episodes, ts.status, ts.created_at, ts.updated_at,
                COUNT(ep.episode_id) as watched_episodes
         FROM tracked_series ts
         LEFT JOIN episode_progress ep ON ep.profile_id = ts.profile_id AND ep.series_id = ts.series_id AND ",
            regular_episodes_watched!("ep."),
            "
         WHERE ts.profile_id = $1
           AND EXISTS (
             SELECT 1 FROM library_items li
             WHERE li.profile_id = ts.profile_id AND li.media_id = ts.series_id AND li.media_type = 'series'
           )
         GROUP BY ts.uuid, ts.series_id, ts.title, ts.poster_path, ts.backdrop_path, ts.total_episodes, ts.status, ts.created_at, ts.updated_at
         ORDER BY ts.updated_at DESC"
        ),
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
            // 0 in the cache means TMDB's count was never known: show the
            // watched count rather than "0 episodes".
            total_episodes: row.total_episodes.max(row.watched_episodes),
            watched_episodes: row.watched_episodes,
            status: row.status,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
        .collect())
}
