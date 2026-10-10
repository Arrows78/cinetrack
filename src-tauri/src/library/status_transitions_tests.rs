//! Maps every way a library entry's status can change (manual edit, auto-sync
//! from viewing, series refresh) and what each does to `started_at` /
//! `completed_at`.

use sqlx::SqlitePool;
use sqlx::sqlite::SqlitePoolOptions;

use super::domain::LibraryStatus;
use super::models::{LibraryPatch, MediaSummaryInput};
use super::queries::get_impl;
use super::repository::upsert_impl;
use crate::models::MediaType;
use crate::progress::{EpisodeInput, SeriesInput, apply_episodes_impl};

const ALL: [LibraryStatus; 5] = [
    LibraryStatus::Planned,
    LibraryStatus::Watching,
    LibraryStatus::Paused,
    LibraryStatus::Completed,
    LibraryStatus::Dropped,
];

async fn migrated_pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(4)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    crate::database::migrations::run_migrations(&pool)
        .await
        .unwrap();
    pool
}

fn show_media(id: i64) -> MediaSummaryInput {
    MediaSummaryInput {
        id,
        media_type: MediaType::Series,
        title: "Show".to_string(),
        poster_path: None,
        backdrop_path: None,
        year: Some(2020),
        rating: None,
        genres: vec![],
    }
}

fn show(id: i64, total: i64, status: &str) -> SeriesInput {
    SeriesInput {
        id,
        title: "Show".to_string(),
        poster_path: None,
        backdrop_path: None,
        runtime: Some(40),
        number_of_episodes: Some(total),
        year: Some(2020),
        rating: None,
        genres: vec![],
        status: Some(status.to_string()),
    }
}

fn ep(id: i64, number: i64) -> EpisodeInput {
    EpisodeInput {
        id,
        season_number: 1,
        episode_number: number,
        runtime: None,
        watched_at: None,
    }
}

async fn set_status(pool: &SqlitePool, id: i64, status: LibraryStatus) {
    upsert_impl(
        pool,
        show_media(id),
        LibraryPatch {
            status: Some(status),
            ..Default::default()
        },
        "default",
    )
    .await
    .unwrap();
}

async fn dates(pool: &SqlitePool, id: i64) -> (String, bool, bool) {
    let item = get_impl(pool, "default", id, MediaType::Series)
        .await
        .unwrap()
        .unwrap();
    (
        item.status.as_db_str().to_string(),
        item.started_at.is_some(),
        item.completed_at.is_some(),
    )
}

/// The rule every transition must leave behind: `completed_at` is set exactly
/// while the status is Completed, and a title that is Watching has a
/// `started_at` (which, once set, is never cleared).
fn assert_dates_consistent(context: &str, state: &(String, bool, bool), started_before: bool) {
    let (status, started, completed) = state;
    assert_eq!(
        *completed,
        status == "completed",
        "{context}: completed_at must be set exactly while Completed ({state:?})"
    );
    if status == "watching" {
        assert!(
            *started,
            "{context}: Watching without started_at ({state:?})"
        );
    }
    if started_before {
        assert!(*started, "{context}: started_at was cleared ({state:?})");
    }
}

#[tokio::test]
async fn every_manual_transition_keeps_started_and_completed_dates_consistent() {
    let pool = migrated_pool().await;
    let mut id = 100;
    for first in ALL {
        for second in ALL {
            for third in ALL {
                id += 1;
                set_status(&pool, id, first).await;
                let after_first = dates(&pool, id).await;
                set_status(&pool, id, second).await;
                let after_second = dates(&pool, id).await;
                set_status(&pool, id, third).await;
                let after_third = dates(&pool, id).await;
                let context = format!("{first:?} -> {second:?} -> {third:?}");
                assert_dates_consistent(&context, &after_first, false);
                assert_dates_consistent(&context, &after_second, after_first.1);
                assert_dates_consistent(&context, &after_third, after_second.1);
            }
        }
    }
}

#[tokio::test]
async fn auto_sync_from_viewing_keeps_started_and_completed_dates_consistent() {
    let pool = migrated_pool().await;
    let mut id = 500;
    for from in ALL {
        // First episode of an ongoing series.
        id += 1;
        set_status(&pool, id, from).await;
        let before = dates(&pool, id).await;
        apply_episodes_impl(
            &pool,
            "default",
            &show(id, 3, "Returning Series"),
            &[ep(id * 10 + 1, 1)],
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();
        let after = dates(&pool, id).await;
        assert_dates_consistent(&format!("{from:?} + first episode"), &after, before.1);

        // Finale of an ended series.
        id += 1;
        set_status(&pool, id, from).await;
        let before = dates(&pool, id).await;
        apply_episodes_impl(
            &pool,
            "default",
            &show(id, 1, "Ended"),
            &[ep(id * 10 + 1, 1)],
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();
        let after = dates(&pool, id).await;
        assert_dates_consistent(&format!("{from:?} + finale"), &after, before.1);
    }
}
