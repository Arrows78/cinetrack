use std::future::Future;
use std::io::Write;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Instant;

use chrono::{SecondsFormat, Utc};
use serde::Serialize;

use crate::error::ApiError;

// Mirrors src/shared/lib/logger.ts's own path/format exactly (same
// `BaseDirectory.AppData` root, same "logs/cinetrack.log" relative path,
// same "TIMESTAMP [LEVEL] message" line shape) — writing here means the
// Settings diagnostics view already shows Rust-side command timing
// interleaved with the frontend's own `command=`/`duration=` lines, with no
// UI change needed just to make that visible.
const LOG_DIR: &str = "logs";
const LOG_FILE: &str = "cinetrack.log";
// Same cap logger.ts enforces client-side — this is a debugging aid, not an
// archive, and both sides share the one file, so only one side needs to
// actually rotate it.
const MAX_LOG_BYTES: u64 = 512 * 1024;

// A local, no-telemetry threshold for flagging a command as unusually slow
// in the log (see docs/audit-findings.md's "Evaluated and deliberately left
// alone" — no remote error/crash reporting is a deliberate product
// decision, and this stays consistent with it). Picked well above typical
// SQLite-backed command latency (sub-10ms in the perf benchmark, see
// stats/performance/benchmark.rs) so it only fires on something actually
// worth a second look, not routine variance.
const SLOW_COMMAND_THRESHOLD_MS: u128 = 200;

// The app-data root, set once from `.setup()` (see lib.rs) with the exact
// same `app.path().app_data_dir()` the frontend's logger.ts writes under.
// Deliberately a process-wide static rather than a parameter threaded
// through every command: `timed` below is called from ~70 command
// functions, and every one of the many existing command-level tests in
// this crate (tauri::test::mock_app()-based) calls its command directly by
// name — adding a parameter to that signature would mean touching every
// one of those call sites just to satisfy the type checker. A static that
// only gets set by the real `.setup()` (never called under `cargo test`)
// means logging is silently a no-op in tests instead, with zero test
// changes needed and no risk of a test run writing into a real directory
// on the machine running it (see database::init_pool_at's own note about
// mock_app()'s path resolution being real, not sandboxed).
static LOG_ROOT: OnceLock<PathBuf> = OnceLock::new();

/// Call once, from `.setup()`, before any command can run.
pub fn init(app_data_dir: PathBuf) {
    let _ = LOG_ROOT.set(app_data_dir);
}

fn log_dir() -> Option<PathBuf> {
    LOG_ROOT.get().map(|root| root.join(LOG_DIR))
}

fn rotate_if_needed(log_dir: &std::path::Path) {
    let file = log_dir.join(LOG_FILE);
    let Ok(metadata) = std::fs::metadata(&file) else {
        return;
    };
    if metadata.len() <= MAX_LOG_BYTES {
        return;
    }
    let rotated = log_dir.join(format!("{LOG_FILE}.1"));
    let _ = std::fs::remove_file(&rotated);
    let _ = std::fs::rename(&file, &rotated);
}

fn append_line(level: &str, message: &str) {
    let Some(dir) = log_dir() else { return };
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    rotate_if_needed(&dir);
    let line = format!(
        "{} [{}] {}\n",
        Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        level.to_uppercase(),
        message
    );
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join(LOG_FILE))
    {
        let _ = file.write_all(line.as_bytes());
    }
}

/// Which side of the IPC boundary wrote a given timing line — the whole
/// point of this module's `layer=` prefix (see `timed` below). `Unknown`
/// exists only for log lines written before this distinction existed (or
/// any other line matching `command=`/`duration=` without a `layer=`
/// marker) — `summarize` keeps them out of the `frontend`/`backend`
/// buckets they were previously silently merged into rather than
/// discarding them, so an old log file still summarizes, just under its
/// own bucket.
///
/// Generates `src/generated/dto/DiagnosticsLayer.ts`, re-exported as
/// `DiagnosticsLayer` from `src/features/desktop/diagnostics-commands.ts`.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, PartialOrd, Ord, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum DiagnosticsLayer {
    Frontend,
    Backend,
    Unknown,
}

/// Wraps a command's body with local, file-logged timing: `layer=backend
/// command=<name> duration=<ms>ms` (or `slow_command=` at warn level past
/// `SLOW_COMMAND_THRESHOLD_MS`), `status=error` appended on failure. The
/// `layer=` prefix mirrors what `invokeCommand()` writes client-side (see
/// src/shared/lib/invoke.ts) as `layer=frontend` — before this existed both
/// sides wrote the exact same `command=<name> duration=<ms>ms` shape, so
/// `summarize` below silently averaged the frontend's full round-trip time
/// together with this function's own Rust-side execution time under one
/// bucket per command name, which is two different measurements. Not a
/// distributed trace ID: Tauri's IPC has no generic channel to thread one
/// through every command signature without a much larger change, so layer +
/// command name + roughly-simultaneous timestamps are the practical
/// correlation between the two sides' log lines.
pub async fn timed<T, F>(command: &str, fut: F) -> Result<T, ApiError>
where
    F: Future<Output = Result<T, ApiError>>,
{
    let started = Instant::now();
    let result = fut.await;
    let duration_ms = started.elapsed().as_millis();
    let status = if result.is_err() { " status=error" } else { "" };
    let body = format!("command={command} duration={duration_ms}ms{status}");
    if duration_ms >= SLOW_COMMAND_THRESHOLD_MS {
        append_line("warn", &format!("layer=backend slow_{body}"));
    } else {
        append_line("info", &format!("layer=backend {body}"));
    }
    result
}

