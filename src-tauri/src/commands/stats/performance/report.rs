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

#[derive(Debug, Clone, Serialize)]
pub(super) struct BenchmarkReport {
    pub(super) format_version: u32,
    pub(super) schema_version: i64,
    pub(super) warmup_iterations: usize,
    pub(super) sample_iterations: usize,
    pub(super) target_os: &'static str,
    pub(super) target_arch: &'static str,
    pub(super) cases: Vec<BenchmarkCaseReport>,
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
