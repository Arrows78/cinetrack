//! Before/after for the consumers that used to read the whole library only to
//! filter or count it in TypeScript (see docs/performance.md). "Before" runs
//! the same Rust command the old code called (`list_library`, which maps and
//! serializes every row) plus the same filtering the TypeScript did, ported
//! literally; "after" is the dedicated aggregate command.
//!
//! The "before" side is a lower bound: it excludes the IPC transfer and JSON
//! parse of the rows in the webview, and Rust runs the ported scans faster
//! than the JavaScript engine would.
//!
//! Run: `pnpm perf:library-reads`.

use std::time::{Duration, Instant};

use sqlx::SqlitePool;
use tauri::{Manager, State};

use super::fixtures::{migrated_pool, seed_scale_fixture};
use crate::library::{get_library_status_counts, list_library, list_stale_planned_library_items};
use crate::stats::queries::viewing_events::list_viewing_events_for_year_impl;
use crate::stats::queries::year_favourite_genre::get_year_favourite_genre_impl;

const WARMUP: usize = 2;
const SAMPLES: usize = 9;
const YEAR_START: &str = "2026-01-01T00:00:00.000Z";
const YEAR_END: &str = "2027-01-01T00:00:00.000Z";
const STALE_BEFORE: &str = "2026-05-16T00:00:00.000Z";
const CARD_ROWS: i64 = 4;

fn median(samples: &mut [Duration]) -> f64 {
    samples.sort();
    samples[samples.len() / 2].as_secs_f64() * 1_000.0
}

async fn time<F, Fut, T>(mut run: F) -> (f64, T)
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = T>,
{
    for _ in 0..WARMUP {
        run().await;
    }
    let mut samples = Vec::with_capacity(SAMPLES);
    let mut last = None;
    for _ in 0..SAMPLES {
        let started = Instant::now();
        last = Some(run().await);
        samples.push(started.elapsed());
    }
    (median(&mut samples), last.unwrap())
}

/// The fixture is all "watching/completed" with a single genre; give it
/// planned titles (a third), half of them untouched for months, and several
/// genres, so the three computations have something to find.
async fn shape_fixture(pool: &SqlitePool) {
    sqlx::query(
        "UPDATE library_items SET
           status = CASE WHEN CAST(media_id AS INTEGER) % 3 = 0 THEN 'planned' ELSE status END,
           completed_at = CASE WHEN CAST(media_id AS INTEGER) % 3 = 0 THEN NULL ELSE completed_at END,
           genres = CASE CAST(media_id AS INTEGER) % 4
                      WHEN 0 THEN '[\"Drama\",\"Comedy\"]'
                      WHEN 1 THEN '[\"Action\",\"Drama\"]'
                      WHEN 2 THEN '[\"Comedy\"]'
                      ELSE '[\"Thriller\",\"Action\",\"Drama\"]' END,
           updated_at = CASE WHEN CAST(media_id AS INTEGER) % 6 = 0
                             THEN '2026-02-01T00:00:00.000Z' ELSE '2026-08-01T00:00:00.000Z' END",
    )
    .execute(pool)
    .await
    .unwrap();
}

async fn measure(library_items: i64, viewing_events: i64) {
    let pool = migrated_pool().await;
    seed_scale_fixture(&pool, library_items, viewing_events).await;
    shape_fixture(&pool).await;

    let app = tauri::test::mock_app();
    app.manage(pool.clone());

    // 1. Favourite genre of the year.
    let (before_genre_ms, before_genre) = time(|| async {
        let state: State<'_, SqlitePool> = app.state();
        let library = list_library(None, state).await.unwrap();
        let _ipc = serde_json::to_string(&library).unwrap();
        let events = list_viewing_events_for_year_impl(&pool, "default", YEAR_START, YEAR_END)
            .await
            .unwrap();
        let mut counts: Vec<(String, usize)> = Vec::new();
        for item in &library {
            if events
                .iter()
                .any(|event| event.media_id == item.media_id && event.media_type == item.media_type)
            {
                for genre in &item.genres {
                    match counts.iter_mut().find(|(name, _)| name == genre) {
                        Some(entry) => entry.1 += 1,
                        None => counts.push((genre.clone(), 1)),
                    }
                }
            }
        }
        counts.sort_by_key(|entry| std::cmp::Reverse(entry.1));
        counts.into_iter().next().map(|(genre, _)| genre)
    })
    .await;
    let (after_genre_ms, after_genre) = time(|| async {
        get_year_favourite_genre_impl(&pool, "default", YEAR_START, YEAR_END)
            .await
            .unwrap()
    })
    .await;
    assert_eq!(before_genre, after_genre, "year genre must not change");

    // 2. Planned count.
    let (before_count_ms, before_count) = time(|| async {
        let state: State<'_, SqlitePool> = app.state();
        let library = list_library(None, state).await.unwrap();
        let _ipc = serde_json::to_string(&library).unwrap();
        library
            .iter()
            .filter(|item| item.status.as_db_str() == "planned")
            .count() as i64
    })
    .await;
    let (after_count_ms, after_count) = time(|| async {
        let state: State<'_, SqlitePool> = app.state();
        get_library_status_counts(state).await.unwrap().planned
    })
    .await;
    assert_eq!(before_count, after_count, "planned count must not change");

    // 3. Stale planned card (first CARD_ROWS stale titles).
    let (before_stale_ms, before_stale) = time(|| async {
        let state: State<'_, SqlitePool> = app.state();
        let library = list_library(None, state).await.unwrap();
        let _ipc = serde_json::to_string(&library).unwrap();
        library
            .iter()
            .filter(|item| {
                item.status.as_db_str() == "planned" && item.updated_at.as_str() <= STALE_BEFORE
            })
            .take(CARD_ROWS as usize)
            .map(|item| item.media_id)
            .collect::<Vec<_>>()
    })
    .await;
    let (after_stale_ms, after_stale) = time(|| async {
        let state: State<'_, SqlitePool> = app.state();
        list_stale_planned_library_items(STALE_BEFORE.to_string(), CARD_ROWS, state)
            .await
            .unwrap()
            .iter()
            .map(|item| item.media_id)
            .collect::<Vec<_>>()
    })
    .await;
    assert_eq!(before_stale, after_stale, "stale card must not change");

    let payload = {
        let state: State<'_, SqlitePool> = app.state();
        serde_json::to_string(&list_library(None, state).await.unwrap())
            .unwrap()
            .len()
    };

    println!(
        "library {library_items:>6} | events {viewing_events:>6} | full-read payload {:>5.1} MB\n  \
         year favourite genre : {before_genre_ms:>8.1} ms -> {after_genre_ms:>6.1} ms\n  \
         planned count        : {before_count_ms:>8.1} ms -> {after_count_ms:>6.1} ms\n  \
         stale planned card   : {before_stale_ms:>8.1} ms -> {after_stale_ms:>6.1} ms",
        payload as f64 / 1_048_576.0,
    );
}

#[tokio::test]
#[ignore = "manual before/after benchmark; run with `pnpm perf:library-reads`"]
async fn benchmark_library_reads_before_and_after_aggregate_queries() {
    println!("median of {SAMPLES} runs, in-memory SQLite, Rust only (no IPC / webview)");
    measure(10_000, 50_000).await;
    measure(50_000, 100_000).await;
}