/// Generates `src/generated/dto/CommandTimingSummary.ts`, re-exported as
/// `CommandTimingSummary` from `src/features/desktop/diagnostics-commands.ts`.
#[derive(Debug, Clone, Serialize, PartialEq, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CommandTimingSummary {
    pub layer: DiagnosticsLayer,
    pub command: String,
    pub count: usize,
    pub error_count: usize,
    pub avg_duration_ms: f64,
    pub p95_duration_ms: u64,
    pub max_duration_ms: u64,
}

/// Generates `src/generated/dto/DiagnosticsSummary.ts`, re-exported as
/// `DiagnosticsSummary` from `src/features/desktop/diagnostics-commands.ts`.
#[derive(Debug, Clone, Default, Serialize, PartialEq, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DiagnosticsSummary {
    pub commands: Vec<CommandTimingSummary>,
    pub total_lines_parsed: usize,
}

struct ParsedLine {
    layer: DiagnosticsLayer,
    command: String,
    duration_ms: u64,
    is_error: bool,
}

fn parse_layer(line: &str) -> DiagnosticsLayer {
    let marker = "layer=";
    let Some(start) = line.find(marker) else {
        return DiagnosticsLayer::Unknown;
    };
    let rest = &line[start + marker.len()..];
    let end = rest.find(' ').unwrap_or(rest.len());
    match &rest[..end] {
        "frontend" => DiagnosticsLayer::Frontend,
        "backend" => DiagnosticsLayer::Backend,
        _ => DiagnosticsLayer::Unknown,
    }
}

// Parses exactly the shape `timed` (above) and invokeCommand() (TS) both
// write: "... layer=<side> command=<name> duration=<n>ms[ status=error]",
// tolerating the "slow_" prefix, either side's log level bracket, and a
// missing `layer=` marker entirely (see `DiagnosticsLayer::Unknown`).
// Lines that don't match `command=`/`duration=` at all (any other log
// message) are silently skipped, not an error — this is scanning a
// general-purpose debug log, not a dedicated metrics file.
fn parse_line(line: &str) -> Option<ParsedLine> {
    let command_marker = "command=";
    let command_start = line.find(command_marker)? + command_marker.len();
    let rest = &line[command_start..];
    let command_end = rest.find(' ')?;
    let command = rest[..command_end].to_string();

    let duration_marker = "duration=";
    let duration_start = line.find(duration_marker)? + duration_marker.len();
    let duration_rest = &line[duration_start..];
    let duration_end = duration_rest.find("ms")?;
    let duration_ms = duration_rest[..duration_end].parse::<u64>().ok()?;

    Some(ParsedLine {
        layer: parse_layer(line),
        command,
        duration_ms,
        is_error: line.contains("status=error"),
    })
}

pub fn summarize(log_contents: &str) -> DiagnosticsSummary {
    use std::collections::BTreeMap;

    let mut by_command: BTreeMap<(DiagnosticsLayer, String), Vec<ParsedLine>> = BTreeMap::new();
    let mut total_lines_parsed = 0;
    for line in log_contents.lines() {
        if let Some(parsed) = parse_line(line) {
            total_lines_parsed += 1;
            by_command
                .entry((parsed.layer, parsed.command.clone()))
                .or_default()
                .push(parsed);
        }
    }

    let commands = by_command
        .into_iter()
        .map(|((layer, command), mut entries)| {
            entries.sort_by_key(|entry| entry.duration_ms);
            let count = entries.len();
            let error_count = entries.iter().filter(|entry| entry.is_error).count();
            let sum: u64 = entries.iter().map(|entry| entry.duration_ms).sum();
            let avg_duration_ms = sum as f64 / count as f64;
            let p95_index = ((count as f64) * 0.95).ceil() as usize;
            let p95_duration_ms = entries[p95_index.saturating_sub(1).min(count - 1)].duration_ms;
            let max_duration_ms = entries[count - 1].duration_ms;
            CommandTimingSummary {
                layer,
                command,
                count,
                error_count,
                avg_duration_ms,
                p95_duration_ms,
                max_duration_ms,
            }
        })
        .collect();

    DiagnosticsSummary {
        commands,
        total_lines_parsed,
    }
}

fn read_log_file(path: &std::path::Path) -> String {
    std::fs::read_to_string(path).unwrap_or_default()
}

