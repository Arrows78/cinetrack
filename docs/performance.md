# Performance checks

CineTrack keeps deterministic query-plan checks in the normal Rust test suite
and a larger opt-in scale benchmark for reproducible profiling.

## Query-plan regression checks

The regular backend test suite verifies that the critical Library, Progress,
and Stats query shapes use indexed access. The checks intentionally assert the
query property that matters instead of one SQLite-specific index choice: the
optimizer is allowed to pick an equivalent unique/covering index.

These checks do not use wall-clock thresholds, because CI runner speed is too
variable to make millisecond limits a reliable correctness gate.

```bash
pnpm validate:backend
```

## 1k / 10k scale benchmark

The ignored benchmark seeds two in-memory fixtures:

- 1,000 library items and 5,000 viewing events;
- 10,000 library items and 50,000 viewing events.

Series rows also receive synthetic tracked-series and episode-progress data so
the Progress aggregation is exercised alongside Library and Stats. The Library
command keeps its production 5,000-row safety cap, so the 10k fixture measures
the real capped payload rather than bypassing that guard.

Each dataset gets 3 warmup iterations followed by 20 measured iterations. The
warmups are excluded from the sample set. CineTrack records nearest-rank p50 and
p95 latency for:

- Library list;
- tracked-series aggregation;
- Stats overview;
- monthly recap;
- rating distribution;
- watch milestones.

Run the benchmark with:

```bash
pnpm perf:database
```

The command writes both reports under `src-tauri/target/performance/` by default:

- `database-benchmark.json` for machine-readable comparisons;
- `database-benchmark.md` for a human-readable baseline.

Set `CINETRACK_PERF_REPORT` to a different JSON path when a CI job or local
comparison needs a custom artifact location; the Markdown report is written next
to it with the same basename.

Do not compare absolute numbers across different machines. For a before/after
change, run both revisions on the same machine and compare p50/p95. A repeatable
regression is a signal to inspect the query plan before adding caching or any
machine-specific threshold.

## Pull-request baseline

The Linux Rust CI job runs the same ignored benchmark after the full Rust test
suite and uploads `database-benchmark.json` plus `database-benchmark.md` as the
`database-performance-baseline` artifact. This records the p50/p95 baseline for
the exact PR revision without turning machine-dependent latency into a pass/fail
threshold. Query-plan assertions remain the correctness gate.

## Trend: PR vs. `main`

On a pull request (not on a push to `main` — there's no "PR" to compare `main`
against in that case), the same CI job also downloads `main`'s most recent
successful `database-performance-baseline` artifact and runs
`scripts/compare-performance-baseline.mjs` against the PR's own freshly
recorded report, matching cases by scale (library item count + viewing event
count, not array position, since the benchmark's own case order is an
implementation detail). The resulting `main` vs. PR vs. delta-percent table is
written to the job's step summary — still purely informational, with a ⚠️
marker at ±20% delta as a visual flag for a human skimming the table, not a
build gate. If `main` has no successful run yet, or that run's artifact
expired (30-day retention) or predates this feature, the comparison step is
skipped with a warning rather than failing the job.
