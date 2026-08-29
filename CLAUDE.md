# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm tauri dev        # run the desktop app (only place SQLite/IPC actually works)
pnpm dev              # Vite server alone, for UI/layout iteration (SQLite calls fail silently, banner shown)

pnpm lint             # ESLint (includes boundaries/dependencies — see docs/architecture.md's "Architecture boundaries")
pnpm format           # Prettier --write
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest run
pnpm test:watch       # vitest
pnpm test:coverage    # vitest run --coverage (see per-file thresholds in vitest.config.ts)
pnpm contract:generate # regenerate src/generated/tauri-command-names.ts from lib.rs's tauri::generate_handler!
pnpm contract:check   # contract:generate --check, plus check-contract-drift.mjs (DTO field-name drift) and check-tauri-command-signatures.mjs (Args/Result signature drift)
pnpm architecture:check # scripts/check-feature-boundaries.mjs — enforces each feature's public surface (see docs/architecture.md's "Architecture boundaries")
pnpm build            # pnpm typecheck && vite build

pnpm cargo:check         # cargo check (src-tauri)
pnpm cargo:clippy        # cargo clippy --all-targets -- -D warnings
pnpm cargo:clippy:fix    # cargo clippy --all-targets --fix -- -D warnings
pnpm cargo:format        # cargo fmt (rustfmt --write)
pnpm cargo:format:check  # cargo fmt -- --check (what CI runs)
pnpm cargo:test          # cargo test
pnpm cargo:coverage      # cargo +nightly llvm-cov --branch (see the Testing section below)

