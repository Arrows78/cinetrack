# Pre-launch functional and mobile audit — 2026-11-01

## Scope and confidence

This pass reviews the current `main` product flows, platform gates and the previous October audit evidence. It combines source/configuration review with the repository's existing unit, Rust persistence, visual and iOS-simulator CI coverage.

It is **not** a substitute for the real-device matrix in `docs/mobile-release.md`. Native permission prompts, OAuth browser hand-off, background suspension, keyboard behavior and OS share sheets must still be exercised on actual devices before a mobile release.

## Executive result

The core local-first product is structurally ready for a mobile beta once the mobile UX fixes and launch-preparation changes land. No new database-integrity or destructive-flow P0 was found in this pass.

The highest-risk launch gaps are native/device integration rather than core library logic:

| Priority | Finding                                                                                                          | Status / action                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| P1       | Fixed overlays could sit underneath the mobile tab bar / home-indicator area                                     | Fixed in mobile functional-readiness PR                                    |
| P1       | Several safe-area `calc()` Tailwind classes omitted required operator whitespace                                 | Fixed in mobile functional-readiness PR                                    |
| P1       | Manual JSON backup relied on browser download semantics on mobile                                                | Fixed: native share sheet on iOS                                           |
| P1       | A desktop `backupDirectory` restored from a portable backup could be reused as an invalid mobile filesystem path | Fixed: mobile always uses app-sandbox automatic backups                    |
| P1       | Tauri mobile does not support folder picking, but Settings exposed the control                                   | Fixed: mobile hides it and explains sandbox/export behavior                |
| P2       | Clipboard failures for auth diagnostics / local logs were unhandled                                              | Fixed with visible feedback/logging                                        |
| P1       | iOS device launch path needed a documented free-signing workflow                                                 | Prepared in this PR                                                        |
| P1       | iOS distribution cannot be validated or shipped without Apple Developer Program                                  | External launch gate; simulator + Personal Team testing remain possible    |
| P1       | Real iOS OAuth deep-link round trip has not been device-tested                                                   | Required QA gate                                                           |
| P1       | Notification delivery/background behavior has not been device-tested                                             | Required QA gate                                                           |
| P1       | Physical-device iOS install has not yet been validated with a Personal Team                                      | Required device QA gate                                                    |
| P2       | Large-library whole-read/performance items identified in the October audit remain                                | Post-beta scalability work unless target users already exceed tested scale |

## Functional coverage review

### Boot, persistence and recovery

- SQLite is initialized/migrated before product use.
- Existing Rust persistence tests cover clean restarts, hard-kill/WAL recovery and migration paths.
- Integrity failures route back into the blocking recovery UI rather than continuing to write.
- Automatic backups rotate and restore through a pre-restore snapshot.
- Mobile now ignores desktop-only custom backup paths restored from portable backups.

**Launch gate:** repeat kill/restart/restore on real iOS storage.

### Authentication and profiles

- Email-code and OAuth flows share the same Clerk state machine.
- Warm callback handling uses deep-link listeners and queued-link reads.
- Profiles, PIN protection and account/profile scoping already have focused tests.

**Launch gate:** exercise every enabled OAuth provider from system browser back into the iOS app. Do not infer success from browser or simulator-only tests.

### Catalogue, library and progress

The main user loop is covered by the existing frontend/Rust suites: search/catalogue, library mutations, movie watches, episode progress, ratings, tags, custom/smart lists, history and derived series status.

No new mobile-specific blocker was found in those domain rules; they use the same typed Tauri commands and SQLite backend.

### Sync

- Sync wakes on `visibilitychange`, which is important after mobile WebViews are suspended.
- Cursor-based pull recovers missed realtime notifications.
- Query caches are scoped/cleared across account changes.

**Launch gate:** two-device conflict/resume testing against the actual hosted backend, including an app suspended long enough to miss realtime events.

### Notifications and availability

Permission handling and due-item filtering are covered in unit tests, but periodic product checks run inside the WebView process. A mobile OS can suspend that process in the background.

For the first mobile beta, document notifications as **best effort while/after the app runs** unless device testing proves the desired delivery semantics. Reliable background delivery would require a platform-specific scheduling/push design rather than assuming JavaScript timers continue while suspended.

### Backup / import / sharing

- Automatic backups remain app-private on mobile.
- Portable backup export uses the native share sheet on mobile.
- Folder selection stays desktop-only because Tauri mobile does not support a folder picker.
- Wrapped/recap/milestone images already use the mobile ShareKit path.
- Restore and undo remain destructive-confirmation flows.

**Launch gate:** Files/Drive/iCloud/Downloads round-trip tests on iOS, including cancel paths and a large valid backup.

### Responsive/mobile shell

The prior visual audit already covers the responsive shells at narrow widths. This pass additionally found and fixed fixed-layer/safe-area issues and converted full-screen states to dynamic viewport height.

**Launch gate:** notch/home-indicator devices, landscape, keyboard-open auth/search forms and font-size/accessibility scaling.

## Improvements intentionally not hidden behind a green CI

A green web/Rust/iOS-simulator CI does not prove:

1. free-signing installation on a physical iPhone;
2. physical-device Personal Team signing on a developer Mac;
3. OAuth return from Safari/Chrome into the installed app;
4. notification behavior while the app is suspended;
5. native share/file-provider behavior;
6. store signing, metadata or privacy declarations.

Those items stay explicit in `docs/mobile-release.md` rather than being marked done by configuration alone.

## Recommended release sequence

1. Merge CI/security repair.
2. Merge mobile functional-readiness fixes and let the full suite pass.
3. Merge mobile launch-prep configuration/docs.
4. Run the iOS Simulator checklist.
5. Run Personal Team physical-device QA if a device is available.
6. 7. Enroll in Apple Developer Program only when TestFlight/App Store distribution is desired; then run TestFlight before public iOS release.
