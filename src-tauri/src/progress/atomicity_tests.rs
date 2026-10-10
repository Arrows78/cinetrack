//! A watch toggle writes up to six tables (seen flag or episode rows, viewing
//! events, the tracked-series rollup, the library entry, the activity log).
//! Whichever write fails, none of the others may stay behind: a "watched"
//! marker without its viewing event skews the stats, an event without its
//! marker makes the next toggle a no-op forever.
//!
//! Failures are injected with a trigger that aborts the insert into a chosen
//! table, one table at a time, so every write position of the sequence is hit.

use sqlx::SqlitePool;
use sqlx::sqlite::SqlitePoolOptions;

use super::models::{EpisodeHistoryInput, EpisodeInput, MovieInput, SeriesInput};
use super::repository::{apply_episodes_and_log_impl, toggle_movie_seen_with_note_impl};
use crate::history::HistoryAction;

async fn migrated_pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    crate::database::migrations::run_migrations(&pool)
        .await
        .unwrap();
    pool
}

const TABLES: [&str; 6] = [
    "seen_movies",
    "episode_progress",
    "viewing_events",
    "tracked_series",
    "library_items",
    "activity_log",
];

async fn content(pool: &SqlitePool) -> Vec<(String, Vec<String>)> {
    let mut all = Vec::new();
    for table in TABLES {
        let columns: Vec<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "SELECT name FROM pragma_table_info('{table}')"
        )))
        .fetch_all(pool)
        .await
        .unwrap();
        let pairs = columns
            .iter()
            .map(|column| format!("'{column}', \"{column}\""))
            .collect::<Vec<_>>()
            .join(", ");
        let rows: Vec<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "SELECT json_object({pairs}) AS row FROM {table} ORDER BY row"
        )))
        .fetch_all(pool)
        .await
        .unwrap();
        all.push((table.to_string(), rows));
    }
    all
}

async fn fail_inserts_into(pool: &SqlitePool, table: &str) {
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "CREATE TRIGGER inject_failure BEFORE INSERT ON {table}
         BEGIN SELECT RAISE(ABORT, 'injected failure'); END"
    )))
    .execute(pool)
    .await
    .unwrap();
}

async fn drop_failure(pool: &SqlitePool) {
    sqlx::query("DROP TRIGGER inject_failure")
        .execute(pool)
        .await
        .unwrap();
}

fn movie() -> MovieInput {
    MovieInput {
        id: 7,
        title: "Movie".to_string(),
        poster_path: None,
        backdrop_path: None,
        runtime: Some(100),
        year: Some(2020),
        rating: Some(7.0),
        genres: vec!["Drama".to_string()],
    }
}

fn series() -> SeriesInput {
    SeriesInput {
        id: 9,
        title: "Show".to_string(),
        poster_path: None,
        backdrop_path: None,
        runtime: Some(40),
        number_of_episodes: Some(2),
        year: Some(2021),
        rating: None,
        genres: vec![],
        status: Some("Ended".to_string()),
    }
}

fn episodes() -> Vec<EpisodeInput> {
    (1..=2)
        .map(|number| EpisodeInput {
            id: 900 + number,
            season_number: 1,
            episode_number: number,
            runtime: Some(40),
            watched_at: None,
        })
        .collect()
}

#[tokio::test]
async fn a_movie_toggle_that_fails_on_any_table_leaves_nothing_behind() {
    for failing_table in [
        "seen_movies",
        "viewing_events",
        "activity_log",
        "library_items",
    ] {
        let pool = migrated_pool().await;
        let before = content(&pool).await;

        fail_inserts_into(&pool, failing_table).await;
        let result = toggle_movie_seen_with_note_impl(
            &pool,
            "default",
            movie(),
            true,
            "2026-01-01T00:00:00.000Z",
            Some("note".to_string()),
        )
        .await;
        assert!(
            result.is_err(),
            "{failing_table}: the injected failure was swallowed"
        );
        assert_eq!(
            content(&pool).await,
            before,
            "{failing_table}: a failed watch left rows behind"
        );

        // The retry then works as if the first call never happened.
        drop_failure(&pool).await;
        toggle_movie_seen_with_note_impl(
            &pool,
            "default",
            movie(),
            true,
            "2026-01-01T00:00:00.000Z",
            None,
        )
        .await
        .unwrap();
        let events: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM viewing_events")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(events, 1, "{failing_table}");
    }
}

#[tokio::test]
async fn an_episode_toggle_that_fails_on_any_table_leaves_nothing_behind() {
    for failing_table in [
        "episode_progress",
        "viewing_events",
        "tracked_series",
        "library_items",
        "activity_log",
    ] {
        let pool = migrated_pool().await;
        let before = content(&pool).await;

        fail_inserts_into(&pool, failing_table).await;
        let result = apply_episodes_and_log_impl(
            &pool,
            "default",
            &series(),
            &episodes(),
            true,
            "2026-01-01T00:00:00.000Z",
            Some(EpisodeHistoryInput {
                action: HistoryAction::SeasonWatched,
                season_number: Some(1),
                episode_number: None,
                episode_title: None,
            }),
            None,
        )
        .await;
        assert!(
            result.is_err(),
            "{failing_table}: the injected failure was swallowed"
        );
        assert_eq!(
            content(&pool).await,
            before,
            "{failing_table}: a failed season mark left rows behind"
        );

        drop_failure(&pool).await;
        let changed = apply_episodes_and_log_impl(
            &pool,
            "default",
            &series(),
            &episodes(),
            true,
            "2026-01-01T00:00:00.000Z",
            None,
            None,
        )
        .await
        .unwrap();
        assert_eq!(
            changed, 2,
            "{failing_table}: the retry must mark both episodes"
        );
    }
}