pnpm validate:frontend # contract:check, architecture:check, lint, format:check, typecheck, test:coverage, build
pnpm validate:backend  # cargo:check, cargo:clippy, cargo:format:check, cargo:test
pnpm validate           # validate:frontend && validate:backend — run before considering work done
```

Scope a check to just the side you touched (`validate:frontend`/`validate:backend`) while iterating — e.g. inside a subagent working on one file, or a parallel batch where each agent should stay scoped and not duplicate the other side's checks. Run the full `pnpm validate` once, centrally, before calling a batch of work done: a change confined to one side can still break something the other side depends on (e.g. a Rust source reformat breaking a TS test that parses that source as text), so the full chain is the only thing that actually proves nothing broke.

Run a single test file: `pnpm vitest run path/to/file.test.ts` (or `pnpm vitest path/to/file.test.ts` in watch mode). Test files are colocated in `__tests__/` next to what they cover.

## Architecture

Two-sided data model, kept deliberately separate:

- **Catalogue data** (movies/series metadata, images) comes from TMDB through `MediaProvider` (`src/features/media/media-provider.ts`, implemented by `tmdb-media-provider.ts`), fetched via TanStack Query. This is the only network dependency.
- **Personal data** (library, progress, history, profiles, preferences, custom lists, availability alerts) lives in local SQLite (`sqlite:app.db`), reachable only from inside the Tauri webview.

Frontend domains live under `src/features/<domain>/`: the TS **repository** (`<domain>-repository.ts`) is a thin `invokeCommand()` wrapper with no business logic of its own, and a **hook** (`use-<domain>.ts`) wraps that repository in TanStack Query. Every substantial Rust domain (Library, Progress, Stats, Backup, Availability, Profiles, Preferences, History, the `lists/` bounded context, `integrations/{tmdb,tvtime}`) lives at `src-tauri/src/<domain>/` as a vertical slice: `commands.rs` is the thin Tauri adapter, `service.rs` owns use-case orchestration and active-profile resolution (skipped for the handful of domains with no real orchestration to speak of — see docs/architecture.md), and `repository.rs` / `queries.rs` own persistence. `src-tauri/src/commands/mod.rs` is now just the IPC registry: it re-exports every domain's commands and holds only `boot.rs`/`updater.rs` directly (too small to be worth their own slice). Dependency direction between these layers is enforced by the compiler itself (`pub(super)`/`pub(crate)` visibility) and, on the frontend, by `eslint-plugin-boundaries` — see docs/architecture.md's "Architecture boundaries" section for the normative rules, not just this summary. Pages (`src/pages/`) compose hooks; they don't call repositories directly.

`invokeCommand()` (`src/shared/lib/invoke.ts`) normalizes every Rust command failure into `ApiCommandError { message, status }`, mirroring the `ApiError` shape Rust serializes (`src-tauri/src/error.rs`). Don't catch and re-stringify IPC errors elsewhere — let this shape flow up to a remote-error state.

Outside the Tauri window (`pnpm dev` alone, or a browser tab), the UI still renders — no hook uses React Query's suspense mode — but every SQLite read/write fails silently; `browser-preview-banner.tsx` flags this. Don't treat that failure mode as a bug to fix.

`tauri.conf.json`'s window `minWidth` is 360px (a small-phone floor, lowered from a former 1100px specifically so Tailwind's `sm:`/`md:`/`lg:` breakpoints — 640/768/1024 — are actually reachable by resizing the window, not just in `pnpm dev`'s browser-preview surface). `app-shell.tsx` splits its layout at `lg:` — a sidebar above it, a mobile header + bottom `MobileTabBar` below — and this split is live in the shipped desktop app, not vestigial. Prepping for an eventual mobile build (Tauri Mobile — see `src-tauri/gen/apple`) reuses the exact same breakpoint.

## Data integrity & authorization

These patterns come from real bugs found in an August 2026 audit (see `docs/audit-findings.md` for the full writeups) — apply them to new code, not just the specific spots that were fixed.

**Idempotent mutations.** Any command that both updates a current-state row and appends to an append-only log (`viewing_events`, `activity_log`) must check the requested state actually differs from the current one _before_ writing anything. A repeated call — retry, double-click, a caller invoking it twice — must be a no-op, never a duplicate log entry; duplicate `viewing_events` rows silently corrupt the stats/wrapped features that read them. `apply_episodes_and_log_impl` (`src-tauri/src/progress/repository.rs`) is the reference implementation to copy (see the `does_not_reapply_an_already_applied_episode` test); `toggle_movie_seen_impl` in the same file was missing this guard.

**Authorization belongs in the Rust command, not the React gate.** A frontend gate (e.g. `ProfileGate`) controls what renders, not what's callable — any `invoke()` name is reachable directly from the webview regardless of what's on screen. A command that reads or writes profile-scoped data must itself verify the caller may act on that profile; never assume the UI already checked.

**No hand-duplicated literal lists.** If a set of names (table names, routes, query keys, …) has to be enumerated in more than one place, extract a single shared constant instead of retyping the list in each spot — a drift between copies won't be caught by any test.

## Non-negotiables

These are recurring review findings in this repo's own history (see `git log --grep=raw` / `--grep=localize` / `--grep=hardcoded` / `--grep=confirm`) — check for them before considering a change done, not just when told to.

**i18n.** No literal user-facing string in TSX/TS. Every label, placeholder, aria-label, toast, and OS-level notification text goes through `t("namespace.key")` (`react-i18next`, see any page in `src/pages/` for the pattern). Add the key to **both** `src/i18n/locales/en.json` and `src/i18n/locales/fr.json` in the same change — `src/i18n/__tests__/locale-parity.test.ts` fails the build otherwise, and rejects empty values too. This includes strings inside `throw new Error(...)` — an untranslated exception message can end up rendered verbatim (it happened once in `token-vault.ts`).

**Design system.** No raw hex/RGB/HSL colors and no ad-hoc `<div>` styling in feature code. Use a semantic Tailwind token (`bg-primary`, `text-muted-foreground`, etc. — see `src/styles/index.css` for the token list) and an existing primitive from `src/components/ui` (`Card`, `Panel`, `Tile`, `Badge`, `Button`, …) or an existing product pattern (`src/components/states`, `src/components/media`) before writing new markup. Reference color values only belong in `src/shared/constants/colors.ts`; nowhere else (externally-fixed brand colors and purely decorative gradients are the sole documented exceptions — see `docs/design-system.md`). Full rules, token layering, typography scale, radius/elevation hierarchy, and motion durations are documented in `docs/design-system.md` — read it before adding or changing a component, not just this summary. A `Select`/`Input`/other form control is never labeled by its `placeholder` alone — it needs a real `<label>` or `aria-label`.

**Errors.** Pages that read remote or local data need an explicit remote-error state (see `src/components/states/remote-error-state.tsx`), not a silent hang or a raw thrown error — this was itself the subject of two dedicated fix passes across the codebase. Never surface `error.message` directly to the user, on any screen, not just data pages: it may carry raw SQL/IPC detail and it won't be in the user's language — route it through a translated message instead. And never swallow an error silently (`.catch(() => undefined)`, an empty `catch {}`): at minimum log it (`src/shared/lib/logger.ts`), and surface it if the action was user-triggered.

**Irreversible actions.** Anything that can't be undone — delete, restore, undo-an-import — routes through `ConfirmDialog` (`src/components/ui/confirm-dialog.tsx`), no exceptions, even when the action feels minor. The component's own header comment explains why this rule exists; it was added after an audit found some destructive actions bypassing it.

**Keep docs in sync with the code they describe.** `docs/architecture.md`, `docs/database-schema.md`, and inline test-config comments (`vitest.config.ts`) are read as a source of truth by contributors and by Claude Code itself. If a change alters a mechanism one of these describes — removing a persister, renaming a file a comment points to — update that doc or comment in the same change, not as a follow-up.

## Testing

- Repository tests mock `invoke()`/`invokeTypedCommand` directly (see `library-repository.test.ts` for the pattern) and assert the right command name/args and that the result passes through — the SQL, transactions, and cascades a command triggers are Rust's job and are tested there (`cargo test`), not re-verified a second time in TS against a fake reimplementation. The one place TS still drives a real SQLite engine is `sqlite-adapter.ts`, used directly by the migration/recovery tests (`src/db/__tests__/migrations*.test.ts`) for schema/cascade behavior that's genuinely TS-side (parsing and applying the canonical migration files).
- `vitest.config.ts` pins coverage thresholds per file, not globally (most of the UI has no tests yet — that's known, not a regression to silently fix). If you give a listed file real tests, its thresholds there should move with it.
- Rust side: `cargo test` covers the crate-root domain slices directly; keep service orchestration, SQL transactions, repository queries, and cascades tested there rather than only through the TS repository.
- `pnpm cargo:coverage` runs `cargo llvm-cov --branch` for a per-file statement/line/function/**branch** table on the Rust side, mirroring the TS side's `pnpm test:coverage`. Branch coverage is an unstable `cargo-llvm-cov` feature and only builds under the nightly toolchain, so the script pins `+nightly` itself — this needs `rustup toolchain install nightly` plus `rustup component add llvm-tools-preview --toolchain nightly` once, but doesn't change the machine's default toolchain (`cargo:check`/`clippy`/`test` still build under stable). Not part of `pnpm validate` — it's a heavier, on-demand check, not a gate.

## Commits

This repo uses Conventional Commits (`type(scope): summary`, e.g. `fix(pages): add remote-error states missed by the prior error-state pass`) — match that format and keep the scope to the touched feature/area.
