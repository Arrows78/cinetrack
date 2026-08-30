use std::time::{Duration, Instant};

use sqlx::SqlitePool;
use sqlx::sqlite::SqlitePoolOptions;
use tauri::{Manager, State};

use super::super::queries::milestones::get_watch_milestones_impl;
use super::super::queries::overview::get_stats_overview_impl;
use super::super::queries::ratings::get_rating_distribution_impl;
use super::super::queries::recap::get_monthly_recap_impl;
use super::fixtures::{migrated_pool, seed_scale_fixture};
use super::memory::current_rss_bytes;
use super::report::{
    BenchmarkCaseReport, BenchmarkReport, LatencySummary, OperationReport, StressReport,
    write_report,
};
use crate::backup::{export_backup_data, import_backup_data};
use crate::library::{LibrarySort, LibraryStatus, list_library, list_library_page};
use crate::models::MediaType;
use crate::progress::list_tracked_series;

const WARMUP_ITERATIONS: usize = 3;
const SAMPLE_ITERATIONS: usize = 20;
const REPORT_FORMAT_VERSION: u32 = 1;

// Page size a real Library-page fetch would request (see
// src/features/library/use-library.ts's useLibraryPage) — small enough that
// "first page" and "10 pages deep" measure the keyset-cursor lookup itself,
// not the cost of transferring hundreds of rows.
const LIBRARY_PAGE_LIMIT: i64 = 50;
// How many pages deep to walk before timing the next fetch — keyset (not
// OFFSET) pagination means this should cost about the same as the first
// page at any scale; a growing gap here would mean the cursor comparison
// stopped being index-driven.
const LIBRARY_PAGE_DEPTH: usize = 10;
// Matches `seed_scale_fixture`'s `"Scale title {index}"` titles whose index
// starts with "12" (12, 120-129 — 11 rows at every tested scale, since
// `"Scale title "` occurs exactly once per title, so `%...%` only ever
// anchors right after it; see `count_library_search_matches`) — deliberately
// not "Scale title 1" alone, whose "starts with 1" match count (1, 10-19,
// 100-199, ...) grows with `library_items` instead of staying scale-stable.
const LIBRARY_PAGE_SEARCH_TERM: &str = "Scale title 12";

#[derive(Default)]
struct BenchmarkSamples {
    library_list: Vec<Duration>,
    library_page_first: Vec<Duration>,
    library_page_deep: Vec<Duration>,
    library_page_title_sort: Vec<Duration>,
    library_page_rating_sort: Vec<Duration>,
    library_page_filtered_status: Vec<Duration>,
    library_page_search: Vec<Duration>,
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
    library_page_first_rows: usize,
    library_page_search_rows: usize,
    library_list: Duration,
    library_page_first: Duration,
    library_page_deep: Duration,
    library_page_title_sort: Duration,
    library_page_rating_sort: Duration,
    library_page_filtered_status: Duration,
    library_page_search: Duration,
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
    assert!(
        (1..=100).contains(&percentile),
        "percentile must be 1..=100"
    );

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
        self.library_page_first.push(iteration.library_page_first);
        self.library_page_deep.push(iteration.library_page_deep);
        self.library_page_title_sort
            .push(iteration.library_page_title_sort);
        self.library_page_rating_sort
            .push(iteration.library_page_rating_sort);
        self.library_page_filtered_status
            .push(iteration.library_page_filtered_status);
        self.library_page_search.push(iteration.library_page_search);
        self.tracked_series.push(iteration.tracked_series);
        self.stats_overview.push(iteration.stats_overview);
        self.monthly_recap.push(iteration.monthly_recap);
        self.rating_distribution.push(iteration.rating_distribution);
        self.watch_milestones.push(iteration.watch_milestones);
    }

    fn report(&self) -> OperationReport {
        OperationReport {
            library_list: summarize(&self.library_list),
            library_page_first: summarize(&self.library_page_first),
            library_page_deep: summarize(&self.library_page_deep),
            library_page_title_sort: summarize(&self.library_page_title_sort),
            library_page_rating_sort: summarize(&self.library_page_rating_sort),
            library_page_filtered_status: summarize(&self.library_page_filtered_status),
            library_page_search: summarize(&self.library_page_search),
            tracked_series: summarize(&self.tracked_series),
            stats_overview: summarize(&self.stats_overview),
            monthly_recap: summarize(&self.monthly_recap),
            rating_distribution: summarize(&self.rating_distribution),
            watch_milestones: summarize(&self.watch_milestones),
        }
    }
}

