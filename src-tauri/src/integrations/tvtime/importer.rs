use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::database::new_uuid;
use crate::error::ApiError;
use crate::library::{AutoSyncMedia, StatusTrigger, reconcile_status_impl};
#[cfg(test)]
use crate::library::{CreatedLibraryItem, remove_untouched_items_impl};
use crate::models::MediaType;
use crate::progress::{EpisodeInput, SeriesInput, apply_episodes_outcome_impl};

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
    pub year: Option<i64>,
    pub rating: Option<f64>,
    #[serde(default)]
    pub genres: Vec<String>,
}

/// Result of `import_series_progress_impl`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesImportOutcome {
    /// The episodes this call really inserted (already-watched ones are
    /// left out).
    pub inserted_episode_ids: Vec<i64>,
    /// uuid of the library entry this call created for the series — `None`
    /// when the series was already in the library. The undo of the import
    /// removes only entries listed here.
    pub created_library_item_id: Option<String>,
}

/// Result of `import_movie_seen_impl`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovieImportOutcome {
    /// `false` when the movie was already seen, which skips the import.
    pub inserted: bool,
    /// See `SeriesImportOutcome::created_library_item_id`.
    pub created_library_item_id: Option<String>,
}

/// Batch writes for the TV Time import. Unlike the interactive progress
/// commands this preserves the original watch date of every episode
/// (per-episode `watched_at` override, see `EpisodeInput`) and does not log
/// to the activity log — viewing_events carry the history. (A library entry
/// auto-created as a side effect of this import, via `reconcile_status_impl`
/// inside `apply_episodes_and_log_impl`, still logs its own `LibraryAdd`
/// entry — that's a separate, genuine "added to library" event, not part of
/// the watch history this comment is about.) Reuses
/// `apply_episodes_impl` (same upsert/rollup logic as the interactive
/// episode/season/series toggles) instead of duplicating it.
///
/// Returns the episode ids actually inserted (plus the library entry it
/// created, if any) — already-watched ones are
/// skipped, so a re-import is idempotent, and the caller can tell "newly
/// imported" from "already tracked" (the frontend surfaces the difference as
/// a distinct duplicate count, and only the ids returned here are safe to
/// hand to an "undo this import" action — an already-watched episode was
/// never this import's to undo). The ids come from the write itself
/// (`EpisodesOutcome::changed_episode_ids`), decided under its own lock, so
/// two imports of the same series can never both claim an episode.
pub(super) async fn import_series_progress_impl(
    pool: &SqlitePool,
    profile_id: &str,
    series: SeriesInput,
    episodes: Vec<ImportableEpisode>,
) -> Result<SeriesImportOutcome, ApiError> {
    if episodes.is_empty() {
        return Ok(SeriesImportOutcome {
            inserted_episode_ids: vec![],
            created_library_item_id: None,
        });
    }
    // Canonical first: the latest is picked by string comparison.
    let mut episodes = episodes;
    for episode in &mut episodes {
        episode.watched_at = crate::database::canonical_instant(&episode.watched_at)?;
    }
    let latest_watched_at = episodes
        .iter()
        .map(|episode| episode.watched_at.clone())
        .max()
        .unwrap();

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

    let applied = apply_episodes_outcome_impl(
        pool,
        profile_id,
        &series,
        &episode_inputs,
        true,
        &latest_watched_at,
        None,
        None,
    )
    .await?;

    Ok(SeriesImportOutcome {
        // What the write itself changed, decided under its own lock: an
        // already-watched episode is never this import's to undo.
        inserted_episode_ids: applied.changed_episode_ids,
        created_library_item_id: applied.created_library_item_id,
    })
}

