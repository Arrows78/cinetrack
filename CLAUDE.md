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
- **Personal data** (watchlist, library, progress, history, profiles, preferences, custom lists, availability alerts) lives in local SQLite (`sqlite:app.db`), reachable only from inside the Tauri webview.

Every domain follows the same feature shape under `src/features/<domain>/`: a **Rust command layer** (`src-tauri/src/commands/<domain>.rs`) owns transactions, cascades, and active-profile resolution; the TS **repository** (`<domain>-repository.ts`) is a thin `invokeCommand()` wrapper with no business logic of its own; a **hook** (`use-<domain>.ts`) wraps the repository in TanStack Query (`useQuery` for reads, `useInvalidatingMutation` from `src/shared/lib/query-mutation.ts` for writes, invalidating the relevant `queryKeys` — usually including `queryKeys.local.history` since most mutations also write an activity-log entry). Pages (`src/pages/`) compose these hooks; they don't call repositories directly.

`invokeCommand()` (`src/shared/lib/invoke.ts`) normalizes every Rust command failure into `ApiCommandError { message, status }`, mirroring the `ApiError` shape Rust serializes (`src-tauri/src/error.rs`). Don't catch and re-stringify IPC errors elsewhere — let this shape flow up to a remote-error state.

Outside the Tauri window (`pnpm dev` alone, or a browser tab), the UI still renders — no hook uses React Query's suspense mode — but every SQLite read/write fails silently; `browser-preview-banner.tsx` flags this. Don't treat that failure mode as a bug to fix.

## Non-negotiables

These are recurring review findings in this repo's own history (see `git log --grep=raw` / `--grep=localize` / `--grep=hardcoded`) — check for them before considering a UI change done, not just when told to.

**i18n.** No literal user-facing string in TSX/TS. Every label, placeholder, aria-label, toast, and OS-level notification text goes through `t("namespace.key")` (`react-i18next`, see any page in `src/pages/` for the pattern). Add the key to **both** `src/i18n/locales/en.json` and `src/i18n/locales/fr.json` in the same change — `src/i18n/__tests__/locale-parity.test.ts` fails the build otherwise, and rejects empty values too.

**Design system.** No raw hex/RGB/HSL colors and no ad-hoc `<div>` styling in feature code. Use a semantic Tailwind token (`bg-primary`, `text-muted-foreground`, etc. — see `src/styles/index.css` for the token list) and an existing primitive from `src/components/ui` (`Card`, `Panel`, `Tile`, `Badge`, `Button`, …) or an existing product pattern (`src/components/states`, `src/components/media`) before writing new markup. Reference color values only belong in `src/shared/constants/colors.ts`; nowhere else. Full rules, token layering, typography scale, radius/elevation hierarchy, and motion durations are documented in `docs/design-system.md` — read it before adding or changing a component, not just this summary.

**Errors.** Pages that read remote or local data need an explicit remote-error state (see `src/components/states/remote-error-state.tsx`), not a silent hang or a raw thrown error — this was itself the subject of two dedicated fix passes across the codebase.

## Testing

- Repository tests exercise the Tauri `invoke()` wrapper against a fake backend (`src/db/__tests__/fake-invoke-backend.ts`) or a real SQLite engine (`sqlite-adapter.ts`, `sqlite-test-harness.ts`) for the migration/profile-cascade paths — prefer the real-SQLite path when a test is about SQL behavior (joins, cascades), the fake backend when it's about the invoke plumbing.
- `vitest.config.ts` pins coverage thresholds per file, not globally (most of the UI has no tests yet — that's known, not a regression to silently fix). If you give a listed file real tests, its thresholds there should move with it.
- Rust side: `cargo test` covers the command layer directly; keep new SQL transactions and cascades tested there rather than only through the TS repository.

## Commits

This repo uses Conventional Commits (`type(scope): summary`, e.g. `fix(pages): add remote-error states missed by the prior error-state pass`) — match that format and keep the scope to the touched feature/area.
