# Audit findings — patterns, pitfalls, and open items

This document is the code-grounded companion to the "Data integrity & authorization" and "Non-negotiables" sections of `CLAUDE.md`. It grew out of a full product/technical/security/UX audit run on 2026-08-15 (architecture, code quality, performance, security, database, tests, DevOps, product, UI/design, accessibility, responsive, edge cases). The audit report itself isn't checked into this repo; this document keeps the durable, generalizable part of it — the patterns to apply to *new* code — plus a short living checklist of what from that audit is still unfixed. Prune a pattern once it's second nature, and delete a checklist item once it's fixed; don't let this file grow into a permanent archive.

## Patterns to apply going forward

### Idempotent mutations

Any command that updates a current-state row **and** appends to an append-only log (`viewing_events`, `activity_log`) must check the requested state actually differs from the current one before writing anything. A repeated call — a retry, a double invoke, a caller that doesn't track whether it already succeeded — must be a no-op, not a second log row. This matters here specifically because `viewing_events` feeds the stats and yearly-wrap-up features directly: duplicate rows silently inflate what the user sees as their own history.

- **Reference implementation:** `apply_episodes_and_log_impl` (`src-tauri/src/commands/progress.rs`) — see the test `does_not_reapply_an_already_applied_episode` and `apply_episodes_only_writes_rows_that_actually_changed_state`.
- **Counter-example found:** `toggle_movie_seen_impl` in the same file inserts a `viewing_events` row and a history entry on every call with `watched=true`, without checking whether the movie was already marked seen. The interactive `SeenToggle` button mitigates this in normal use (it's disabled while a mutation is pending), but the command itself has no guard, unlike its episode counterpart.
- **Rule:** before writing to an event/history table, read the current state in the same transaction and short-circuit if nothing would change.

### Server-side authorization

A React-level gate (`ProfileGate`, `AuthGate`, or similar) controls what renders — it is not an authorization boundary. Any `invoke()` command name is callable directly from the webview regardless of what's on screen or which route is mounted.

- **Fixed 2026-08-15:** `docs/database-schema.md` documents that accessing a profile "requires being signed in with that specific account." `update_preference` (`src-tauri/src/commands/preferences.rs`) used to accept any key/value pair — `activeProfileId` was never validated against the authenticated Supabase session — so a direct `invoke("update_preference", { key: "activeProfileId", value: "default" })` call bypassed the documented guarantee. `update_preference` now rejects that key outright; switching profiles goes through the new `set_active_profile` command, which confirms the target profile exists and, if it's linked to a Supabase account, requires the caller to echo that account's id back (the same trust level `resolve_profile_for_supabase_user` already relies on elsewhere in that file — not cryptographic verification, see that command's own doc comment).
- **Rule:** a command that reads or writes profile-scoped (or otherwise access-controlled) data must itself verify the caller may act on that resource. Follow the pattern already used correctly for custom lists and availability alerts (`assert_owns_list` in `src-tauri/src/commands/custom_lists.rs`, the ownership check in `availability.rs`, and now `set_active_profile` in `preferences.rs`).

### No hand-duplicated literal lists

If a set of names — table names, routes, query keys — needs to be enumerated in more than one place, extract a single shared constant instead of retyping the list at each call site. A drift between two copies isn't caught by any test.

- **Counter-example found:** the list of profile-scoped table names is currently typed out separately in `migrations.rs` (`EXPECTED_TABLES`), twice in `profiles.rs` (the cascade delete and its own test), and again in `backup.rs` (the pre-import purge) — four independent copies that happen to agree today.
- **Rule:** define the list once (a shared `const`/array in one module) and import it everywhere it's needed.

### Irreversible actions require confirmation

Anything that can't be undone — delete, restore, undo-an-import — routes through `ConfirmDialog` (`src/components/ui/confirm-dialog.tsx`). No exceptions, even when the action feels minor or is itself an "undo" of something else.

- **Counter-example found:** "Undo last import" in `src/components/settings/backup-tools.tsx` fired directly on click, with no confirmation, unlike "Import" right next to it.
- **Rule:** if an action can't be reversed by clicking the same button again, it needs `ConfirmDialog` first.

### Error handling

- Never surface `error.message` directly to the user, on any screen — not just the main data pages that already have `RemoteErrorState`. A raw message may contain SQL/IPC detail and won't be in the user's language.
- Never swallow an error silently: `.catch(() => undefined)` or an empty `catch {}` with no `logger.warn`/`logger.error` hides real failures. If the action was user-triggered, surface it too.
- **Counter-example found:** `src/components/settings/desktop-settings.tsx` has several `.catch(() => undefined)` calls with no log, inconsistent with the same file's own `run()` helper, which does surface errors for button-triggered actions.

### i18n includes thrown errors

`t("namespace.key")` applies to every user-facing string, including the message of a `throw new Error(...)` if that message can end up rendered (check the callers before assuming it can't).

- **Counter-example found:** `src/features/desktop/token-vault.ts` threw `new Error("Token absent")` — a hardcoded French string — which surfaced verbatim in `token-gate.tsx`'s error display. Fixed by routing it through `t()` like the rest of the file already did for its other error path.

### Responsive breakpoints below the desktop window's floor are dead code

`tauri.conf.json` fixes the window's `minWidth` at 1100px. Tailwind's default `sm:`/`md:`/`lg:` breakpoints (640/768/1024) are therefore mechanically always active in the shipped app — only `xl:` (1280) and `2xl:` (1536) ever toggle when the window is resized. Don't add `sm:`/`md:` to product content expecting it to matter in the real app; that only affects the `pnpm dev` browser-preview surface, not the Tauri window users actually run.

### Keep documentation honest

`docs/architecture.md`, `docs/database-schema.md`, and comments in `vitest.config.ts` are read as source of truth by contributors and by Claude Code. Two examples of drift found and fixed in this pass:

- `docs/architecture.md` described a `localStorage` query-cache persister that had already been removed for privacy reasons (`src/app/query-client.ts`) — the paragraph kept describing the old behavior after the removal commit.
- `vitest.config.ts` had threshold comments pointing at files (`portable-data-export.ts`, `profile-repository.sql.test.ts`) that don't exist — the logic had moved (to Rust, or the comment was simply wrong about which test file covers it).

**Rule:** when a change removes or moves the thing a doc/comment describes, update that doc/comment in the same change.

### Startup database failures must degrade, not crash

A migration failure at launch (corrupt file, a stale `PRAGMA user_version` left over from an unrelated database, an incomplete manual restore) is not the same class of problem as a disk-full or permissions error — it's recoverable, because a *fresh* database at the same path migrates cleanly. Don't let it take the whole process down with no way for the user to respond.

- **Reference implementation:** `database::init_pool` (`src-tauri/src/database/mod.rs`) — on a migration failure it closes the pool, quarantines the broken file (renamed aside, never deleted) alongside its WAL/SHM sidecars, and retries once against a brand new file. Only a *second* failure (something no database-level recovery can route around) still propagates an error. The frontend reads the outcome via `get_boot_recovery` and `BootRecoveryGate` (`src/components/desktop/boot-recovery-gate.tsx`), offering to restore the last automatic backup before the rest of the app — including auth/profile resolution, which also depends on this pool — ever mounts.
- **Rule:** a Rust command layer that owns a resource the whole app depends on (the SQLite pool, here) should have a real recovery path for the failure modes that have one, and surface *that* state to the frontend explicitly — not just bubble every failure up to a process-level panic.

## Open items from the 2026-08-15 audit (not yet fixed)

Remove a line once it's actually fixed — don't let this turn into a second bug tracker.

- [ ] No remote error/crash reporting in production (only the local rotating log in `src/features/diagnostics/logger.ts`).
- [ ] No end-to-end test suite; 20/21 pages in `src/pages/` have no tests at all.
- [ ] No toast/snackbar component exists anywhere in `src/components/ui` — a z-index token is reserved for it (`src/pages/design-system/catalog-data.ts`) but nothing was ever built, which is the direct cause of inconsistent post-action feedback across the app.
- [ ] Multiple local profiles are promoted in the README but have no reachable UI to create one when `VITE_AUTH_REQUIRED=false` (the default) — either build the offline profile-management screen or drop the claim until it's built.
- [ ] No release/rollback strategy formalized yet (no signed builds, no published GitHub Release) — acceptable pre-1.0 per `.github/SECURITY.md`, but to revisit before a wider distribution.
- [ ] Watchlist, library status, and the `favourite` flag never reconcile with each other (no "already seen" badge on the watchlist, no way to view just favourites).
- [ ] `calendarService.build()` (`src/features/calendar/calendar-service.ts`) still only checks the first page of upcoming movies, the first `MAX_TRACKED_SERIES_IN_CALENDAR` (20) tracked series, and each series' last 2 seasons. **Partially addressed 2026-08-15**: entries are now clickable (link to the movie/series/season page) and `calendar-page.tsx` shows a "showing N of your M tracked series" notice when truncated — but the underlying caps themselves haven't been lifted (would need pagination or incremental sync).
