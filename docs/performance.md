# Performance checks

CineTrack keeps deterministic query-plan checks in the normal Rust test suite
and a larger opt-in scale benchmark for local profiling.

## Query-plan regression checks

The regular backend test suite verifies that the critical Library, Progress,
and Stats query shapes use their intended SQLite indexes. These checks
intentionally avoid wall-clock thresholds, because CI runner speed is too
variable to make millisecond limits a reliable correctness gate.

Run them with the normal backend validation:

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

The benchmark reports elapsed time for Library loading, tracked-series
aggregation, Stats overview, monthly recap, rating distribution, and milestones
without enforcing machine-specific limits.

```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml \
  stats::performance::benchmark_library_progress_and_stats_at_1k_and_10k_scale \
  -- --ignored --nocapture
```

When comparing changes, run the command on the same machine and record the
before/after output. Treat a repeatable regression as a signal to inspect the
query plan before changing a threshold or adding caching.