/// Walks `list_library_page` `skip_pages` deep (feeding each page's
/// `next_cursor` into the next call) and times only the final fetch —
/// keyset pagination means that should cost about the same regardless of
/// depth, which `library_page_first`/`library_page_deep` being close
/// together in the report is what actually demonstrates. Takes the mock
/// `App` itself (not a `State` handle) so it can ask for a fresh `State`
/// on every one of the `skip_pages + 1` calls this makes.
#[allow(clippy::too_many_arguments)]
async fn timed_library_page<R: tauri::Runtime>(
    app: &tauri::App<R>,
    media_type: Option<MediaType>,
    status: Option<LibraryStatus>,
    search: Option<String>,
    sort: LibrarySort,
    skip_pages: usize,
) -> (Duration, usize) {
    let mut cursor: Option<String> = None;
    for _ in 0..skip_pages {
        let page = list_library_page(
            media_type,
            status,
            false,
            search.clone(),
            sort,
            cursor,
            LIBRARY_PAGE_LIMIT,
            app.state(),
        )
        .await
        .unwrap();
        cursor = page.next_cursor;
        if cursor.is_none() {
            break;
        }
    }

    let started = Instant::now();
    let page = list_library_page(
        media_type,
        status,
        false,
        search,
        sort,
        cursor,
        LIBRARY_PAGE_LIMIT,
        app.state(),
    )
    .await
    .unwrap();
    (started.elapsed(), page.items.len())
}

async fn benchmark_iteration(pool: &SqlitePool) -> BenchmarkIteration {
    let app = tauri::test::mock_app();
    app.manage(pool.clone());

    let started = Instant::now();
    let library_state: State<'_, SqlitePool> = app.state();
    let library = list_library(None, library_state).await.unwrap();
    let library_elapsed = started.elapsed();

    let (library_page_first, library_page_first_rows) =
        timed_library_page(&app, None, None, None, LibrarySort::Recent, 0).await;
    let (library_page_deep, _) = timed_library_page(
        &app,
        None,
        None,
        None,
        LibrarySort::Recent,
        LIBRARY_PAGE_DEPTH,
    )
    .await;
    let (library_page_title_sort, _) =
        timed_library_page(&app, None, None, None, LibrarySort::Title, 0).await;
    let (library_page_rating_sort, _) =
        timed_library_page(&app, None, None, None, LibrarySort::Rating, 0).await;
    let (library_page_filtered_status, _) = timed_library_page(
        &app,
        None,
        Some(LibraryStatus::Completed),
        None,
        LibrarySort::Recent,
        0,
    )
    .await;
    let (library_page_search, library_page_search_rows) = timed_library_page(
        &app,
        None,
        None,
        Some(LIBRARY_PAGE_SEARCH_TERM.to_string()),
        LibrarySort::Recent,
        0,
    )
    .await;

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
        library_page_first_rows,
        library_page_search_rows,
        library_list: library_elapsed,
        library_page_first,
        library_page_deep,
        library_page_title_sort,
        library_page_rating_sort,
        library_page_filtered_status,
        library_page_search,
        tracked_series: progress_elapsed,
        stats_overview: overview_elapsed,
        monthly_recap: recap_elapsed,
        rating_distribution: ratings_elapsed,
        watch_milestones: milestones_elapsed,
    }
}

/// Mirrors `seed_scale_fixture`'s `"Scale title {index}"` naming to compute
/// how many rows `LIBRARY_PAGE_SEARCH_TERM` should match, independent of
/// `list_page_impl`'s own SQL — so a regression in the search query's
/// `LIKE` clause (wrong column, wrong wildcard placement) fails this
/// assertion instead of only ever being caught by eyeballing a timing
/// number. `"Scale title "` occurs exactly once per title (there's nothing
/// else in the fixture's title format for a `%...%` scan to latch onto
/// further into the string), so a match requires the *index's own* string
/// to start with the search term's numeric suffix, not merely contain it
/// anywhere — e.g. `"Scale title 12"` matches index 12 and 120-129, not
/// every index containing "12" (212, 512, ...).
fn count_library_search_matches(library_items: i64) -> usize {
    let needle = LIBRARY_PAGE_SEARCH_TERM
        .strip_prefix("Scale title ")
        .expect("search term must extend the fixture's own title prefix");
    (0..library_items)
        .filter(|index| index.to_string().starts_with(needle))
        .count()
}

