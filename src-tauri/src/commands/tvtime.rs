use serde::Deserialize;
use sqlx::SqlitePool;
use tauri::State;

use crate::commands::progress::{apply_episodes_impl, EpisodeInput, SeriesInput};
use crate::database::{current_profile_id, new_uuid};
use crate::error::ApiError;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportableEpisode {
    pub episode_id: i64,
    pub season_number: i64,
    pub episode_number: i64,
    pub watched_at: String,
    pub runtime_minutes: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportableMovie {
    pub movie_id: i64,
    pub title: String,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub runtime: Option<i64>,
    pub watched_at: String,
}

/// Batch writes for the TV Time import. Unlike the interactive progress
/// commands this preserves the original watch date of every episode
/// (per-episode `watched_at` override, see `EpisodeInput`) and does not log
/// to the activity log — viewing_events carry the history. Reuses
/// `apply_episodes_impl` (same upsert/rollup logic as the interactive
/// episode/season/series toggles) instead of duplicating it. Returns the
/// number of episodes actually inserted — already-watched ones are skipped,
/// so a re-import is idempotent.
async fn import_series_progress_impl(
    pool: &SqlitePool,
    profile_id: &str,
    series: SeriesInput,
    episodes: Vec<ImportableEpisode>,
) -> Result<i64, ApiError> {
    if episodes.is_empty() {
        return Ok(0);
    }
    let latest_watched_at = episodes.iter().map(|episode| episode.watched_at.clone()).max().unwrap();

    let episode_inputs: Vec<EpisodeInput> = episodes
        .into_iter()
        .map(|episode| EpisodeInput {
            id: episode.episode_id,
            season_number: episode.season_number,
            episode_number: episode.episode_number,
            runtime: episode.runtime_minutes,
            watched_at: Some(episode.watched_at),
        })
        .collect();

    apply_episodes_impl(pool, profile_id, &series, &episode_inputs, true, &latest_watched_at).await
}

async fn import_movie_seen_impl(pool: &SqlitePool, profile_id: &str, movie: ImportableMovie) -> Result<bool, ApiError> {
    let already_seen: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM seen_movies WHERE profile_id = $1 AND movie_id = $2")
        .bind(profile_id)
        .bind(movie.movie_id)
        .fetch_one(pool)
        .await
        .map_err(ApiError::from)?;
    if already_seen.0 > 0 {
        return Ok(false);
    }

    let mut tx = pool.begin().await.map_err(ApiError::from)?;

    sqlx::query(
        "INSERT INTO seen_movies (uuid, profile_id, movie_id, title, poster_path, backdrop_path, watched_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$7)",
    )
    .bind(new_uuid())
    .bind(profile_id)
    .bind(movie.movie_id)
    .bind(&movie.title)
    .bind(&movie.poster_path)
    .bind(&movie.backdrop_path)
    .bind(&movie.watched_at)
    .execute(&mut *tx)
    .await
    .map_err(ApiError::from)?;

    sqlx::query(
        "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, episode_id, season_number, episode_number, created_at)
         VALUES ($1,$2,$3,'movie',$4,'watched',$5,$6,NULL,NULL,NULL,$5)",
    )
    .bind(new_uuid())
    .bind(profile_id)
    .bind(movie.movie_id)
    .bind(&movie.title)
    .bind(&movie.watched_at)
    .bind(movie.runtime)
    .execute(&mut *tx)
    .await
    .map_err(ApiError::from)?;

    tx.commit().await.map_err(ApiError::from)?;
    Ok(true)
}

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
pub async fn import_movie_seen(movie: ImportableMovie, pool: State<'_, SqlitePool>) -> Result<bool, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    import_movie_seen_impl(&pool, &profile_id, movie).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(2).connect("sqlite::memory:").await.unwrap();
        crate::database::migrations::run_migrations(&pool).await.unwrap();
        pool
    }

    fn series(id: i64) -> SeriesInput {
        SeriesInput {
            id,
            title: "Test Show".to_string(),
            poster_path: None,
            backdrop_path: None,
            runtime: None,
            number_of_episodes: None,
        }
    }

    fn episode(id: i64, episode_number: i64, watched_at: &str) -> ImportableEpisode {
        ImportableEpisode {
            episode_id: id,
            season_number: 1,
            episode_number,
            watched_at: watched_at.to_string(),
            runtime_minutes: Some(24),
        }
    }

    #[tokio::test]
    async fn imports_episodes_preserving_each_ones_original_watch_date() {
        let pool = migrated_pool().await;
        let episodes = vec![
            episode(1, 1, "2020-01-01T00:00:00.000Z"),
            episode(2, 2, "2020-06-01T00:00:00.000Z"),
        ];

        let inserted = import_series_progress_impl(&pool, "default", series(9), episodes).await.unwrap();
        assert_eq!(inserted, 2);

        let watched_at: (String,) =
            sqlx::query_as("SELECT watched_at FROM episode_progress WHERE series_id = 9 AND episode_id = 1")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(watched_at.0, "2020-01-01T00:00:00.000Z");
    }

    #[tokio::test]
    async fn a_reimport_is_idempotent() {
        let pool = migrated_pool().await;
        let episodes = vec![episode(1, 1, "2020-01-01T00:00:00.000Z")];

        import_series_progress_impl(&pool, "default", series(9), episodes.clone()).await.unwrap();
        let second = import_series_progress_impl(&pool, "default", series(9), episodes).await.unwrap();
        assert_eq!(second, 0);
    }

    #[tokio::test]
    async fn does_not_log_history_for_series_import() {
        let pool = migrated_pool().await;
        import_series_progress_impl(&pool, "default", series(9), vec![episode(1, 1, "2020-01-01T00:00:00.000Z")])
            .await
            .unwrap();

        let history_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM activity_log").fetch_one(&pool).await.unwrap();
        assert_eq!(history_count.0, 0);
    }

    #[tokio::test]
    async fn tracked_series_updated_at_uses_the_latest_imported_watch_date_not_now() {
        let pool = migrated_pool().await;
        let episodes = vec![
            episode(1, 1, "2020-01-01T00:00:00.000Z"),
            episode(2, 2, "2020-06-01T00:00:00.000Z"),
        ];
        import_series_progress_impl(&pool, "default", series(9), episodes).await.unwrap();

        let updated_at: (String,) =
            sqlx::query_as("SELECT updated_at FROM tracked_series WHERE series_id = 9").fetch_one(&pool).await.unwrap();
        assert_eq!(updated_at.0, "2020-06-01T00:00:00.000Z");
    }

    fn movie(id: i64) -> ImportableMovie {
        ImportableMovie {
            movie_id: id,
            title: "Test Movie".to_string(),
            poster_path: None,
            backdrop_path: None,
            runtime: Some(100),
            watched_at: "2020-01-01T00:00:00.000Z".to_string(),
        }
    }

    #[tokio::test]
    async fn imports_a_movie_once_and_skips_it_on_reimport() {
        let pool = migrated_pool().await;

        let first = import_movie_seen_impl(&pool, "default", movie(1)).await.unwrap();
        assert!(first);

        let second = import_movie_seen_impl(&pool, "default", movie(1)).await.unwrap();
        assert!(!second);

        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM seen_movies WHERE movie_id = 1").fetch_one(&pool).await.unwrap();
        assert_eq!(count.0, 1);
    }

    #[tokio::test]
    async fn does_not_log_history_for_movie_import() {
        let pool = migrated_pool().await;
        import_movie_seen_impl(&pool, "default", movie(1)).await.unwrap();

        let history_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM activity_log").fetch_one(&pool).await.unwrap();
        assert_eq!(history_count.0, 0);
    }
}
