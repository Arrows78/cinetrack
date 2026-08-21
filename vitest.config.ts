import { configDefaults, coverageConfigDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
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
    // Default "threads" pool runs test files across multiple worker
    // threads — fine locally, but CI (more available parallelism) exposed
    // cross-test module-cache timing issues in the vi.resetModules()-based
    // token-vault tests that never reproduced locally. A single fork
    // removes that source of flakiness; the suite is fast enough that
    // losing file-level parallelism isn't a real cost.
    // (Vitest 4: poolOptions.forks.singleFork was replaced by the top-level
    // maxWorkers — see https://vitest.dev/guide/migration#pool-rework.)
    pool: "forks",
    maxWorkers: 1,
    coverage: {
      reporter: ["text", "html"],
      // Kept broad (rather than scoped to the tested files below) so
      // `pnpm test:coverage` still surfaces the real, large gap on
      // components/pages/hooks — narrowing `include` would hide it.
      include: ["src/**/*.{ts,tsx}"],
      // Otherwise matches any sibling worktree's own src/ too (see the
      // `test.exclude` comment above). The 5 app-bootstrap files below are
      // pure composition/wiring (root render, router instance, the
      // declarative route tree, the QueryClient config object, and
      // App.tsx's top-level provider nesting + Tauri lifecycle wiring) with
      // no branching logic of their own to isolate — unit-testing them
      // would mean mounting the whole app tree, or asserting on config
      // shape, neither of which exercises real behavior. Excluded from the
      // coverage denominator so the global % reflects code that can
      // actually be meaningfully tested; everything else (including other
      // Tauri-adjacent modules like notification-service.ts/token-gate.tsx)
      // stays in scope since it has real logic worth covering.
      exclude: [
        ...coverageConfigDefaults.exclude,
        ".claude/**",
        "src/main.tsx",
        "src/app/App.tsx",
        "src/app/router.tsx",
        "src/app/router-config.tsx",
        "src/app/query-client.ts",
      ],
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
        // The facade is nearly fully covered since the SQL row-mapping lives
        // in Rust (export_impl/import_impl, src-tauri/src/commands/backup.rs)
        // — this file only validates and orchestrates the invoke() calls.
        "src/features/backup/portable-data.ts": { statements: 90, branches: 60, functions: 95, lines: 90 },
        // Config module read at import time (authConfig/getAuthClient); the
        // OAuth-error-mapping branch inside getAuthClient itself is thin.
        "src/features/auth/auth-client.ts": { statements: 90, branches: 80, functions: 100, lines: 90 },
        // Covers init/session/OAuth/OTP/signOut; excludes the Tauri deep-link
        // import branch (dynamic import, needs a real webview to exercise —
        // mocking it in-suite was tried and dropped: it changes the Tauri
        // init effect's success/timing enough to destabilize an unrelated,
        // already-passing test).
        "src/features/auth/auth-provider.tsx": { statements: 80, branches: 70, functions: 90, lines: 80 },
        "src/features/auth/provider-availability.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/features/auth/auth-screen.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/components/desktop/token-gate.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
        // The one uncovered branch is the `logLines ?? []` fallback inside the
        // Diagnostics "copy" button's onClick — that button is disabled
        // exactly when logLines is null/undefined/empty, so the fallback is
        // unreachable through any real interaction (confirmed: jsdom never
        // fires onClick on a disabled button).
        "src/components/settings/desktop-settings.tsx": { statements: 100, branches: 95, functions: 100, lines: 100 },
        // The one uncovered branch is confirmImport's `if (!file) return;`
        // guard — pendingImportFile is read synchronously (no intervening
        // await) and the confirm button is only reachable while the
        // ConfirmDialog is open, which itself requires pendingImportFile to
        // already be non-null, so the guard can't actually be hit through the
        // UI without calling the internal handler directly.
        "src/components/settings/backup-tools.tsx": { statements: 95, branches: 90, functions: 100, lines: 100 },
        "src/components/media/library-sections.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/components/media/next-episode-card.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/features/desktop/desktop-service.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/features/desktop/notification-service.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/features/desktop/update-service.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        // Mocks invoke() rather than a real SQLite engine (the SQL side is
        // covered in profiles.rs) — this only tests the invoke() mapping and
        // the one bit of client-side orchestration this repository keeps
        // (resetting activeProfileId on profile removal), per its own header
        // comment. See profile-repository.test.ts.
        "src/features/profiles/profile-repository.ts": { statements: 80, branches: 70, functions: 95, lines: 80 },
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
      },
    },
  },
});
