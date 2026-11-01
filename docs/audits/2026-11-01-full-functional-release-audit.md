# Full functional / release audit — 2026-11-01

## Scope

This audit covers the product as a whole, not only mobile:

- boot, persistence, migrations and recovery;
- library, progress, history, lists and collection actions;
- account/authentication and profiles;
- backup/import/export and restore semantics;
- cloud sync and hosted-backend assumptions;
- notifications and availability monitoring;
- responsive/mobile behavior, especially iOS;
- accessibility and user-facing error handling;
- performance/scalability;
- CI, dependency security and release readiness.

It re-checks the unresolved items from the earlier audits (2026-10-10, 2026-10-18 and 2026-10-24, since removed from the repository once everything in them was fixed or carried over here — see git history) against the current code and adds new findings found on 2026-11-01.

## Executive result

No new P0 data-loss or database-corruption path was found.

The codebase is in good shape for a desktop release and for an iOS development beta, but it is not yet correct to call the product fully launch-ready. The remaining material risks are mostly integration/operational: real-device iOS behavior, hosted Supabase verification, extreme-scale reads, and a handful of release/CI checks that are still only partially exercised.

## Findings and actions

| Priority | Area               | Finding                                                                                                                                                                      | Evidence / impact                                                                                                                                 | Action                                                                                       |
| -------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| P1       | Account            | Cancelling an email change could leave an unverified Clerk email attached to the account; verification-setup failure could do the same                                       | `AccountSettingsCard` creates the address before preparing verification and previously never destroyed it on cancel/setup failure                 | Fixed in #89                                                                                 |
| P2       | Collections        | “Add missing collection movies” was not atomic but reported success/failure as if it were                                                                                    | `Promise.all` rejects on the first failure while other adds continue; user could see “failed” after partial mutation                              | Fixed in #89 with `Promise.allSettled` and partial-result feedback                           |
| P1       | Mobile UX          | Fixed toasts/offline banners could overlap the bottom tab bar/home indicator                                                                                                 | Fixed-position UI ignored the mobile navigation/safe area                                                                                         | Fixed in #87                                                                                 |
| P1       | Mobile backup      | Manual backup export relied on browser download behavior                                                                                                                     | Not reliable on iOS WebView                                                                                                                       | Fixed in #87: native share sheet                                                             |
| P1       | Mobile backup      | A desktop custom backup path restored from a portable backup could be reused on mobile                                                                                       | Mobile cannot use the desktop filesystem path                                                                                                     | Fixed in #87: mobile automatic backups always stay in app sandbox                            |
| P1       | Mobile lifecycle   | Periodic maintenance relied on timers that may be suspended in the background                                                                                                | Availability checks/backups/reminders could remain stale after resume                                                                             | Fixed in #87: run immediately on foreground resume                                           |
| P2       | Mobile integration | Desktop-only shortcut/tray wiring still ran from the shared desktop service                                                                                                  | Produces unnecessary failures/noise on mobile                                                                                                     | Fixed in #87 while retaining deep links                                                      |
| P2       | UX/error handling  | Clipboard rejection could escape silently in diagnostics/auth flows                                                                                                          | Mobile/browser clipboard APIs can reject                                                                                                          | Fixed in #87                                                                                 |
| P2       | Images/perf        | “Image cache” stores TMDB responses in Cache Storage but image elements never read that cache                                                                                | Cache Storage is not the browser HTTP cache and there is no service-worker interception; prefetch can duplicate downloads while consuming storage | Fixed in e436339e: prefetch now primes the webview's own image cache                         |
| P1       | iOS QA             | OAuth custom-scheme round trip has not been proven on a physical iPhone                                                                                                      | Browser -> `cinetrack://auth/callback` is launch-critical                                                                                         | Real-device gate                                                                             |
| P1       | iOS QA             | Notification behavior while suspended has not been proven                                                                                                                    | JS timers are not reliable background schedulers on iOS                                                                                           | Real-device gate; background delivery may require native scheduling/push                     |
| P1       | iOS QA             | Share sheet, Files/iCloud backup round-trip, keyboard and safe-area behavior need real-device verification                                                                   | Simulator/unit/visual tests do not prove OS integrations                                                                                          | Real-device gate                                                                             |
| P2       | Sync/backend       | Hosted Supabase RLS hardening migration / pgTAP verification remained unexecuted in the previous audit                                                                       | Local code/tests do not prove the hosted project has the intended policy                                                                          | Verify hosted migration and run pgTAP                                                        |
| P2       | Performance        | `/movies` and `/series` hubs still read the full library at extreme scale                                                                                                    | Previous audit measured ~1.98 s debug at 50k titles                                                                                               | Product/perf work: paginate or query by progress bucket                                      |
| P2       | Performance        | Stats active-event CTE is recalculated by multiple queries                                                                                                                   | Previous audit measured large debug costs at 100k events                                                                                          | Measure release build; cache/materialize only if release numbers justify it                  |
| P3       | Auth security      | Clerk browser token remains in web storage                                                                                                                                   | Deliberate tradeoff documented previously; Stronghold would change unlock UX                                                                      | Accepted design decision unless threat model changes                                         |
| P2       | Release            | Real updater transition between two published versions has not been exercised end-to-end                                                                                     | Workflow can build/publish without proving an installed old version updates correctly                                                             | Release QA gate                                                                              |
| P2       | Windows stability  | Previous audit observed intermittent `database is locked` in a restart stress test                                                                                           | One failure in roughly nine runs was previously observed                                                                                          | Re-run/reproduce on current main; fix if still reproducible                                  |
| P3       | CI quality         | No Rust coverage threshold                                                                                                                                                   | Existing Rust tests are broad, but coverage is not a merge gate                                                                                   | Optional CI improvement, not a launch blocker                                                |
| P3       | Accessibility      | Real VoiceOver/NVDA testing is still absent                                                                                                                                  | axe/jsdom cannot validate actual assistive-tech behavior or every native webview interaction                                                      | Manual QA gate                                                                               |
| P2       | Data integrity     | `library_entries.rewatch_count` is written directly while rewatch stats read `rewatched` viewing events, so the two can diverge; a TV Time undo can leave the counter behind | Carried over from the 2026-10-24 audit, still open: `src-tauri/src/library/insert.rs` sets the counter itself                                     | Derive the counter from viewing events, or update both in one transaction                    |
| P2       | Sync/backend       | Supabase hardening left from the 2026-10-24 audit: no per-document quotas, `sync_documents` reachable outside the sync RPCs, and the CSP allows any `https://*.supabase.co`  | Carried over, still open (`src-tauri/tauri.conf.json` CSP)                                                                                        | Add quotas, restrict table access to the RPCs, pin the CSP to the project host at build time |

