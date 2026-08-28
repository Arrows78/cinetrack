use std::time::Instant;

use sqlx::SqlitePool;
use sqlx::sqlite::SqlitePoolOptions;
use tauri::{Manager, State};

use super::milestones::get_watch_milestones_impl;
use super::overview::get_stats_overview_impl;
use super::ratings::get_rating_distribution_impl;
use super::recap::get_monthly_recap_impl;
use crate::commands::library::list_library;
use crate::commands::progress::list_tracked_series;

#[derive(sqlx::FromRow)]
struct QueryPlanRow {
    detail: String,
}

async fn migrated_pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("failed to open in-memory sqlite pool");
    crate::database::migrations::run_migrations(&pool)
        .await
        .expect("failed to migrate benchmark database");
    pool
}

fn joined_plan(rows: &[QueryPlanRow]) -> String {
    rows.iter()
        .map(|row| row.detail.as_str())
        .collect::<Vec<_>>()
        .join(" | ")
}

#[tokio::test]
async fn latest_event_stats_query_uses_partition_index_without_temp_sort() {
    let pool = migrated_pool().await;
    let rows: Vec<QueryPlanRow> = sqlx::query_as(
        "EXPLAIN QUERY PLAN
         WITH latest_events AS (
           SELECT media_type, episode_id, event_type, duration_minutes,
                  ROW_NUMBER() OVER (
                    PARTITION BY media_id, media_type, episode_id
                    ORDER BY watched_at DESC, created_at DESC
                  ) AS rn
           FROM viewing_events WHERE profile_id = 'default'
         )
         SELECT COUNT(*) FROM latest_events WHERE rn = 1",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let plan = joined_plan(&rows);

    assert!(
        plan.contains("idx_viewing_events_profile_media_episode_date"),
        "expected latest-event composite index, got: {plan}"
    );
    assert!(
        !plan.contains("USE TEMP B-TREE FOR ORDER BY"),
        "latest-event window should not need a temporary sort: {plan}"
    );
}

#[tokio::test]
async fn media_history_query_uses_profile_media_date_index() {
    let pool = migrated_pool().await;
    let rows: Vec<QueryPlanRow> = sqlx::query_as(
        "EXPLAIN QUERY PLAN
         SELECT uuid, event_type, watched_at, episode_id, season_number, episode_number, note
         FROM viewing_events
         WHERE profile_id = 'default' AND media_id = 42 AND media_type = 'movie'
         ORDER BY watched_at DESC",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let plan = joined_plan(&rows);

    assert!(
        plan.contains("idx_viewing_events_profile_media_date"),
        "expected profile/media/date index, got: {plan}"
    );
}

#[tokio::test]
async fn completed_series_milestone_query_uses_covering_index() {
    let pool = migrated_pool().await;
    let rows: Vec<QueryPlanRow> = sqlx::query_as(
        "EXPLAIN QUERY PLAN
         SELECT completed_at FROM library_items
         WHERE profile_id = 'default'
           AND media_type = 'series'
           AND status = 'completed'
           AND completed_at IS NOT NULL
         ORDER BY completed_at ASC",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let plan = joined_plan(&rows);

    assert!(
        plan.contains("idx_library_profile_type_status_completed"),
        "expected completed-series covering index, got: {plan}"
    );
}

#[tokio::test]
async fn rating_distribution_query_uses_partial_rating_index() {
    let pool = migrated_pool().await;
    let rows: Vec<QueryPlanRow> = sqlx::query_as(
        "EXPLAIN QUERY PLAN
         SELECT user_rating AS rating, COUNT(*) AS count
         FROM library_items
         WHERE profile_id = 'default' AND user_rating IS NOT NULL
         GROUP BY user_rating
         ORDER BY user_rating ASC",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let plan = joined_plan(&rows);

    assert!(
        plan.contains("idx_library_profile_rating"),
        "expected profile/rating partial index, got: {plan}"
    );
}

#[tokio::test]
async fn library_list_query_uses_profile_updated_index() {
    let pool = migrated_pool().await;
    let rows: Vec<QueryPlanRow> = sqlx::query_as(
        "EXPLAIN QUERY PLAN
         SELECT * FROM library_items
         WHERE profile_id = 'default'
         ORDER BY updated_at DESC
         LIMIT 5000",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let plan = joined_plan(&rows);

    assert!(
        plan.contains("idx_library_profile_updated"),
        "expected library profile/update index, got: {plan}"
    );
}

#[tokio::test]
async fn tracked_series_query_uses_profile_and_progress_indexes() {
    let pool = migrated_pool().await;
    let rows: Vec<QueryPlanRow> = sqlx::query_as(
        "EXPLAIN QUERY PLAN
         SELECT ts.uuid, ts.series_id, ts.title, ts.poster_path, ts.backdrop_path,
                ts.total_episodes, ts.status, ts.created_at, ts.updated_at,
                COUNT(ep.episode_id) as watched_episodes
         FROM tracked_series ts
         LEFT JOIN episode_progress ep
           ON ep.profile_id = ts.profile_id
          AND ep.series_id = ts.series_id
          AND ep.watched = 1
         WHERE ts.profile_id = 'default'
         GROUP BY ts.uuid, ts.series_id, ts.title, ts.poster_path, ts.backdrop_path,
                  ts.total_episodes, ts.status, ts.created_at, ts.updated_at
         ORDER BY ts.updated_at DESC",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let plan = joined_plan(&rows);

    assert!(
        plan.contains("idx_tracked_series_profile_updated"),
        "expected tracked-series profile/update index, got: {plan}"
    );
    assert!(
        plan.contains("idx_episode_progress_series_watched"),
        "expected episode-progress join index, got: {plan}"
    );
}

async fn seed_scale_fixture(pool: &SqlitePool, library_items: i64, viewing_events: i64) {
    let mut tx = pool.begin().await.unwrap();

    for index in 0..library_items {
        let media_type = if index % 5 == 0 { "series" } else { "movie" };
        let completed = index % 4 == 0;
        let status = if completed { "completed" } else { "watching" };
        let completed_at = completed.then_some("2026-06-15T00:00:00.000Z");
        let rating = ((index % 10) + 1) as f64;

        sqlx::query(
            "INSERT INTO library_items (
               uuid, profile_id, media_id, media_type, title, genres, status,
               user_rating, completed_at, created_at, updated_at
             ) VALUES ($1, 'default', $2, $3, $4, '[\"Drama\"]', $5, $6, $7, $8, $8)",
        )
        .bind(format!("scale-library-{index}"))
        .bind(index + 1)
        .bind(media_type)
        .bind(format!("Scale title {index}"))
        .bind(status)
        .bind(rating)
        .bind(completed_at)
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&mut *tx)
        .await
        .unwrap();

        if media_type == "series" {
            sqlx::query(
                "INSERT INTO tracked_series (
                   uuid, profile_id, series_id, title, total_episodes, status, created_at, updated_at
                 ) VALUES ($1, 'default', $2, $3, 24, 'Returning Series', $4, $4)",
            )
            .bind(format!("scale-series-{index}"))
            .bind(index + 1)
            .bind(format!("Scale title {index}"))
            .bind("2026-01-01T00:00:00.000Z")
            .execute(&mut *tx)
            .await
            .unwrap();

            for episode in 1..=4 {
                sqlx::query(
                    "INSERT INTO episode_progress (
                       uuid, profile_id, series_id, episode_id, season_number, episode_number,
                       watched, watched_at, created_at, updated_at
                     ) VALUES ($1, 'default', $2, $3, 1, $4, 1, $5, $5, $5)",
                )
                .bind(format!("scale-progress-{index}-{episode}"))
                .bind(index + 1)
                .bind((index + 1) * 100 + episode)
                .bind(episode)
                .bind("2026-06-15T00:00:00.000Z")
                .execute(&mut *tx)
                .await
                .unwrap();
            }
        }
    }

    for index in 0..viewing_events {
        let media_id = (index % library_items) + 1;
        let is_series = (media_id - 1) % 5 == 0;
        let media_type = if is_series { "series" } else { "movie" };
        let episode_id = is_series.then_some(index + 1);
        let event_type = if index % 7 == 0 {
            "rewatched"
        } else {
            "watched"
        };
        let month = (index % 12) + 1;
        let day = (index % 28) + 1;
        let hour = index % 24;
        let watched_at = format!("2026-{month:02}-{day:02}T{hour:02}:00:00.000Z");

        sqlx::query(
            "INSERT INTO viewing_events (
               uuid, profile_id, media_id, media_type, title, event_type,
               watched_at, duration_minutes, episode_id, created_at
             ) VALUES ($1, 'default', $2, $3, $4, $5, $6, $7, $8, $6)",
        )
        .bind(format!("scale-event-{index}"))
        .bind(media_id)
        .bind(media_type)
        .bind(format!("Scale title {}", media_id - 1))
        .bind(event_type)
        .bind(watched_at)
        .bind(if is_series { 45 } else { 110 })
        .bind(episode_id)
        .execute(&mut *tx)
        .await
        .unwrap();
    }

    tx.commit().await.unwrap();
}

async fn benchmark_case(library_items: i64, viewing_events: i64) {
    let pool = migrated_pool().await;
    seed_scale_fixture(&pool, library_items, viewing_events).await;

    let app = tauri::test::mock_app();
    app.manage(pool.clone());

    let started = Instant::now();
    let library_state: State<'_, SqlitePool> = app.state();
    let library = list_library(library_state).await.unwrap();
    let library_elapsed = started.elapsed();

    let started = Instant::now();
    let progress_state: State<'_, SqlitePool> = app.state();
    let tracked = list_tracked_series(progress_state).await.unwrap();
    let progress_elapsed = started.elapsed();

    let month_labels = (1..=12)
        .map(|month| format!("2026-{month:02}"))
        .collect::<Vec<_>>();

    let started = Instant::now();
    let overview =
        get_stats_overview_impl(&pool, "default", "2026-01-01T00:00:00.000Z", &month_labels)
            .await
            .unwrap();
    let overview_elapsed = started.elapsed();

    let started = Instant::now();
    get_monthly_recap_impl(
        &pool,
        "default",
        "2026-06",
        "2026-06-01T00:00:00.000Z",
        "2026-07-01T00:00:00.000Z",
    )
    .await
    .unwrap();
    let recap_elapsed = started.elapsed();

    let started = Instant::now();
    get_rating_distribution_impl(&pool, "default", "2026-01-01T00:00:00.000Z")
        .await
        .unwrap();
    let ratings_elapsed = started.elapsed();

    let started = Instant::now();
    get_watch_milestones_impl(&pool, "default").await.unwrap();
    let milestones_elapsed = started.elapsed();

    assert_eq!(overview.monthly_activity.len(), 12);
    assert_eq!(library.len(), library_items.min(5_000) as usize);
    assert_eq!(tracked.len(), ((library_items + 4) / 5) as usize);
    eprintln!(
        "scale library={library_items} events={viewing_events} library_rows={} tracked_rows={} library_ms={:.2} progress_ms={:.2} overview_ms={:.2} recap_ms={:.2} ratings_ms={:.2} milestones_ms={:.2}",
        library.len(),
        tracked.len(),
        library_elapsed.as_secs_f64() * 1000.0,
        progress_elapsed.as_secs_f64() * 1000.0,
        overview_elapsed.as_secs_f64() * 1000.0,
        recap_elapsed.as_secs_f64() * 1000.0,
        ratings_elapsed.as_secs_f64() * 1000.0,
        milestones_elapsed.as_secs_f64() * 1000.0,
    );
}

#[tokio::test]
#[ignore = "manual scalability benchmark; run with --ignored --nocapture"]
async fn benchmark_library_progress_and_stats_at_1k_and_10k_scale() {
    benchmark_case(1_000, 5_000).await;
    benchmark_case(10_000, 50_000).await;
}