fn validate_iteration(iteration: &BenchmarkIteration, library_items: i64) {
    assert_eq!(iteration.monthly_activity_buckets, 12);
    // library::queries::LIST_SAFETY_LIMIT (200_000) is far above every scale
    // benchmarked here (max 50_000), so `list_library` returns the whole
    // seeded set at every tier below — no truncation to account for. If a
    // future tier here is raised past that constant, this assertion needs
    // to grow the same `.min(...)` guard back in, matching that constant.
    assert_eq!(iteration.library_rows, library_items as usize);
    assert_eq!(iteration.tracked_rows, ((library_items + 4) / 5) as usize);
    // Every tier here seeds far more than one page's worth of rows, so a
    // first-page fetch (no filters) always comes back full.
    assert_eq!(
        iteration.library_page_first_rows,
        LIBRARY_PAGE_LIMIT as usize
    );
    assert_eq!(
        iteration.library_page_search_rows,
        count_library_search_matches(library_items).min(LIBRARY_PAGE_LIMIT as usize)
    );
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

/// Measures what read-latency percentiles above don't: on-disk file size, a
/// full backup export/import round trip, and (best-effort, Linux CI only)
/// this process's own resident memory — the dimensions docs/performance.md
/// calls out as "the *other* things that scale with data volume." Seeds a
/// real file-backed database (the read-latency cases above deliberately
/// stay in-memory, to keep percentile measurements free of disk-I/O noise;
/// file size can't be measured on a database that has no file at all).
async fn benchmark_stress(library_items: i64, viewing_events: i64) -> StressReport {
    let db_path = std::env::temp_dir().join(format!(
        "cinetrack-stress-benchmark-{}-{}.db",
        std::process::id(),
        library_items
    ));
    // A stale file from a previous crashed run would otherwise make the
    // file-size measurement below reflect leftover data, not this run's.
    let _ = std::fs::remove_file(&db_path);

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&format!("sqlite://{}?mode=rwc", db_path.display()))
        .await
        .expect("failed to open file-backed benchmark database");
    crate::database::migrations::run_migrations(&pool)
        .await
        .expect("failed to migrate the file-backed benchmark database");
    seed_scale_fixture(&pool, library_items, viewing_events).await;

    let peak_rss_bytes = current_rss_bytes();

    let app = tauri::test::mock_app();
    app.manage(pool.clone());
    let export_state: State<'_, SqlitePool> = app.state();
    let started = Instant::now();
    let exported = export_backup_data(export_state)
        .await
        .expect("benchmark backup export failed");
    let export_duration_ms = duration_ms(started.elapsed());
    let export_payload_bytes = serde_json::to_string(&exported)
        .expect("failed to serialize the exported benchmark payload")
        .len();

    // Timed separately, into a fresh in-memory database — this measures
    // import's own cost, not export's, and never risks corrupting the
    // file-backed database the size measurement below still needs to read.
    let import_pool = migrated_pool().await;
    let import_app = tauri::test::mock_app();
    import_app.manage(import_pool);
    let import_state: State<'_, SqlitePool> = import_app.state();
    let started = Instant::now();
    import_backup_data(exported, import_state)
        .await
        .expect("benchmark backup import failed");
    let import_duration_ms = duration_ms(started.elapsed());

    pool.close().await;
    let db_file_size_bytes = std::fs::metadata(&db_path)
        .map(|meta| meta.len())
        .unwrap_or(0);
    let _ = std::fs::remove_file(&db_path);
    let _ = std::fs::remove_file(format!("{}-wal", db_path.display()));
    let _ = std::fs::remove_file(format!("{}-shm", db_path.display()));

    StressReport {
        library_items,
        viewing_events,
        db_file_size_bytes,
        export_duration_ms,
        export_payload_bytes,
        import_duration_ms,
        peak_rss_bytes,
    }
}

#[test]
fn percentile_uses_nearest_rank_for_p50_and_p95() {
    let samples = [1, 2, 3, 4, 100].map(Duration::from_millis);

    assert_eq!(percentile_ms(&samples, 50), 3.0);
    assert_eq!(percentile_ms(&samples, 95), 100.0);
}

pub(super) async fn run() {
    let report = BenchmarkReport {
        format_version: REPORT_FORMAT_VERSION,
        schema_version: crate::database::migrations::latest_version()
            .expect("failed to resolve latest migration version"),
        warmup_iterations: WARMUP_ITERATIONS,
        sample_iterations: SAMPLE_ITERATIONS,
        target_os: std::env::consts::OS,
        target_arch: std::env::consts::ARCH,
        cases: vec![
            benchmark_case(1_000, 5_000).await,
            benchmark_case(10_000, 50_000).await,
            benchmark_case(50_000, 100_000).await,
        ],
        stress: Some(benchmark_stress(50_000, 100_000).await),
    };

    write_report(&report);
}
