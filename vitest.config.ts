import { configDefaults, coverageConfigDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    // Vitest's defaultExclude doesn't know about .claude/worktrees/ (other
    // worktrees created via the worktree tool, co-located under this
    // checkout) — without this, `pnpm test` also picks up and runs whatever
    // test files happen to exist in any sibling worktree's own src/.
    exclude: [...configDefaults.exclude, ".claude/**"],
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        // jsdom defaults to the "about:blank" origin, which is opaque and
        // throws on any localStorage access. Repositories fall back to
        // localStorage outside of Tauri, so tests need a real origin.
        url: "http://localhost:1420",
      },
    },
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      reporter: ["text", "html"],
      // Kept broad (rather than scoped to the tested files below) so
      // `pnpm test:coverage` still surfaces the real, large gap on
      // components/pages/hooks — narrowing `include` would hide it.
      include: ["src/**/*.{ts,tsx}"],
      // Otherwise matches any sibling worktree's own src/ too (see the
      // `test.exclude` comment above).
      exclude: [...coverageConfigDefaults.exclude, ".claude/**"],
      // Global thresholds aren't meaningful yet (~10% overall, since most
      // UI has no tests at all — see the coverage report). Only enforce a
      // floor on the specific files that already have characterization
      // tests, so a regression there fails CI without pretending the rest
      // of the app is covered. Add a file here once you give it real tests.
      //
      // Note: percentages are sensitive to unrelated formatting churn (a
      // `prettier --write` pass that expands one-liners into multi-line
      // objects dilutes the ratio without changing what's actually
      // exercised) — recalibrate the specific file's numbers rather than
      // treating a drop as a real regression without checking first.
      thresholds: {
        // The 001-008 migration files this used to list one-by-one were
        // squashed into this single schema file (see git history) — only
        // one file, and one threshold, left to track.
        "src/db/migrations/001-initial-schema.ts": { statements: 90, branches: 80, functions: 90, lines: 90 },
        // Exercised end-to-end against a real SQLite engine in
        // migrations.integration.test.ts (see also sqlite-adapter.ts) — not
        // just string-shape-checked like migrations.test.ts.
        "src/db/migrations/index.ts": { statements: 95, branches: 75, functions: 95, lines: 95 },
        // The facade is nearly fully covered since the SQL row-mapping moved
        // to portable-data-export.ts / portable-data-import.ts.
        "src/features/backup/portable-data.ts": { statements: 90, branches: 60, functions: 95, lines: 90 },
        // Config module read at import time (authConfig/getAuthClient); the
        // OAuth-error-mapping branch inside getAuthClient itself is thin.
        "src/features/auth/auth-client.ts": { statements: 90, branches: 80, functions: 100, lines: 90 },
        // Covers init/session/OAuth/OTP/signOut; excludes the Tauri deep-link
        // import branch (dynamic import, needs a real webview to exercise).
        "src/features/auth/auth-provider.tsx": { statements: 80, branches: 70, functions: 100, lines: 80 },
        "src/features/auth/provider-availability.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        // Includes the real-SQLite path for the Supabase-linking methods —
        // see profile-repository.sql.test.ts.
        "src/features/collections/profile-repository.ts": { statements: 80, branches: 70, functions: 95, lines: 80 },
        // Excludes the real Stronghold vault's native binding surface —
        // mocked in tests, so only the module's own branching is measured.
        "src/features/desktop/token-vault.ts": { statements: 95, branches: 90, functions: 100, lines: 95 },
        "src/features/history/history-repository.ts": { statements: 35, branches: 25, functions: 60, lines: 35 },
        "src/features/library/library-repository.ts": { statements: 45, branches: 50, functions: 55, lines: 45 },
        "src/features/preferences/preferences-repository.ts": {
          statements: 65,
          branches: 55,
          functions: 90,
          lines: 65,
        },
        // Every domain now runs through Rust commands (see
        // src-tauri/src/commands) — this repository is a thin invoke()
        // wrapper plus the progress-calculation helpers unit-tested
        // directly (calculateSeriesProgress, getNextEpisode, ...).
        "src/features/progress/progress-repository.ts": { statements: 85, branches: 90, functions: 90, lines: 85 },
        "src/features/stats/stats-repository.ts": { statements: 35, branches: 65, functions: 45, lines: 35 },
        "src/features/tvtime/tvtime-import-repository.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // The matching/dedup/progress-reporting pipeline is covered against
        // a mocked mediaRepository/tvTimeImportRepository — parse-export.ts
        // (real CSV parsing) is tested separately.
        "src/features/tvtime/tvtime-import-service.ts": { statements: 95, branches: 90, functions: 100, lines: 95 },
        "src/features/watchlist/watchlist-repository.ts": { statements: 45, branches: 45, functions: 75, lines: 45 },
      },
    },
  },
});
