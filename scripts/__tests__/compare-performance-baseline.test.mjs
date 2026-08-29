import { describe, expect, it } from "vitest";
import { compareReports } from "../compare-performance-baseline.mjs";

function report(overrides = {}) {
  return {
    format_version: 1,
    schema_version: 16,
    warmup_iterations: 3,
    sample_iterations: 20,
    target_os: "linux",
    target_arch: "x86_64",
    cases: [
      {
        library_items: 1000,
        viewing_events: 5000,
        library_rows_returned: 1000,
        tracked_series_returned: 50,
        operations: {
          library_list: { p50_ms: 1, p95_ms: 2 },
          tracked_series: { p50_ms: 1, p95_ms: 2 },
          stats_overview: { p50_ms: 1, p95_ms: 2 },
          monthly_recap: { p50_ms: 1, p95_ms: 2 },
          rating_distribution: { p50_ms: 1, p95_ms: 2 },
          watch_milestones: { p50_ms: 1, p95_ms: 2 },
        },
      },
    ],
    ...overrides,
  };
}

describe("compareReports", () => {
  it("computes a percentage delta per operation for a matching case", () => {
    const baseline = report();
    const current = report({
      cases: [
        {
          ...report().cases[0],
          operations: {
            ...report().cases[0].operations,
            library_list: { p50_ms: 1, p95_ms: 3 }, // +50%
          },
        },
      ],
    });

    const output = compareReports(baseline, current);

    expect(output).toContain("1000 library items / 5000 viewing events");
    // +50% is well past the warning threshold, so the flag is expected too.
    expect(output).toContain("| Library list | 2.000 | 3.000 | +50.0% ⚠️ |");
  });

  it("flags a delta comfortably past the 20% warning threshold with a marker", () => {
    const baseline = report();
    const current = report({
      cases: [
        {
          ...report().cases[0],
          operations: { ...report().cases[0].operations, stats_overview: { p50_ms: 1, p95_ms: 2.6 } }, // +30%
        },
      ],
    });

    const output = compareReports(baseline, current);

    expect(output).toContain("| Stats overview | 2.000 | 2.600 | +30.0% ⚠️ |");
  });

  it("does not flag a delta comfortably below the warning threshold", () => {
    const baseline = report();
    const current = report({
      cases: [
        {
          ...report().cases[0],
          operations: { ...report().cases[0].operations, stats_overview: { p50_ms: 1, p95_ms: 2.1 } }, // +5%
        },
      ],
    });

    const output = compareReports(baseline, current);

    expect(output).toContain("| Stats overview | 2.000 | 2.100 | +5.0% |");
  });

  it("reports a case present in the PR run but missing from the baseline, without crashing", () => {
    const baseline = report({ cases: [] });
    const current = report();

    const output = compareReports(baseline, current);

    expect(output).toContain("No matching baseline case on `main` to compare against.");
  });

  it("matches cases by scale (library/viewing-event counts), not array position", () => {
    const baseline = report({
      cases: [{ ...report().cases[0], library_items: 10000, viewing_events: 50000 }, report().cases[0]],
    });
    const current = report();

    const output = compareReports(baseline, current);

    // The 1000/5000 case exists in both (at different positions) and should
    // still be matched and compared, not treated as missing.
    expect(output).not.toContain("No matching baseline case");
    expect(output).toContain("| Library list | 2.000 | 2.000 | +0.0% |");
  });
});
