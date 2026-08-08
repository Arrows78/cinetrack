import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
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
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    coverage: {
      reporter: ["text", "html"],
      // Kept broad (rather than scoped to the tested files below) so
      // `pnpm test:coverage` still surfaces the real, large gap on
      // components/pages/hooks — narrowing `include` would hide it.
      include: ["src/**/*.{ts,tsx}"],
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
        "src/db/migrations/001-initial-schema.ts": { statements: 90, branches: 80, functions: 90, lines: 90 },
        "src/db/migrations/002-library-and-events.ts": { statements: 90, branches: 80, functions: 90, lines: 90 },
        "src/db/migrations/003-profiles-and-lists.ts": { statements: 90, branches: 80, functions: 90, lines: 90 },
        "src/db/migrations/004-availability.ts": { statements: 90, branches: 80, functions: 90, lines: 90 },
        "src/db/migrations/005-history-profile-id.ts": { statements: 90, branches: 80, functions: 90, lines: 90 },
        "src/db/migrations/006-index-cleanup.ts": { statements: 90, branches: 80, functions: 90, lines: 90 },
        "src/db/migrations/007-foreign-keys.ts": { statements: 90, branches: 80, functions: 90, lines: 90 },
        "src/db/migrations/008-supabase-user-link.ts": { statements: 90, branches: 80, functions: 90, lines: 90 },
        // Exercised end-to-end against a real SQLite engine in
        // migrations.integration.test.ts (see also sqlite-adapter.ts) — not
        // just string-shape-checked like migrations.test.ts.
        "src/db/migrations/index.ts": { statements: 95, branches: 75, functions: 95, lines: 95 },
        // The facade is nearly fully covered since the SQL row-mapping moved
        // to portable-data-export.ts / portable-data-import.ts.
        "src/features/backup/portable-data.ts": { statements: 90, branches: 60, functions: 95, lines: 90 },
        // Includes the real-SQLite path for the Supabase-linking methods —
        // see profile-repository.sql.test.ts.
        "src/features/collections/profile-repository.ts": { statements: 80, branches: 70, functions: 95, lines: 80 },
        "src/features/history/history-repository.ts": { statements: 35, branches: 25, functions: 60, lines: 35 },
        "src/features/library/library-repository.ts": { statements: 45, branches: 50, functions: 55, lines: 45 },
        "src/features/preferences/preferences-repository.ts": {
          statements: 65,
          branches: 55,
          functions: 90,
          lines: 65,
        },
        // The repository is now a thin facade over the two storage adapters;
        // the real SQL coverage lives in progress-store-sql.ts (see
        // progress-repository.sql.test.ts) and the localStorage fallback in
        // progress-store-browser.ts.
        "src/features/progress/progress-repository.ts": { statements: 85, branches: 90, functions: 90, lines: 85 },
        "src/features/progress/progress-store-browser.ts": { statements: 95, branches: 85, functions: 95, lines: 95 },
        "src/features/progress/progress-store-sql.ts": { statements: 90, branches: 75, functions: 95, lines: 90 },
        "src/features/stats/stats-repository.ts": { statements: 35, branches: 65, functions: 45, lines: 35 },
        "src/features/watchlist/watchlist-repository.ts": { statements: 45, branches: 45, functions: 75, lines: 45 },
      },
    },
  },
});
