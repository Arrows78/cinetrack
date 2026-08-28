use std::fs;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use serde::Serialize;

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
        plan.contains("SEARCH ts USING INDEX") || plan.contains("SEARCH ts USING COVERING INDEX"),
        "expected indexed tracked-series profile lookup, got: {plan}"
    );
    assert!(
        !plan.contains("SCAN ts"),
        "tracked-series lookup should not scan the table: {plan}"
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

const WARMUP_ITERATIONS: usize = 3;
const SAMPLE_ITERATIONS: usize = 20;
const REPORT_FORMAT_VERSION: u32 = 1;
const REPORT_PATH_ENV: &str = "CINETRACK_PERF_REPORT";

#[derive(Debug, Clone, Serialize)]
struct LatencySummary {
    p50_ms: f64,
    p95_ms: f64,
}

#[derive(Debug, Clone, Serialize)]
struct OperationReport {
    library_list: LatencySummary,
    tracked_series: LatencySummary,
    stats_overview: LatencySummary,
    monthly_recap: LatencySummary,
    rating_distribution: LatencySummary,
    watch_milestones: LatencySummary,
}

#[derive(Debug, Clone, Serialize)]
struct BenchmarkCaseReport {
    library_items: i64,
    viewing_events: i64,
    library_rows_returned: usize,
    tracked_series_returned: usize,
    operations: OperationReport,
}

#[derive(Debug, Clone, Serialize)]
struct BenchmarkReport {
    format_version: u32,
    schema_version: i64,
    warmup_iterations: usize,
    sample_iterations: usize,
    target_os: &'static str,
    target_arch: &'static str,
    cases: Vec<BenchmarkCaseReport>,
}

#[derive(Default)]
struct BenchmarkSamples {
    library_list: Vec<Duration>,
    tracked_series: Vec<Duration>,
    stats_overview: Vec<Duration>,
    monthly_recap: Vec<Duration>,
    rating_distribution: Vec<Duration>,
    watch_milestones: Vec<Duration>,
}

struct BenchmarkIteration {
    library_rows: usize,
    tracked_rows: usize,
    monthly_activity_buckets: usize,
    library_list: Duration,
    tracked_series: Duration,
    stats_overview: Duration,
    monthly_recap: Duration,
    rating_distribution: Duration,
    watch_milestones: Duration,
}

fn duration_ms(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1_000.0
}

/// Nearest-rank percentile. For N samples and percentile P, select
/// ceil(P / 100 * N) from the sorted sample set (one-indexed).
fn percentile_ms(samples: &[Duration], percentile: usize) -> f64 {
    assert!(!samples.is_empty(), "percentiles need at least one sample");
    assert!((1..=100).contains(&percentile), "percentile must be 1..=100");

    let mut sorted = samples.to_vec();
    sorted.sort_unstable();
    let rank = (percentile * sorted.len()).div_ceil(100);
    duration_ms(sorted[rank - 1])
}

fn summarize(samples: &[Duration]) -> LatencySummary {
    LatencySummary {
        p50_ms: percentile_ms(samples, 50),
        p95_ms: percentile_ms(samples, 95),
    }
}

impl BenchmarkSamples {
    fn push(&mut self, iteration: &BenchmarkIteration) {
        self.library_list.push(iteration.library_list);
        self.tracked_series.push(iteration.tracked_series);
        self.stats_overview.push(iteration.stats_overview);
        self.monthly_recap.push(iteration.monthly_recap);
        self.rating_distribution
            .push(iteration.rating_distribution);
        self.watch_milestones.push(iteration.watch_milestones);
    }

    fn report(&self) -> OperationReport {
        OperationReport {
            library_list: summarize(&self.library_list),
            tracked_series: summarize(&self.tracked_series),
            stats_overview: summarize(&self.stats_overview),
            monthly_recap: summarize(&self.monthly_recap),
            rating_distribution: summarize(&self.rating_distribution),
            watch_milestones: summarize(&self.watch_milestones),
        }
    }
}

async fn benchmark_iteration(pool: &SqlitePool) -> BenchmarkIteration {
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
        get_stats_overview_impl(pool, "default", "2026-01-01T00:00:00.000Z", &month_labels)
            .await
            .unwrap();
    let overview_elapsed = started.elapsed();

    let started = Instant::now();
    get_monthly_recap_impl(
        pool,
        "default",
        "2026-06",
        "2026-06-01T00:00:00.000Z",
        "2026-07-01T00:00:00.000Z",
    )
    .await
    .unwrap();
    let recap_elapsed = started.elapsed();

    let started = Instant::now();
    get_rating_distribution_impl(pool, "default", "2026-01-01T00:00:00.000Z")
        .await
        .unwrap();
    let ratings_elapsed = started.elapsed();

    let started = Instant::now();
    get_watch_milestones_impl(pool, "default").await.unwrap();
    let milestones_elapsed = started.elapsed();

    BenchmarkIteration {
        library_rows: library.len(),
        tracked_rows: tracked.len(),
        monthly_activity_buckets: overview.monthly_activity.len(),
        library_list: library_elapsed,
        tracked_series: progress_elapsed,
        stats_overview: overview_elapsed,
        monthly_recap: recap_elapsed,
        rating_distribution: ratings_elapsed,
        watch_milestones: milestones_elapsed,
    }
}

fn validate_iteration(iteration: &BenchmarkIteration, library_items: i64) {
    assert_eq!(iteration.monthly_activity_buckets, 12);
    assert_eq!(iteration.library_rows, library_items.min(5_000) as usize);
    assert_eq!(iteration.tracked_rows, ((library_items + 4) / 5) as usize);
}

async fn benchmark_case(library_items: i64, viewing_events: i64) -> BenchmarkCaseReport {
    let pool = migrated_pool().await;
    seed_scale_fixture(&pool, library_items, viewing_events).await;

    for _ in 0..WARMUP_ITERATIONS {
        let iteration = benchmark_iteration(&pool).await;
        validate_iteration(&iteration, library_items);
    }

    let mut samples = BenchmarkSamples::default();
    let mut library_rows_returned = 0;
    let mut tracked_series_returned = 0;
    for _ in 0..SAMPLE_ITERATIONS {
        let iteration = benchmark_iteration(&pool).await;
        validate_iteration(&iteration, library_items);
        library_rows_returned = iteration.library_rows;
        tracked_series_returned = iteration.tracked_rows;
        samples.push(&iteration);
    }

    BenchmarkCaseReport {
        library_items,
        viewing_events,
        library_rows_returned,
        tracked_series_returned,
        operations: samples.report(),
    }
}

fn markdown_report(report: &BenchmarkReport) -> String {
    let mut output = format!(
        "# CineTrack database benchmark\n\nSchema: {} · warmup: {} · samples: {} · target: {}/{}\n\n",
        report.schema_version,
        report.warmup_iterations,
        report.sample_iterations,
        report.target_os,
        report.target_arch
    );

    for case in &report.cases {
        output.push_str(&format!(
            "## {} library items / {} viewing events\n\n",
            case.library_items, case.viewing_events
        ));
        output.push_str("| Operation | p50 (ms) | p95 (ms) |\n| --- | ---: | ---: |\n");
        for (name, latency) in [
            ("Library list", &case.operations.library_list),
            ("Tracked series", &case.operations.tracked_series),
            ("Stats overview", &case.operations.stats_overview),
            ("Monthly recap", &case.operations.monthly_recap),
            ("Rating distribution", &case.operations.rating_distribution),
            ("Watch milestones", &case.operations.watch_milestones),
        ] {
            output.push_str(&format!(
                "| {name} | {:.3} | {:.3} |\n",
                latency.p50_ms, latency.p95_ms
            ));
        }
        output.push('\n');
    }

    output
}

fn report_json_path() -> PathBuf {
    std::env::var_os(REPORT_PATH_ENV)
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("target/performance/database-benchmark.json")
        })
}