## Core functional review

### Persistence, migrations and recovery

The current architecture keeps persistence in Rust/SQLite and routes frontend writes through typed Tauri commands. Existing tests cover restart recovery, WAL scenarios, migration paths, foreign-key integrity and destructive backup/restore behavior.

No new P0 path was found in this pass.

Remaining verification is operational rather than architectural: real installed-app restarts and restore flows on the target OS.

### Library, progress and history

The movie/series progress rules, automatic/manual status ownership, episode tracking, rewatch handling, history undo paths and list operations are extensively covered by the current Rust/TS suites.

The concrete new functional issue found here was the collection batch-add semantics, fixed in #89.

### Accounts and profiles

Email OTP, OAuth, optional auth, local profiles, PIN protection and account/profile scoping are structurally separated correctly.

The concrete new account issue found was abandoned Clerk email resources during email-change cancellation/failure, fixed in #89.

The remaining high-risk item is not the React flow itself but real iOS OAuth browser/deep-link behavior.

### Backup and restore

The backup format is validated and size-limited; restore snapshots the previous state and supports undo. Synced restore behavior was hardened previously so deleted cloud documents are queued correctly.

#87 adds the missing mobile behavior: app-sandbox automatic backups and native sharing for portable exports.

### Sync

The sync engine uses cursor recovery, outbox mutations and wake-on-visibility behavior. Account/device scoping is enforced in the Rust/backend-facing layer.

The principal unresolved risk is hosted configuration: migration/RLS state must be checked on the actual Supabase project, not inferred from repository files.

### Notifications

The notification service correctly gates on permissions/preferences and deduplicates sent reminders per profile.

The product semantics need to remain explicit: the current periodic logic is reliable while the app runs and now refreshes after resume, but this is not equivalent to guaranteed iOS background scheduling.

## Product/UX review

The responsive product has already had broad 360–1280 px / EN+FR / axe coverage in the October audit. #87 addresses new mobile-specific fixed-layer and viewport issues found in this pass.

The image-cache debt noted here has since been fixed (e436339e): prefetching now loads the exact `<img>` URLs through the webview's own image cache instead of an unread Cache Storage copy.

## Performance review

The normal product paths avoid several previously-fixed full-library reads and include request concurrency limiting. The two major known extreme-scale issues are still the movie/series hubs and repeated stats active-event work.

These are not blockers for a normal-size beta, but they should not be marked “done” merely because CI is green.

## Release / CI review

The newly published OSV advisories that broke `main` were handled in #86 using scoped, expiring exceptions rather than disabling scanning globally. Current `main` is re-running CI from commit `350587c`, and visual regression is green.

Open release-oriented items:

- verify updater from an actually installed previous version;
- verify hosted Supabase migration/RLS state;
- complete iOS physical-device QA;
- do not treat Android preparation as a prerequisite for the requested iOS launch.

## Recommended order

1. Merge/validate #89 (functional account + collection fixes).
2. Merge/validate #87 (cross-platform/mobile functional fixes).
3. Re-scope #88 so Android work is not presented as part of the immediate iOS launch path.
4. ~~Fix or remove the ineffective image-cache feature.~~ Done in e436339e.
5. Run hosted Supabase/RLS verification.
6. Run the iOS physical-device checklist with Xcode Personal Team.
7. Exercise a real updater transition before calling the desktop release pipeline fully verified.
8. Revisit the two extreme-scale performance items after release-build measurements.
