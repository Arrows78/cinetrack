//! Latency of the library reads whose ORDER BY or filter has no index of its
//! own (or has one that only covers part of it), on a library shaped like a
//! real one: spread-out timestamps, every status, a few favourites, rated and
//! unrated titles. The plain scale fixture gives every row the same timestamp,
//! so it cannot tell an index-ordered read from a sorted one.
//!
//! The query-plan tests (`query_plans.rs`) prove each read is indexed; this
//! measures what that is worth. Run before and after a schema change:
//! `pnpm perf:library-indexes` (release build, in-memory SQLite, Rust only).

use std::time::{Duration, Instant};

use sqlx::SqlitePool;
use tauri::{Manager, State};

use super::fixtures::migrated_pool;
use crate::library::{LibrarySort, LibraryStatus, get_best_recommendation_seed, list_library_page};
use crate::models::MediaType;

const WARMUP: usize = 2;
const SAMPLES: usize = 15;
const PAGE: i64 = 50;

fn median(samples: &mut [Duration]) -> f64 {
    samples.sort();
    samples[samples.len() / 2].as_secs_f64() * 1_000.0
}

async fn time<F, Fut, T>(mut run: F) -> f64
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = T>,
{
    for _ in 0..WARMUP {
        run().await;
    }
    let mut samples = Vec::with_capacity(SAMPLES);
    for _ in 0..SAMPLES {
        let started = Instant::now();
        run().await;
        samples.push(started.elapsed());
    }
    median(&mut samples)
}

/// Deterministic, collision-free shuffles so the timestamps are spread out
/// and unrelated to each other (a recently added title is not the most
/// recently updated one).
fn stamp(base_day: i64, index: i64, count: i64, multiplier: i64) -> String {
    let slot = (index * multiplier) % count;
    let day = base_day + slot / 1440;
    let minute = slot % 1440;
    // Every month has 28 days here; only ordering matters.
    format!(
        "2024-{:02}-{:02}T{:02}:{:02}:00.000Z",
        (day / 28) % 12 + 1,
        day % 28 + 1,
        minute / 60,
        minute % 60
    )
}

pub(super) async fn seed_realistic_library(pool: &SqlitePool, library_items: i64) {
    let mut tx = pool.begin().await.unwrap();
    // A prime close to the count keeps `index * multiplier % count` a
    // permutation as long as the count is not a multiple of it.
    for index in 0..library_items {
        let media_type = if index % 5 == 0 { "series" } else { "movie" };
        let status = match index % 20 {
            0..=7 => "planned",
            8..=10 => "watching",
            11 => "paused",
            12..=18 => "completed",
            _ => "dropped",
        };
        let completed_at = (status == "completed").then(|| stamp(0, index, library_items, 7919));
        let user_rating = (index % 3 == 0).then_some(((index % 10) + 1) as f64);
        let favourite = i64::from(index % 33 == 0);
        let created_at = stamp(0, index, library_items, 104_729);
        let updated_at = stamp(0, index, library_items, 15_485_863);
        sqlx::query(
            "INSERT INTO library_items (
               uuid, profile_id, media_id, media_type, title, genres, status,
               favourite, user_rating, completed_at, created_at, updated_at
             ) VALUES ($1, 'default', $2, $3, $4, '[\"Drama\"]', $5, $6, $7, $8, $9, $10)",
        )
        .bind(format!("idx-library-{index}"))
        .bind(index + 1)
        .bind(media_type)
        .bind(format!("Title {index:06}"))
        .bind(status)
        .bind(favourite)
        .bind(user_rating)
        .bind(completed_at)
        .bind(created_at)
        .bind(updated_at)
        .execute(&mut *tx)
        .await
        .unwrap();
    }
    tx.commit().await.unwrap();
}

async fn page(
    app: &tauri::App<tauri::test::MockRuntime>,
    sort: LibrarySort,
    status: Option<LibraryStatus>,
    favourites_only: bool,
    media_type: Option<MediaType>,
) -> usize {
    page_at(app, sort, status, favourites_only, media_type, None)
        .await
        .0
}

async fn page_at(
    app: &tauri::App<tauri::test::MockRuntime>,
    sort: LibrarySort,
    status: Option<LibraryStatus>,
    favourites_only: bool,
    media_type: Option<MediaType>,
    cursor: Option<String>,
) -> (usize, Option<String>) {
    let state: State<'_, SqlitePool> = app.state();
    let page = list_library_page(
        media_type,
        status,
        favourites_only,
        None,
        sort,
        None,
        cursor,
        PAGE,
        state,
    )
    .await
    .unwrap();
    (page.items.len(), page.next_cursor)
}

