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

Frontend bundles are also guarded in CI by `pnpm bundle:check`. The current
budget is 4 MiB for the complete `dist/` directory and 450 KiB for any single
JavaScript chunk. These are regression tripwires, not targets: when a feature
legitimately needs more code, split it behind a route boundary or document the
exception alongside the change.

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

## Indexes and query plans

Every read the application runs against the personal tables is listed with its plan in `stats/performance/read_catalogue.rs`. Three properties are tests, not thresholds: no read scans a table or sorts rows it could read in order unless the catalogue says why (random pick, backup export, a global cache of a few rows...); every declared index is the plan of at least one read (an index nobody reads still costs every insert); every foreign key leads an index. Adding an index or a read means adding its line there.

`pnpm perf:library-indexes` (release build, in-memory SQLite, Rust only, median of 15) measured the library page reads before and after migration 26:

| Read (50k titles)              | Before  | After   |
| ------------------------------ | ------- | ------- |
| page, "date added" sort        | 19.6 ms | 0.28 ms |
| page, "date completed" sort    | 20.9 ms | 0.29 ms |
| page 40 deep, "date added"     | 19.1 ms | 0.28 ms |
| page 40 deep, "date completed" | 17.6 ms | 0.29 ms |
| page, status + media type      | 5.9 ms  | 0.16 ms |
| page, rare status              | 0.44 ms | 0.28 ms |

At 10k titles the date sorts go from 2.8 ms to 0.3 ms. Reads that were already index-driven (title and rating sorts, favourites, recommendation seed) did not move, so no index was added for them. Writing 20k viewing events and 10k episode progress rows did not get slower with twelve indexes fewer (noise-level change on this machine).

Reads that stay O(rows of the profile) by design, and where: the tag autocomplete (`list_library_distinct_tags`), the full `list_library` read, the sync outbox drain (ordered by an expression, sorts the whole outbox on every batch of 200: worth an index-friendly order if a large import is ever synced), the global availability snapshots cache.

## IPC calls per page

`src/app/__tests__/ipc-calls-per-page.test.tsx` loads the real app on each main route with `invoke()` replaced by a counter, at two library sizes (12 and 60 titles), and asserts that no local command's call count grows with the library. TMDB requests are counted and printed but not asserted: resolving each followed series' next episode is one request per series (and per season for a started one), cached 30 minutes to 24 hours.

| Page (60 titles, 10 lists) | Local calls before | Local calls after | TMDB requests |
| -------------------------- | ------------------ | ----------------- | ------------- |
| Library                    | 54                 | 14                | 0             |
| Movies hub                 | 61                 | 14                | 0             |
| Series hub                 | 61                 | 14                | 20            |
| Home                       | 78                 | 28                | 256           |
| Series page (20 seasons)   | 18                 | 14                | 22            |
| Statistics                 | 12                 | 12                | 0             |

The local count at 12 titles is the same as at 60 on every page above except Home, whose remaining growth is the per-series TMDB resolution.

What went: one `has_library_item` per card, one `is_movie_seen` per movie row, one `get_episode_progress` per series, one `list_custom_list_items` per list, one `refresh_tracked_series_status` per series (the Today Hub refreshed every started series on every visit, then invalidated the whole library feed even when nothing had changed).

## Known full-library reads (client-side filtering)

`list_library` is bounded and scoped by media type for the locked /movies and
/series hubs. Home no longer reads the whole library at launch: the year's
favourite genre, the "planned" counter, the Today Hub's stale-planned card and
the "Hide watched" toggle each use a dedicated Rust query (see the table
below). What remains:

- The `/movies` and `/series` locked hubs, custom lists and smart lists
  (`use-library-explorer.ts`) bucket by watch progress and filter client-side
  on a full read of that media type. Replacing it means paginating each
  watch-progress bucket (and merging list-only titles into them), which is a
  UI decision rather than a query swap, so it was left as is.

None of this is a correctness issue at realistic sizes; the 50k tier above
measures the upper bound it pays.

### Replaced reads: before / after

`pnpm perf:library-reads` (an ignored benchmark in
`stats/performance/library_reads.rs`, built with `--release`) seeds the same
10k/50k fixtures with planned titles, stale titles and several genres, runs the
old computation (the `list_library` command, its JSON serialization, and the
TypeScript filtering ported literally) against the new command, and asserts
both return the same answer. Median of 9 runs, in-memory SQLite, Rust only —
the "before" column therefore excludes the IPC transfer and JSON parse of the
rows in the webview and runs the scans faster than the JavaScript engine
would, so it understates the real gain.

| Consumer                               | Command                            | 10k library / 50k events | 50k library / 100k events |
| -------------------------------------- | ---------------------------------- | ------------------------ | ------------------------- |
| `getYearSummary` favourite genre       | `get_year_favourite_genre`         | 378 ms to 44 ms          | 2025 ms to 240 ms         |
| Home "planned" counter                 | `get_library_status_counts`        | 60 ms to 0.5 ms          | 262 ms to 1.8 ms          |
| Today Hub stale-planned card (first 4) | `list_stale_planned_library_items` | 59 ms to 0.1 ms          | 260 ms to 0.1 ms          |

A full read also moves 4 MB (10k) to 20 MB (50k) of JSON over IPC at every
launch; the replacements transfer a few bytes. Home's "Hide watched" toggle
now loads only the completed titles' keys, and only while it is on.

Each new query is proven equivalent to the computation it replaced on seeded
data (ties, year and 30-day boundaries, other profiles, unwatched rollbacks):
`stats/queries/year_favourite_genre.rs` and `library/stale_planned_tests.rs`.