fn write_report(report: &BenchmarkReport) {
    let json_path = report_json_path();
    if let Some(parent) = json_path.parent() {
        fs::create_dir_all(parent).expect("failed to create benchmark report directory");
    }
    let markdown_path = json_path.with_extension("md");
    let json = serde_json::to_string_pretty(report).expect("failed to serialize benchmark report");
    let markdown = markdown_report(report);

    fs::write(&json_path, format!("{json}\n")).expect("failed to write benchmark JSON report");
    fs::write(&markdown_path, &markdown).expect("failed to write benchmark Markdown report");

    eprintln!("{markdown}");
    eprintln!("JSON report: {}", json_path.display());
    eprintln!("Markdown report: {}", markdown_path.display());
}

#[test]
fn percentile_uses_nearest_rank_for_p50_and_p95() {
    let samples = [1, 2, 3, 4, 100].map(Duration::from_millis);

    assert_eq!(percentile_ms(&samples, 50), 3.0);
    assert_eq!(percentile_ms(&samples, 95), 100.0);
}

#[tokio::test]
#[ignore = "manual scalability benchmark; run with `pnpm perf:database`"]
async fn benchmark_library_progress_and_stats_at_1k_and_10k_scale() {
    let report = BenchmarkReport {
        format_version: REPORT_FORMAT_VERSION,
        schema_version: crate::database::migrations::MIGRATIONS
            .last()
            .expect("at least one migration")
            .version,
        warmup_iterations: WARMUP_ITERATIONS,
        sample_iterations: SAMPLE_ITERATIONS,
        target_os: std::env::consts::OS,
        target_arch: std::env::consts::ARCH,
        cases: vec![
            benchmark_case(1_000, 5_000).await,
            benchmark_case(10_000, 50_000).await,
        ],
    };

    write_report(&report);
}
