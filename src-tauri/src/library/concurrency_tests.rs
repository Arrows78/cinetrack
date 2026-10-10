//! Two callers hitting the same library entry at once (a double click, a retry
//! racing the original request) must behave like two calls in sequence: one
//! history row, no field silently reverted. These need several real
//! connections, so they run against a file-backed WAL database like the app's,
//! not an in-memory one.

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use sqlx::SqlitePool;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};

use super::domain::LibraryStatus;
use super::models::{LibraryPatch, MediaSummaryInput};
use super::repository::{remove_impl, upsert_impl};
use crate::models::MediaType;

async fn file_pool(label: &str) -> (SqlitePool, PathBuf) {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let path = std::env::temp_dir().join(format!("cinetrack-library-{label}-{unique}.db"));
    let options = SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(std::time::Duration::from_secs(20));
    let pool = SqlitePoolOptions::new()
        .max_connections(6)
        .connect_with(options)
        .await
        .unwrap();
    crate::database::migrations::run_migrations(&pool)
        .await
        .unwrap();
    (pool, path)
}

fn media(id: i64) -> MediaSummaryInput {
    MediaSummaryInput {
        id,
        media_type: MediaType::Movie,
        title: format!("Movie {id}"),
        poster_path: None,
        backdrop_path: None,
        year: Some(2020),
        rating: None,
        genres: vec![],
    }
}

async fn history_count(pool: &SqlitePool, action: &str, media_id: i64) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM activity_log WHERE action = $1 AND media_id = $2")
        .bind(action)
        .bind(media_id)
        .fetch_one(pool)
        .await
        .unwrap()
}

const ROUNDS: i64 = 15;
const CALLERS: usize = 4;

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn concurrent_removals_of_the_same_title_log_it_once() {
    let (pool, path) = file_pool("remove").await;

    for media_id in 1..=ROUNDS {
        upsert_impl(&pool, media(media_id), LibraryPatch::default(), "default")
            .await
            .unwrap();

        let mut handles = Vec::new();
        for _ in 0..CALLERS {
            let pool = pool.clone();
            handles.push(tokio::spawn(async move {
                remove_impl(&pool, "default", media_id, MediaType::Movie).await
            }));
        }
        for handle in handles {
            handle.await.unwrap().unwrap();
        }

        assert_eq!(
            history_count(&pool, "watchlist:remove", media_id).await,
            1,
            "title {media_id} was removed once but logged as removed several times"
        );
    }

    pool.close().await;
    let _ = std::fs::remove_file(&path);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn concurrent_first_saves_of_the_same_title_log_one_addition() {
    let (pool, path) = file_pool("add").await;

    for media_id in 1..=ROUNDS {
        let mut handles = Vec::new();
        for _ in 0..CALLERS {
            let pool = pool.clone();
            handles.push(tokio::spawn(async move {
                upsert_impl(
                    &pool,
                    media(media_id),
                    LibraryPatch {
                        status: Some(LibraryStatus::Planned),
                        ..Default::default()
                    },
                    "default",
                )
                .await
            }));
        }
        for handle in handles {
            handle.await.unwrap().unwrap();
        }

        assert_eq!(
            history_count(&pool, "watchlist:add", media_id).await,
            1,
            "title {media_id} was added once but logged as added several times"
        );
    }

    pool.close().await;
    let _ = std::fs::remove_file(&path);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn two_edits_of_different_fields_made_at_once_both_survive() {
    let (pool, path) = file_pool("edits").await;

    for media_id in 1..=ROUNDS {
        upsert_impl(&pool, media(media_id), LibraryPatch::default(), "default")
            .await
            .unwrap();

        let favourite_pool = pool.clone();
        let notes_pool = pool.clone();
        let favourite = tokio::spawn(async move {
            upsert_impl(
                &favourite_pool,
                media(media_id),
                LibraryPatch {
                    favourite: Some(true),
                    ..Default::default()
                },
                "default",
            )
            .await
        });
        let notes = tokio::spawn(async move {
            upsert_impl(
                &notes_pool,
                media(media_id),
                LibraryPatch {
                    notes: Some(Some("a note".to_string())),
                    ..Default::default()
                },
                "default",
            )
            .await
        });
        favourite.await.unwrap().unwrap();
        notes.await.unwrap().unwrap();

        let (favourite, notes): (bool, Option<String>) = sqlx::query_as(
            "SELECT favourite, notes FROM library_items WHERE media_id = $1 AND profile_id = 'default'",
        )
        .bind(media_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(
            favourite && notes.as_deref() == Some("a note"),
            "title {media_id}: one of two concurrent edits was silently reverted (favourite={favourite}, notes={notes:?})"
        );
    }

    pool.close().await;
    let _ = std::fs::remove_file(&path);
}
