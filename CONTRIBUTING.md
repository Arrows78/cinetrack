# Contributing

## Read this first

Before writing code, skim:

- **`CLAUDE.md`** — the architecture summary, non-negotiables (i18n, design system, error handling, irreversible actions), and data-integrity patterns. This is the fastest path to understanding what "correct" looks like in this codebase.
- **`docs/architecture.md`**'s "Architecture boundaries" section — the normative rules for where code goes and what a feature/page/shared module is allowed to import. These are enforced by `pnpm lint` (`eslint-plugin-boundaries`, for `shared`/`components/ui` never importing `features`/`pages`) and `pnpm architecture:check` (`scripts/check-feature-boundaries.mjs`, for feature-to-feature isolation) — a PR that violates one fails CI, not just review.
- **`docs/testing.md`** — the full testing strategy, including when (and when not) to mock `invoke()` in a TS test, the `tauri::test::mock_app()` pattern for Rust command tests, and per-file coverage thresholds. Short version: Rust tests prove SQL/transaction/cascade behavior once against a real migrated pool; TS repository tests only assert that `invoke()` was called with the right command name and args, never a second reimplementation of Rust's logic.

For accessibility guidance (focus trap, virtual-focus listbox, live regions, contrast), see the `/design-system` page's catalog and `docs/design-system.md` — there's no separate accessibility doc; that catalog is the source of truth for the patterns, and `docs/testing.md` covers how they get tested.

## Prerequisites

- Node.js, version pinned in `.nvmrc` (currently 22)
- pnpm 10.6.5 (see `packageManager` in `package.json`)
- Rust toolchain (stable) with `cargo`, for the Tauri backend in `src-tauri/`

Install dependencies with:

```bash
pnpm install
```

## Running the app

```bash
pnpm tauri dev        # run the desktop app — the only place SQLite/IPC actually works
pnpm dev              # Vite server alone, for UI/layout iteration
```

`pnpm dev` alone (or a plain browser tab) still renders the UI, but every
SQLite read/write fails silently, and the browser-preview banner will flag
this. That's expected — use `pnpm tauri dev` whenever you need real data.

## Before opening a PR

Run the full validation chain:

```bash
pnpm validate
```

This runs `validate:frontend` then `validate:backend`:

- **`validate:frontend`**: `contract:check` (generated Tauri command names/signatures, plus the smaller field-name drift check for DTOs that still opt out of `ts-rs` generation), `architecture:check` (feature-boundary isolation), `lint`, `format:check`, `typecheck`, `test:coverage`, `build`.
- **`validate:backend`**: `cargo:check`, `cargo:clippy` (`-D warnings`), `cargo:format:check`, `cargo:test`, `contract:check-ts-bindings` (regenerates the `ts-rs`-derived TS DTOs and fails if that changes anything not already committed).

All of it should pass before you open a pull request. While iterating, scope to the side you're touching (`pnpm validate:frontend` / `pnpm validate:backend`) and to specific test files — see `package.json`'s `scripts` section for the full list, including `pnpm test:watch` and `pnpm vitest run path/to/file.test.ts` for one file at a time. Run the full `pnpm validate` once, at the end: a change confined to one side can still break something the other side depends on.

## Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): summary` — e.g. `fix(pages): add remote-error state missed by the prior pass`.
Keep the scope to the touched feature or area.
