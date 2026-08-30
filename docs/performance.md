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

## 1k / 10k / 50k scale benchmark

The ignored benchmark seeds three in-memory fixtures:

- 1,000 library items and 5,000 viewing events;
- 10,000 library items and 50,000 viewing events;
- 50,000 library items and 100,000 viewing events.

Series rows also receive synthetic tracked-series and episode-progress data so
the Progress aggregation is exercised alongside Library and Stats. The Library
command keeps its production `LIST_SAFETY_LIMIT` safety cap (`library/queries.rs`
— a defensive backstop against pathological growth, not real pagination, sized
well above any of these fixtures), so every tier deliberately measures the
real, untruncated full-library payload by calling `list_library` without a
media-type scope. That remains a worst-case/fallback benchmark: in production,
the locked /movies and /series "My list" tabs pass their media type to the same
command, so SQLite removes unrelated rows before the Tauri IPC transfer while
the UI still receives the complete movie or series set needed for watch-progress
bucketing. Custom/smart-list intersections can still request both media types
when they genuinely need the complete profile set. Recommendation rails,
smart-list evaluation, Watch Tonight, and tracking/calendar enrichment keep
using their own targeted commands (`list_library_media_keys`,
`list_planned_library_candidates`, `list_completed_library_candidates`,
`get_best_recommendation_seed`, `list_library_ids_matching_filters`,
`get_library_items_by_keys` — all in `library/queries.rs`). The full "Library
list" latency therefore remains an intentional upper-bound diagnostic rather
than the payload paid by each locked media hub.

Each dataset gets 3 warmup iterations followed by 20 measured iterations. The
warmups are excluded from the sample set. CineTrack records nearest-rank p50 and
p95 latency for:

- Library list (the plain, unpaginated `list_library` — see the safety-cap note
  above);
- Library page: first page, 10 pages deep via its keyset cursor, title sort,
  rating sort, a status filter, and a search term (all `list_library_page` —
  the Library page's own server-paginated command, see `library/queries.rs`'s
  `list_page_impl`);
- tracked-series aggregation;
- Stats overview;
- monthly recap;
- rating distribution;
- watch milestones.

The six `list_library_page` cases exist specifically to benchmark the
scalable path, not just the plain, safety-capped `list_library` above — a
prior gap this benchmark had even after `list_library_page` shipped.
"First page", "10 pages deep", "title sort", "rating sort", and "filtered
status" all stay sub-millisecond at every tier including 50k, and "10 pages
deep" tracks "first page" closely rather than growing — confirming the
keyset (not `OFFSET`) cursor stays index-driven regardless of how far into
the list a page is. "Search" (a `LIKE '%...%'` match) is the one exception:
its latency grows with `library_items` (sub-millisecond at 1k, low
single-digit ms at 10k, tens of ms at 50k) because a leading wildcard can't
use the title index — this is the concrete evidence behind
`list_page_impl`'s own comment about `LIKE` not benefiting from a B-tree
index the way a prefix search would; revisit with FTS5 if this ever shows up
as a real user-facing delay rather than a benchmark number.

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

## Stress metrics: beyond read latency

The same benchmark run also seeds a real _file-backed_ SQLite database (the
1k/10k/50k cases above deliberately stay in-memory, to keep the read-latency
percentiles free of disk-I/O noise — file size can't be measured on a
database that has no file at all) at the 50k/100k scale, and records:

- the on-disk database file size;
- a full backup export round trip (`export_backup_data`) — duration and the
  serialized JSON payload size, a proxy for the frontend's own IPC
  deserialization cost;
- a full backup import round trip (`import_backup_data`), timed separately
  against a fresh database so it never shares a number with export;
- this process's own resident memory right after seeding — Linux-only (see
  `stats/performance/memory.rs`'s own doc comment for why), reported as `n/a`
  everywhere else, including local macOS/Windows dev runs.

Like the read-latency percentiles above, none of this is a pass/fail gate —
it's the same "informational, compare same-machine before/after" contract.

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
