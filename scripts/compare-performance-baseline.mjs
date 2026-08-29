#!/usr/bin/env node
// Compares two database-benchmark.json reports (see
// src-tauri/src/stats/performance/report.rs's BenchmarkReport) and prints a
// Markdown trend table to stdout — informational only, no pass/fail
// threshold (see docs/performance.md). Used by .github/workflows/ci.yml to
// turn a PR's benchmark run into "main vs. PR vs. delta" instead of a
// snapshot a human has to manually download and eyeball across runs.
//
// Usage: node scripts/compare-performance-baseline.mjs <baseline.json> <current.json>

import { readFileSync } from "node:fs";
import process from "node:process";

const OPERATIONS = [
  ["library_list", "Library list"],
  ["tracked_series", "Tracked series"],
  ["stats_overview", "Stats overview"],
  ["monthly_recap", "Monthly recap"],
  ["rating_distribution", "Rating distribution"],
  ["watch_milestones", "Watch milestones"],
];

// A case is matched between the two reports by scale (library item count +
// viewing event count), not by array position — the benchmark's own case
// list order is an implementation detail, not a stable identity.
function caseKey(benchmarkCase) {
  return `${benchmarkCase.library_items}/${benchmarkCase.viewing_events}`;
}

function formatDelta(baselineMs, currentMs) {
  if (baselineMs <= 0) return "n/a";
  const percent = ((currentMs - baselineMs) / baselineMs) * 100;
  const sign = percent >= 0 ? "+" : "";
  // Purely visual flag for a human skimming the table — not a build gate.
  // 20% is well above the run-to-run noise this benchmark showed in
  // practice (see docs/performance.md), so it's unlikely to fire on
  // routine variance alone.
  const flag = percent >= 20 ? " ⚠️" : "";
  return `${sign}${percent.toFixed(1)}%${flag}`;
}

export function compareReports(baseline, current) {
  const baselineByKey = new Map(baseline.cases.map((c) => [caseKey(c), c]));
  const lines = [
    "# Database performance: main vs. this PR",
    "",
    "Informational only — no pass/fail threshold. See `docs/performance.md`.",
    "",
  ];

  for (const currentCase of current.cases) {
    const key = caseKey(currentCase);
    const baselineCase = baselineByKey.get(key);
    lines.push(`## ${currentCase.library_items} library items / ${currentCase.viewing_events} viewing events`);
    lines.push("");
    if (!baselineCase) {
      lines.push("_No matching baseline case on `main` to compare against._", "");
      continue;
    }
    lines.push("| Operation | main p95 (ms) | PR p95 (ms) | Δ |", "| --- | ---: | ---: | ---: |");
    for (const [field, label] of OPERATIONS) {
      const baselineMs = baselineCase.operations[field].p95_ms;
      const currentMs = currentCase.operations[field].p95_ms;
      lines.push(
        `| ${label} | ${baselineMs.toFixed(3)} | ${currentMs.toFixed(3)} | ${formatDelta(baselineMs, currentMs)} |`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function main() {
  const [, , baselinePath, currentPath] = process.argv;
  if (!baselinePath || !currentPath) {
    process.stderr.write("Usage: node scripts/compare-performance-baseline.mjs <baseline.json> <current.json>\n");
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const current = JSON.parse(readFileSync(currentPath, "utf8"));
  process.stdout.write(`${compareReports(baseline, current)}\n`);
}

// Only run as a CLI when invoked directly (`node scripts/...`), not when
// imported by the test file below.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