pub(super) async fn import_movie_seen_impl(
    pool: &SqlitePool,
    profile_id: &str,
    mut movie: ImportableMovie,
) -> Result<MovieImportOutcome, ApiError> {
    movie.watched_at = crate::database::canonical_instant(&movie.watched_at)?;
    // The seen check sits under the write lock of the write it guards: two
    // concurrent imports of one movie must not both pass it.
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(ApiError::from)?;
    let already_seen: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM seen_movies WHERE profile_id = $1 AND movie_id = $2")
            .bind(profile_id)
            .bind(movie.movie_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(ApiError::from)?;
    if already_seen.0 > 0 {
        return Ok(MovieImportOutcome {
            inserted: false,
            created_library_item_id: None,
        });
    }

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
    .bind(crate::progress::known_runtime(movie.runtime))
    .execute(&mut *tx)
    .await
    .map_err(ApiError::from)?;

    let media = AutoSyncMedia {
        media_id: movie.movie_id,
        media_type: MediaType::Movie,
        title: movie.title.clone(),
        poster_path: movie.poster_path.clone(),
        backdrop_path: movie.backdrop_path.clone(),
        year: movie.year,
        rating: movie.rating,
        genres: movie.genres.clone(),
    };
    let created_library_item_id = reconcile_status_impl(
        &mut tx,
        pool,
        profile_id,
        &media,
        StatusTrigger::Watched,
        &movie.watched_at,
    )
    .await?;

    tx.commit().await.map_err(ApiError::from)?;
    Ok(MovieImportOutcome {
        inserted: true,
        created_library_item_id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn migrated_pool() -> SqlitePool {
        crate::test_support::migrated_pool_with_connections(2).await
    }

    fn series(id: i64) -> SeriesInput {
        SeriesInput {
            id,
            title: "Test Show".to_string(),
            poster_path: None,
            backdrop_path: None,
            runtime: None,
            number_of_episodes: None,
            year: Some(2019),
            rating: Some(8.0),
            genres: vec!["Drama".to_string()],
            status: None,
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

        let inserted = import_series_progress_impl(&pool, "default", series(9), episodes)
            .await
            .unwrap();
        assert_eq!(inserted.inserted_episode_ids, vec![1, 2]);

        let watched_at: (String,) = sqlx::query_as(
            "SELECT watched_at FROM episode_progress WHERE series_id = 9 AND episode_id = 1",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(watched_at.0, "2020-01-01T00:00:00.000Z");
    }

    #[tokio::test]
    async fn importing_an_empty_episode_list_is_a_no_op() {
        let pool = migrated_pool().await;

        let inserted = import_series_progress_impl(&pool, "default", series(9), vec![])
            .await
            .unwrap();
        assert!(inserted.inserted_episode_ids.is_empty());

        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM episode_progress")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count.0, 0);
    }

    #[tokio::test]
    async fn a_reimport_is_idempotent() {
        let pool = migrated_pool().await;
        let episodes = vec![episode(1, 1, "2020-01-01T00:00:00.000Z")];

        import_series_progress_impl(&pool, "default", series(9), episodes.clone())
            .await
            .unwrap();
        let second = import_series_progress_impl(&pool, "default", series(9), episodes)
            .await
            .unwrap();
        assert!(second.inserted_episode_ids.is_empty());
    }

    #[tokio::test]
    async fn only_reports_the_episodes_actually_newly_inserted_when_some_were_already_watched() {
        let pool = migrated_pool().await;
        import_series_progress_impl(
            &pool,
            "default",
            series(9),
            vec![episode(1, 1, "2020-01-01T00:00:00.000Z")],
        )
        .await
        .unwrap();

        let inserted = import_series_progress_impl(
            &pool,
            "default",
            series(9),
            vec![
                episode(1, 1, "2020-01-01T00:00:00.000Z"),
                episode(2, 2, "2020-06-01T00:00:00.000Z"),
            ],
        )
        .await
        .unwrap();

        assert_eq!(inserted.inserted_episode_ids, vec![2]);
    }

    #[tokio::test]
    async fn does_not_log_history_for_series_import() {
        let pool = migrated_pool().await;
        // Pre-seed the library entry so the import doesn't also auto-create
        // one (which would log its own unrelated LibraryAdd entry).
        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at)
             VALUES ('lib-9', 'default', 9, 'series', 'Test Show', 'planned', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();
        import_series_progress_impl(
            &pool,
            "default",
            series(9),
            vec![episode(1, 1, "2020-01-01T00:00:00.000Z")],
        )
        .await
        .unwrap();

        let history_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM activity_log")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(history_count.0, 0);
    }

    #[tokio::test]
    async fn tracked_series_updated_at_uses_the_latest_imported_watch_date_not_now() {
        let pool = migrated_pool().await;
        let episodes = vec![
            episode(1, 1, "2020-01-01T00:00:00.000Z"),
            episode(2, 2, "2020-06-01T00:00:00.000Z"),
        ];
        import_series_progress_impl(&pool, "default", series(9), episodes)
            .await
            .unwrap();

        let updated_at: (String,) =
            sqlx::query_as("SELECT updated_at FROM tracked_series WHERE series_id = 9")
                .fetch_one(&pool)
                .await
                .unwrap();
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
            year: Some(2020),
            rating: Some(7.5),
            genres: vec!["Drama".to_string()],
        }
    }

    #[tokio::test]
    async fn imports_a_movie_whose_runtime_tmdb_reports_as_zero() {
        let pool = migrated_pool().await;

        let imported = import_movie_seen_impl(
            &pool,
            "default",
            ImportableMovie {
                runtime: Some(0),
                ..movie(1)
            },
        )
        .await
        .unwrap();

        assert!(imported.inserted);
    }

    #[tokio::test]
    async fn imports_a_movie_once_and_skips_it_on_reimport() {
        let pool = migrated_pool().await;

        let first = import_movie_seen_impl(&pool, "default", movie(1))
            .await
            .unwrap();
        assert!(first.inserted);

        let second = import_movie_seen_impl(&pool, "default", movie(1))
            .await
            .unwrap();
        assert!(!second.inserted);

        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM seen_movies WHERE movie_id = 1")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count.0, 1);
    }

    #[tokio::test]
    async fn does_not_log_history_for_movie_import() {
        let pool = migrated_pool().await;
        // Pre-seed the library entry so the import doesn't also auto-create
        // one (which would log its own unrelated LibraryAdd entry).
        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at)
             VALUES ('lib-1', 'default', 1, 'movie', 'Test Movie', 'planned', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();
        import_movie_seen_impl(&pool, "default", movie(1))
            .await
            .unwrap();

        let history_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM activity_log")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(history_count.0, 0);
    }

    #[tokio::test]
    async fn importing_a_watched_movie_creates_a_library_entry_when_none_exists() {
        let pool = migrated_pool().await;

        import_movie_seen_impl(&pool, "default", movie(1))
            .await
            .unwrap();

        let status: Option<String> = sqlx::query_scalar(
            "SELECT status FROM library_items WHERE media_id = 1 AND media_type = 'movie'",
        )
        .fetch_optional(&pool)
        .await
        .unwrap();
        assert_eq!(status, Some("completed".to_string()));
    }

    #[tokio::test]
    async fn importing_a_watched_movie_advances_an_existing_planned_entry_to_completed() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at)
             VALUES ('lib-1', 'default', 1, 'movie', 'Test Movie', 'planned', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();

        import_movie_seen_impl(&pool, "default", movie(1))
            .await
            .unwrap();

        let status: Option<String> = sqlx::query_scalar(
            "SELECT status FROM library_items WHERE media_id = 1 AND media_type = 'movie'",
        )
        .fetch_optional(&pool)
        .await
        .unwrap();
        assert_eq!(status, Some("completed".to_string()));
    }

    async fn library_count(pool: &SqlitePool) -> i64 {
        sqlx::query_scalar("SELECT COUNT(*) FROM library_items")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    /// `imported_at` of an import that finished long after every write it
    /// made (the import stamps rows with the historical watch dates).
    fn finished(id: Option<String>) -> Vec<CreatedLibraryItem> {
        id.into_iter()
            .map(|id| CreatedLibraryItem {
                id,
                imported_at: "2030-01-01T00:00:00.000Z".to_string(),
            })
            .collect()
    }

    #[tokio::test]
    async fn the_import_reports_the_library_entries_it_creates_and_only_those() {
        let pool = migrated_pool().await;
        // Series 9 and movie 2 are in the library before the import.
        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at)
             VALUES ('lib-9', 'default', 9, 'series', 'Old Show', 'planned', 'now', 'now'),
                    ('lib-2', 'default', 2, 'movie', 'Old Movie', 'planned', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let known_series = import_series_progress_impl(
            &pool,
            "default",
            series(9),
            vec![episode(1, 1, "2020-01-01T00:00:00.000Z")],
        )
        .await
        .unwrap();
        let new_series = import_series_progress_impl(
            &pool,
            "default",
            series(10),
            vec![episode(11, 1, "2020-01-01T00:00:00.000Z")],
        )
        .await
        .unwrap();
        let known_movie = import_movie_seen_impl(&pool, "default", movie(2))
            .await
            .unwrap();
        let new_movie = import_movie_seen_impl(&pool, "default", movie(1))
            .await
            .unwrap();

        assert_eq!(known_series.created_library_item_id, None);
        assert_eq!(known_movie.created_library_item_id, None);
        assert!(new_series.created_library_item_id.is_some());
        assert!(new_movie.created_library_item_id.is_some());
        // An already-seen movie is skipped outright, creating nothing.
        let again = import_movie_seen_impl(&pool, "default", movie(1))
            .await
            .unwrap();
        assert!(!again.inserted);
        assert_eq!(again.created_library_item_id, None);
    }

    #[tokio::test]
    async fn undoing_removes_what_the_import_created_and_keeps_what_was_there_before() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at)
             VALUES ('lib-2', 'default', 2, 'movie', 'Old Movie', 'planned', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();
        let known = import_movie_seen_impl(&pool, "default", movie(2))
            .await
            .unwrap();
        let fresh = import_movie_seen_impl(&pool, "default", movie(1))
            .await
            .unwrap();
        let fresh_series = import_series_progress_impl(
            &pool,
            "default",
            series(10),
            vec![episode(11, 1, "2020-01-01T00:00:00.000Z")],
        )
        .await
        .unwrap();
        let mut created = finished(known.created_library_item_id);
        created.extend(finished(fresh.created_library_item_id));
        created.extend(finished(fresh_series.created_library_item_id));
        assert_eq!(created.len(), 2);

        let outcome = remove_untouched_items_impl(&pool, "default", &created)
            .await
            .unwrap();

        assert_eq!((outcome.removed, outcome.kept), (2, 0));
        let left: Vec<i64> = sqlx::query_scalar("SELECT media_id FROM library_items")
            .fetch_all(&pool)
            .await
            .unwrap();
        assert_eq!(left, vec![2], "only the title present before survives");
    }

    #[tokio::test]
    async fn a_watch_after_the_import_keeps_the_entry_even_when_its_status_did_not_move() {
        let pool = migrated_pool().await;
        let imported = import_series_progress_impl(
            &pool,
            "default",
            series(10),
            vec![episode(11, 1, "2020-01-01T00:00:00.000Z")],
        )
        .await
        .unwrap();
        let created: Vec<CreatedLibraryItem> = imported
            .created_library_item_id
            .into_iter()
            .map(|id| CreatedLibraryItem {
                id,
                imported_at: "2026-06-01T00:00:00.000Z".to_string(),
            })
            .collect();

        // The viewer then watches one more episode of the series: it is
        // Watching before and after, but the viewer has touched the title.
        crate::progress::apply_episodes_impl(
            &pool,
            "default",
            &series(10),
            &[EpisodeInput {
                id: 12,
                season_number: 1,
                episode_number: 2,
                runtime: None,
                watched_at: None,
            }],
            true,
            "2026-07-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        let outcome = remove_untouched_items_impl(&pool, "default", &created)
            .await
            .unwrap();
        assert_eq!((outcome.removed, outcome.kept), (0, 1));
        assert_eq!(library_count(&pool).await, 1);
    }

    #[tokio::test]
    async fn an_episode_listed_twice_in_one_import_is_written_once() {
        let pool = migrated_pool().await;
        let outcome = import_series_progress_impl(
            &pool,
            "default",
            series(10),
            vec![
                episode(11, 1, "2020-01-01T00:00:00.000Z"),
                episode(11, 1, "2020-03-01T00:00:00.000Z"),
            ],
        )
        .await
        .unwrap();

        assert_eq!(outcome.inserted_episode_ids, vec![11]);
        let events: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM viewing_events WHERE media_id = 10 AND event_type = 'watched'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(events, 1, "one viewing event per episode");
    }

    #[tokio::test]
    async fn an_interrupted_import_can_be_undone_for_what_it_got_through() {
        let pool = migrated_pool().await;
        // Two movies were imported, the process stopped before the third; the
        // undo list is whatever was recorded, and an id that no longer
        // exists (a previous partial undo) is simply skipped.
        let first = import_movie_seen_impl(&pool, "default", movie(1))
            .await
            .unwrap();
        let second = import_movie_seen_impl(&pool, "default", movie(2))
            .await
            .unwrap();
        let mut recorded = finished(first.created_library_item_id);
        recorded.extend(finished(second.created_library_item_id));
        recorded.extend(finished(Some("lost-with-the-interruption".to_string())));
        assert_eq!(library_count(&pool).await, 2);

        let outcome = remove_untouched_items_impl(&pool, "default", &recorded)
            .await
            .unwrap();
        let repeat = remove_untouched_items_impl(&pool, "default", &recorded)
            .await
            .unwrap();

        assert_eq!((outcome.removed, outcome.kept), (2, 0));
        assert_eq!((repeat.removed, repeat.kept), (0, 0));
        assert_eq!(library_count(&pool).await, 0);
    }
}