/// The cursor `depth` pages into a sort, so the timed fetch is the one a user
/// scrolling that far would trigger.
async fn cursor_after(
    app: &tauri::App<tauri::test::MockRuntime>,
    sort: LibrarySort,
    depth: usize,
) -> Option<String> {
    let mut cursor = None;
    for _ in 0..depth {
        cursor = page_at(app, sort, None, false, None, cursor).await.1;
    }
    cursor
}

/// What every index costs on the write side: the rows a heavy import or a
/// long binge adds, written the way the app writes them (one transaction).
async fn time_writes(pool: &SqlitePool, library_items: i64) -> (f64, f64) {
    let started = Instant::now();
    let mut tx = pool.begin().await.unwrap();
    for index in 0..20_000_i64 {
        let media_id = index % library_items + 1;
        sqlx::query(
            "INSERT INTO viewing_events (
               uuid, profile_id, media_id, media_type, title, event_type,
               watched_at, duration_minutes, episode_id, created_at
             ) VALUES ($1, 'default', $2, 'series', 'Title', 'watched', $3, 45, $4, $3)",
        )
        .bind(format!("idx-event-{index}"))
        .bind(media_id)
        .bind(stamp(0, index, 20_000, 7919))
        .bind(index + 1)
        .execute(&mut *tx)
        .await
        .unwrap();
    }
    tx.commit().await.unwrap();
    let events_ms = started.elapsed().as_secs_f64() * 1_000.0;

    let started = Instant::now();
    let mut tx = pool.begin().await.unwrap();
    for index in 0..10_000_i64 {
        sqlx::query(
            "INSERT INTO episode_progress (
               uuid, profile_id, series_id, episode_id, season_number, episode_number,
               watched, watched_at, created_at, updated_at
             ) VALUES ($1, 'default', $2, $3, 1, 1, 1, $4, $4, $4)",
        )
        .bind(format!("idx-progress-{index}"))
        .bind(index % library_items + 1)
        .bind(index + 1)
        .bind(stamp(0, index, 10_000, 7919))
        .execute(&mut *tx)
        .await
        .unwrap();
    }
    tx.commit().await.unwrap();
    (events_ms, started.elapsed().as_secs_f64() * 1_000.0)
}

async fn measure(library_items: i64) {
    let pool = migrated_pool().await;
    seed_realistic_library(&pool, library_items).await;
    let (events_write_ms, progress_write_ms) = time_writes(&pool, library_items).await;
    let app = tauri::test::mock_app();
    app.manage(pool.clone());

    let date_added = time(|| page(&app, LibrarySort::DateAdded, None, false, None)).await;
    let date_completed = time(|| page(&app, LibrarySort::DateCompleted, None, false, None)).await;
    let recent_rare_status = time(|| {
        page(
            &app,
            LibrarySort::Recent,
            Some(LibraryStatus::Paused),
            false,
            None,
        )
    })
    .await;
    let recent_favourites = time(|| page(&app, LibrarySort::Recent, None, true, None)).await;
    let recent_series = time(|| {
        page(
            &app,
            LibrarySort::Recent,
            Some(LibraryStatus::Paused),
            false,
            Some(MediaType::Series),
        )
    })
    .await;
    let mut deep = Vec::new();
    for (label, sort) in [
        ("added", LibrarySort::DateAdded),
        ("completed", LibrarySort::DateCompleted),
        ("rating", LibrarySort::Rating),
        ("title", LibrarySort::Title),
    ] {
        let cursor = cursor_after(&app, sort, 40).await;
        let ms = time(|| page_at(&app, sort, None, false, None, cursor.clone())).await;
        deep.push((label, ms));
    }
    let seed = time(|| async {
        let state: State<'_, SqlitePool> = app.state();
        get_best_recommendation_seed(state).await.unwrap()
    })
    .await;

    println!(
        "library {library_items:>6}\n  \
         page, newest added            : {date_added:>8.2} ms\n  \
         page, latest completed        : {date_completed:>8.2} ms\n  \
         page, status paused (rare)    : {recent_rare_status:>8.2} ms\n  \
         page, favourites only         : {recent_favourites:>8.2} ms\n  \
         page, series + paused         : {recent_series:>8.2} ms\n  \
         recommendation seed           : {seed:>8.2} ms"
    );
    println!(
        "  write 20k viewing events      : {events_write_ms:>8.0} ms\n  \
         write 10k episode progress    : {progress_write_ms:>8.0} ms"
    );
    for (label, ms) in deep {
        println!("  page 40 deep, by {label:<10}   : {ms:>8.2} ms");
    }
}

#[tokio::test]
#[ignore = "manual benchmark; run with `pnpm perf:library-indexes`"]
async fn benchmark_library_reads_against_their_indexes() {
    println!("median of {SAMPLES} runs, in-memory SQLite, Rust only (no IPC / webview)");
    measure(1_000).await;
    measure(10_000).await;
    measure(50_000).await;
}
