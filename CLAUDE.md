# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm tauri dev        # run the desktop app (only place SQLite/IPC actually works)
pnpm dev              # Vite server alone, for UI/layout iteration (SQLite calls fail silently, banner shown)

pnpm lint             # ESLint
pnpm format           # Prettier --write
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest run
pnpm test:watch       # vitest
pnpm test:coverage    # vitest run --coverage (see per-file thresholds in vitest.config.ts)
pnpm build            # tsc --noEmit && vite build

pnpm cargo:check      # cargo check (src-tauri)
pnpm cargo:clippy     # cargo clippy --all-targets -- -D warnings
pnpm cargo:test       # cargo test

pnpm validate         # the full chain above — run before considering work done
```

Run a single test file: `pnpm vitest run path/to/file.test.ts` (or `pnpm vitest path/to/file.test.ts` in watch mode). Test files are colocated in `__tests__/` next to what they cover.

## Architecture

Two-sided data model, kept deliberately separate:

- **Catalogue data** (movies/series metadata, images) comes from TMDB through `MediaProvider` (`src/features/media/media-provider.ts`, implemented by `tmdb-media-provider.ts`), fetched via TanStack Query. This is the only network dependency.
- **Personal data** (library, progress, history, profiles, preferences, custom lists, availability alerts) lives in local SQLite (`sqlite:app.db`), reachable only from inside the Tauri webview.

Every domain follows the same feature shape under `src/features/<domain>/`: a **Rust command layer** (`src-tauri/src/commands/<domain>.rs`) owns transactions, cascades, and active-profile resolution; the TS **repository** (`<domain>-repository.ts`) is a thin `invokeCommand()` wrapper with no business logic of its own; a **hook** (`use-<domain>.ts`) wraps the repository in TanStack Query (`useQuery` for reads, `useInvalidatingMutation` from `src/shared/lib/query-mutation.ts` for writes, invalidating the relevant `queryKeys` — usually including `queryKeys.local.history` since most mutations also write an activity-log entry). Pages (`src/pages/`) compose these hooks; they don't call repositories directly.

`invokeCommand()` (`src/shared/lib/invoke.ts`) normalizes every Rust command failure into `ApiCommandError { message, status }`, mirroring the `ApiError` shape Rust serializes (`src-tauri/src/error.rs`). Don't catch and re-stringify IPC errors elsewhere — let this shape flow up to a remote-error state.

Outside the Tauri window (`pnpm dev` alone, or a browser tab), the UI still renders — no hook uses React Query's suspense mode — but every SQLite read/write fails silently; `browser-preview-banner.tsx` flags this. Don't treat that failure mode as a bug to fix.

`tauri.conf.json` fixes the window's `minWidth` at 1100px. Tailwind's `sm:`/`md:`/`lg:` breakpoints (640/768/1024) are therefore mechanically always active in the shipped app — only `xl:`/`2xl:` ever toggle when the window is resized. Don't add `sm:`/`md:` to product content expecting it to matter in production; it only affects the `pnpm dev` browser-preview surface (see the comment in `src/components/layout/app-shell.tsx`, the one place this used to be spelled out — now here too).

## Data integrity & authorization

These patterns come from real bugs found in an August 2026 audit (see `docs/audit-findings.md` for the full writeups) — apply them to new code, not just the specific spots that were fixed.

**Idempotent mutations.** Any command that both updates a current-state row and appends to an append-only log (`viewing_events`, `activity_log`) must check the requested state actually differs from the current one _before_ writing anything. A repeated call — retry, double-click, a caller invoking it twice — must be a no-op, never a duplicate log entry; duplicate `viewing_events` rows silently corrupt the stats/wrapped features that read them. `apply_episodes_and_log_impl` (`src-tauri/src/commands/progress.rs`) is the reference implementation to copy (see the `does_not_reapply_an_already_applied_episode` test); `toggle_movie_seen_impl` in the same file was missing this guard.

**Authorization belongs in the Rust command, not the React gate.** A frontend gate (e.g. `ProfileGate`) controls what renders, not what's callable — any `invoke()` name is reachable directly from the webview regardless of what's on screen. A command that reads or writes profile-scoped data must itself verify the caller may act on that profile; never assume the UI already checked.

**No hand-duplicated literal lists.** If a set of names (table names, routes, query keys, …) has to be enumerated in more than one place, extract a single shared constant instead of retyping the list in each spot — a drift between copies won't be caught by any test.

## Non-negotiables

These are recurring review findings in this repo's own history (see `git log --grep=raw` / `--grep=localize` / `--grep=hardcoded` / `--grep=confirm`) — check for them before considering a change done, not just when told to.

**i18n.** No literal user-facing string in TSX/TS. Every label, placeholder, aria-label, toast, and OS-level notification text goes through `t("namespace.key")` (`react-i18next`, see any page in `src/pages/` for the pattern). Add the key to **both** `src/i18n/locales/en.json` and `src/i18n/locales/fr.json` in the same change — `src/i18n/__tests__/locale-parity.test.ts` fails the build otherwise, and rejects empty values too. This includes strings inside `throw new Error(...)` — an untranslated exception message can end up rendered verbatim (it happened once in `token-vault.ts`).

**Design system.** No raw hex/RGB/HSL colors and no ad-hoc `<div>` styling in feature code. Use a semantic Tailwind token (`bg-primary`, `text-muted-foreground`, etc. — see `src/styles/index.css` for the token list) and an existing primitive from `src/components/ui` (`Card`, `Panel`, `Tile`, `Badge`, `Button`, …) or an existing product pattern (`src/components/states`, `src/components/media`) before writing new markup. Reference color values only belong in `src/shared/constants/colors.ts`; nowhere else (externally-fixed brand colors and purely decorative gradients are the sole documented exceptions — see `docs/design-system.md`). Full rules, token layering, typography scale, radius/elevation hierarchy, and motion durations are documented in `docs/design-system.md` — read it before adding or changing a component, not just this summary. A `Select`/`Input`/other form control is never labeled by its `placeholder` alone — it needs a real `<label>` or `aria-label`.

**Errors.** Pages that read remote or local data need an explicit remote-error state (see `src/components/states/remote-error-state.tsx`), not a silent hang or a raw thrown error — this was itself the subject of two dedicated fix passes across the codebase. Never surface `error.message` directly to the user, on any screen, not just data pages: it may carry raw SQL/IPC detail and it won't be in the user's language — route it through a translated message instead. And never swallow an error silently (`.catch(() => undefined)`, an empty `catch {}`): at minimum log it (`src/features/diagnostics/logger.ts`), and surface it if the action was user-triggered.

**Irreversible actions.** Anything that can't be undone — delete, restore, undo-an-import — routes through `ConfirmDialog` (`src/components/ui/confirm-dialog.tsx`), no exceptions, even when the action feels minor. The component's own header comment explains why this rule exists; it was added after an audit found some destructive actions bypassing it.

**Keep docs in sync with the code they describe.** `docs/architecture.md`, `docs/database-schema.md`, and inline test-config comments (`vitest.config.ts`) are read as a source of truth by contributors and by Claude Code itself. If a change alters a mechanism one of these describes — removing a persister, renaming a file a comment points to — update that doc or comment in the same change, not as a follow-up.

## Testing

- Repository tests exercise the Tauri `invoke()` wrapper against a fake backend (`src/db/__tests__/fake-invoke-backend.ts`) or a real SQLite engine (`sqlite-adapter.ts`, `sqlite-test-harness.ts`) for the migration/profile-cascade paths — prefer the real-SQLite path when a test is about SQL behavior (joins, cascades), the fake backend when it's about the invoke plumbing.
- `vitest.config.ts` pins coverage thresholds per file, not globally (most of the UI has no tests yet — that's known, not a regression to silently fix). If you give a listed file real tests, its thresholds there should move with it.
- Rust side: `cargo test` covers the command layer directly; keep new SQL transactions and cascades tested there rather than only through the TS repository.

## Commits

This repo uses Conventional Commits (`type(scope): summary`, e.g. `fix(pages): add remote-error states missed by the prior error-state pass`) — match that format and keep the scope to the touched feature/area.
