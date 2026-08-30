# Testing strategy

This document is the detailed, code-grounded companion to the testing summaries in `CLAUDE.md` and `docs/architecture.md`'s "Testing strategy" section — read those first for the short version. This one exists so a new contributor has one place to learn _how_ to write a test in this repo, not just what the split is.

## The core split: don't re-verify Rust logic in TS

Every substantial domain's SQL, transactions, cascades, and multi-table invariants are proven once, in Rust, against a real migrated SQLite pool (`cargo test`). TS repository tests mock `invoke()`/`invokeTypedCommand` and assert only the command name, its arguments, and that the result passes through — never a second, hand-written reimplementation of what the Rust side already does.

This is a hard rule, not a style preference: a real prior bug class in this repo was a TS fake reimplementing a command's logic, then drifting out of sync with the real Rust command while both test suites stayed green. If you're tempted to write real business logic into a TS test's mock, that logic almost certainly belongs in Rust instead.

```ts
// src/features/library/__tests__/library-repository.test.ts — the pattern to copy
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

it("save() invokes save_library_item with the media and patch", async () => {
  invokeMock.mockResolvedValueOnce(libraryItem());
  const { libraryRepository } = await import("../library-repository");

  await libraryRepository.save(media, { status: "completed" });
  expect(invokeMock).toHaveBeenCalledWith("save_library_item", { media, patch: { status: "completed" } });
});
```

The one deliberate exception is `src/db/migrations/` — `sqlite-adapter.ts` drives a real, file-backed SQLite engine directly from `migrations.integration.test.ts` and `migrations*.test.ts`, because parsing and applying the canonical migration files is genuinely TS-side logic (there's no Rust command to defer to for that).

## TypeScript / Vitest

- **Runner**: `vitest`, jsdom environment (see `vitest.config.ts`). `src/test-setup.ts` extends `expect` with `jest-axe`'s `toHaveNoViolations` matcher globally and polyfills `window.localStorage` for jsdom.
- **Where tests live**: colocated in `__tests__/` next to what they cover — a subfolder restructuring (see `git log --grep=refactor.*media`, `--grep=refactor.*auth` for recent examples) always moves a file's test alongside it, into the same subfolder.
- **Commands**: `pnpm test` (single run), `pnpm test:watch` (watch mode), `pnpm test:coverage` (adds coverage, see below). Scope to one file while iterating: `pnpm vitest run path/to/file.test.ts` or `pnpm vitest path/to/file.test.ts` (watch).
- **Coverage thresholds are per-file, not global** (`vitest.config.ts`'s `coverage.thresholds`) — most UI has no tests yet, which is a known, tracked gap, not a silent regression to chase. If you give a listed file real tests, move its threshold up with it; don't leave a stale, looser number once coverage actually improved. Percentages are sensitive to unrelated formatting churn (a `prettier --write` pass that expands one-liners dilutes the ratio without changing what's exercised) — recalibrate the specific file rather than treating a drop as a real regression without checking first.
- **Accessibility**: `eslint-plugin-jsx-a11y` (`eslint.config.js`) is a static gate that runs on every `pnpm lint` — it catches the common JSX mistakes (missing `alt`, unlabelled controls, invalid ARIA) without needing a rendered DOM. `jest-axe` is the runtime complement: call `axe(document.body)` and assert `toHaveNoViolations()` inside a component test to catch what static analysis can't (computed contrast, real DOM structure, dynamic ARIA state) — see `src/components/ui/__tests__/confirm-dialog.test.tsx` for the pattern (it also asserts focus-trap and Escape-to-close behavior alongside the axe check). Not every component needs an explicit axe test; add one for anything with non-trivial ARIA wiring (custom listbox/combobox patterns, dialogs, toasts) rather than mechanically covering all 200+ components. For the accessibility _patterns_ themselves (focus trap, virtual-focus listbox, live regions), see the `/design-system` page's catalog and `docs/design-system.md` — this document only covers how those get tested, not how to build them.

## Rust / `cargo test`

- **Runner**: `cargo test --locked --manifest-path src-tauri/Cargo.toml` (`pnpm cargo:test`). Each domain's `#[cfg(test)] mod tests` lives in the same file as the code it covers (`repository.rs`, `commands.rs`, `service.rs`).
- **Command-level tests use `tauri::test::mock_app()`** to construct a real `State<...>` without needing a real running app — this is what lets `commands.rs` functions (which take `State<'_, T>` parameters) be called directly in a test:

  ```rust
  // src-tauri/src/preferences/commands.rs
  #[tokio::test]
  async fn get_preferences_command_returns_the_defaults() {
      let pool = migrated_pool().await; // an in-memory, migrated pool
      let app = tauri::test::mock_app();
      app.manage(pool);
      app.manage(PreferencesCache::default());
      let pool_state: State<'_, SqlitePool> = app.state();
      let cache_state: State<'_, PreferencesCache> = app.state();

      let prefs = get_preferences(pool_state, cache_state).await.unwrap();
      assert_eq!(prefs.active_profile_id, "default");
  }
  ```

  One caveat: `app.path()` inside a `mock_app()`-backed test resolves to **real system directories**, not a sandbox — anything that touches `app.path()` (rather than a pool/cache you `manage()` yourself) needs care about what it actually reads or writes during a test run.

- **Coverage**: `pnpm cargo:coverage` runs `cargo +nightly llvm-cov --branch` for a per-file statement/line/function/**branch** table, mirroring the TS side's `pnpm test:coverage`. Branch coverage is an unstable `cargo-llvm-cov` feature that only builds under the nightly toolchain (needs `rustup toolchain install nightly` plus `rustup component add llvm-tools-preview --toolchain nightly` once — this doesn't change the machine's default toolchain, `cargo:check`/`clippy`/`test` still build under stable). Not part of `pnpm validate` — it's a heavier, on-demand check, not a gate.
- **Test-safe global state**: code with process-wide state that shouldn't have side effects under test (e.g. `src-tauri/src/diagnostics.rs`'s log-file `OnceLock<PathBuf>`) gates on `cfg!(test)` or checks whether the `OnceLock` was ever initialized, so `cargo test` runs don't write real files as a side effect of running.

## What's deliberately not covered

There is no _functional_ end-to-end test suite — no Cypress, no Tauri-driven Playwright. `e2e/visual/` does run Playwright, but purely for layout/responsive/theme screenshots against `pnpm dev`'s browser-preview shell (see `e2e/visual/README.md`); it never drives the real Tauri window, touches SQLite, or exercises a real user flow, so it doesn't close this gap. If you're adding a feature that genuinely needs an end-to-end functional check, that's a real, currently-open gap — flag it rather than assuming the visual suite covers it.

## Running the checks that gate a PR

`pnpm validate` runs the full chain (`validate:frontend` then `validate:backend`) — see `CONTRIBUTING.md`. While iterating, scope to whichever side you're touching (`pnpm validate:frontend` / `pnpm validate:backend`) and to the specific test file(s) in question; run the full `pnpm validate` once, at the end, before opening a PR — a change confined to one side can still break something the other side depends on (e.g. a Rust source reformat breaking a TS test that parses that source as text).
