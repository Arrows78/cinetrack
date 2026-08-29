use std::fs;
use std::path::PathBuf;

use serde::Serialize;

const REPORT_PATH_ENV: &str = "CINETRACK_PERF_REPORT";

#[derive(Debug, Clone, Serialize)]
pub(super) struct LatencySummary {
    pub(super) p50_ms: f64,
    pub(super) p95_ms: f64,
}

#[derive(Debug, Clone, Serialize)]
pub(super) struct OperationReport {
    pub(super) library_list: LatencySummary,
    /// `list_library_page`'s first, unfiltered, recent-sorted page — the
    /// Library page's own default view.
    pub(super) library_page_first: LatencySummary,
    /// The same query `LIBRARY_PAGE_DEPTH` pages deep via its keyset
    /// cursor — should track `library_page_first` closely at every scale;
    /// see `timed_library_page`'s own doc comment.
    pub(super) library_page_deep: LatencySummary,
    pub(super) library_page_title_sort: LatencySummary,
    pub(super) library_page_rating_sort: LatencySummary,
    pub(super) library_page_filtered_status: LatencySummary,
    pub(super) library_page_search: LatencySummary,
    pub(super) tracked_series: LatencySummary,
    pub(super) stats_overview: LatencySummary,
    pub(super) monthly_recap: LatencySummary,
    pub(super) rating_distribution: LatencySummary,
    pub(super) watch_milestones: LatencySummary,
}

#[derive(Debug, Clone, Serialize)]
pub(super) struct BenchmarkCaseReport {
    pub(super) library_items: i64,
    pub(super) viewing_events: i64,
    pub(super) library_rows_returned: usize,
    pub(super) tracked_series_returned: usize,
    pub(super) operations: OperationReport,
}

/// Beyond read-latency percentiles (`BenchmarkCaseReport`, above): the cost
/// of the *other* things that scale with data volume — the on-disk file
/// size, a full backup export/import round trip, and (Linux CI only) this
/// process's own resident memory right after seeding. `peak_rss_bytes` is
/// `None` on any non-Linux target — see memory.rs's own doc comment for why
/// that's a deliberate gap, not a bug.
#[derive(Debug, Clone, Serialize)]
pub(super) struct StressReport {
    pub(super) library_items: i64,
    pub(super) viewing_events: i64,
    pub(super) db_file_size_bytes: u64,
    pub(super) export_duration_ms: f64,
    pub(super) export_payload_bytes: usize,
    pub(super) import_duration_ms: f64,
    pub(super) peak_rss_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub(super) struct BenchmarkReport {
    pub(super) format_version: u32,
    pub(super) schema_version: i64,
    pub(super) warmup_iterations: usize,
    pub(super) sample_iterations: usize,
    pub(super) target_os: &'static str,
    pub(super) target_arch: &'static str,
    pub(super) cases: Vec<BenchmarkCaseReport>,
    pub(super) stress: Option<StressReport>,
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
            ("Library page (first)", &case.operations.library_page_first),
            ("Library page (10 deep)", &case.operations.library_page_deep),
            (
                "Library page (title sort)",
                &case.operations.library_page_title_sort,
            ),
            (
                "Library page (rating sort)",
                &case.operations.library_page_rating_sort,
            ),
            (
                "Library page (filtered status)",
                &case.operations.library_page_filtered_status,
            ),
            (
                "Library page (search)",
                &case.operations.library_page_search,
            ),
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

    if let Some(stress) = &report.stress {
        output.push_str(&format!(
            "## Stress: {} library items / {} viewing events\n\n",
            stress.library_items, stress.viewing_events
        ));
        output.push_str(&format!(
            "- Database file size: {:.2} MB\n\
             - Backup export: {:.1} ms, {:.2} MB payload\n\
             - Backup import (into a fresh database): {:.1} ms\n\
             - Peak resident memory: {}\n\n",
            stress.db_file_size_bytes as f64 / 1_048_576.0,
            stress.export_duration_ms,
            stress.export_payload_bytes as f64 / 1_048_576.0,
            stress.import_duration_ms,
            stress
                .peak_rss_bytes
                .map(|bytes| format!("{:.1} MB", bytes as f64 / 1_048_576.0))
                .unwrap_or_else(|| "n/a (Linux only)".to_string()),
        ));
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

pub(super) fn write_report(report: &BenchmarkReport) {
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