/// Reads both the current and rotated log file (see logger.ts's own
/// rotation) and aggregates per-command timing — the structured
/// counterpart to Settings' raw log tail, exportable as a single JSON blob
/// rather than a scrollback a person has to read line by line.
#[tauri::command]
pub async fn export_diagnostics_summary() -> Result<DiagnosticsSummary, ApiError> {
    let Some(dir) = log_dir() else {
        return Ok(DiagnosticsSummary::default());
    };
    let current = read_log_file(&dir.join(LOG_FILE));
    let rotated = read_log_file(&dir.join(format!("{LOG_FILE}.1")));
    Ok(summarize(&format!("{rotated}{current}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summarize_computes_count_average_p95_and_max_per_command() {
        let log = "\
2026-01-01T00:00:00.000Z [INFO] layer=backend command=list_library duration=10ms
2026-01-01T00:00:01.000Z [INFO] layer=backend command=list_library duration=20ms
2026-01-01T00:00:02.000Z [INFO] layer=backend command=list_library duration=30ms
2026-01-01T00:00:03.000Z [WARN] layer=backend slow_command=list_library duration=250ms
2026-01-01T00:00:04.000Z [INFO] layer=backend command=save_library_item duration=5ms status=error
";
        let summary = summarize(log);
        assert_eq!(summary.total_lines_parsed, 5);

        let library = summary
            .commands
            .iter()
            .find(|c| c.command == "list_library")
            .unwrap();
        assert_eq!(library.layer, DiagnosticsLayer::Backend);
        assert_eq!(library.count, 4);
        assert_eq!(library.error_count, 0);
        assert_eq!(library.max_duration_ms, 250);
        assert_eq!(library.avg_duration_ms, (10.0 + 20.0 + 30.0 + 250.0) / 4.0);

        let save = summary
            .commands
            .iter()
            .find(|c| c.command == "save_library_item")
            .unwrap();
        assert_eq!(save.count, 1);
        assert_eq!(save.error_count, 1);
    }

    #[test]
    fn summarize_keeps_the_same_command_on_different_layers_as_separate_entries() {
        // Regression test for the bug this module's `layer=` prefix fixes:
        // a frontend round-trip and this Rust command's own execution time
        // used to write the exact same `command=<name> duration=<ms>ms`
        // shape, so `summarize` silently averaged two different
        // measurements together under one `list_library` bucket.
        let log = "\
2026-01-01T00:00:00.000Z [INFO] layer=frontend command=list_library duration=25ms
2026-01-01T00:00:00.000Z [INFO] layer=backend command=list_library duration=17ms
";
        let summary = summarize(log);
        assert_eq!(summary.commands.len(), 2);

        let frontend = summary
            .commands
            .iter()
            .find(|c| c.layer == DiagnosticsLayer::Frontend)
            .unwrap();
        assert_eq!(frontend.command, "list_library");
        assert_eq!(frontend.max_duration_ms, 25);

        let backend = summary
            .commands
            .iter()
            .find(|c| c.layer == DiagnosticsLayer::Backend)
            .unwrap();
        assert_eq!(backend.command, "list_library");
        assert_eq!(backend.max_duration_ms, 17);
    }

    #[test]
    fn summarize_buckets_a_pre_layer_log_line_as_unknown_instead_of_dropping_it() {
        // A log file written before this module had a `layer=` marker at
        // all must still summarize, just under its own bucket rather than
        // being silently merged into `frontend`/`backend` or discarded.
        let log = "2026-01-01T00:00:00.000Z [INFO] command=list_library duration=10ms\n";
        let summary = summarize(log);
        assert_eq!(summary.total_lines_parsed, 1);
        assert_eq!(summary.commands.len(), 1);
        assert_eq!(summary.commands[0].layer, DiagnosticsLayer::Unknown);
    }

    #[test]
    fn summarize_ignores_unrelated_log_lines() {
        let log = "\
2026-01-01T00:00:00.000Z [WARN] Failed to remove old backup foo.json: disk full
2026-01-01T00:00:01.000Z [INFO] layer=backend command=list_library duration=10ms
";
        let summary = summarize(log);
        assert_eq!(summary.total_lines_parsed, 1);
        assert_eq!(summary.commands.len(), 1);
    }

    #[test]
    fn summarize_returns_an_empty_summary_for_an_empty_log() {
        let summary = summarize("");
        assert_eq!(summary.total_lines_parsed, 0);
        assert!(summary.commands.is_empty());
    }

    #[tokio::test]
    async fn timed_returns_the_wrapped_futures_result_unchanged() {
        // LOG_ROOT is never set outside a real `.setup()` run, so this also
        // exercises the "logging silently disabled" path `append_line`
        // takes in every test in this crate.
        let ok: Result<i32, ApiError> = timed("probe", async { Ok(42) }).await;
        assert_eq!(ok.unwrap(), 42);

        let err: Result<i32, ApiError> =
            timed("probe", async { Err(ApiError::internal("boom")) }).await;
        assert_eq!(err.unwrap_err().message, "boom");
    }

    #[tokio::test]
    async fn export_diagnostics_summary_returns_an_empty_summary_when_log_root_is_unset() {
        let summary = export_diagnostics_summary().await.unwrap();
        assert_eq!(summary, DiagnosticsSummary::default());
    }
}
