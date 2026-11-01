# iOS launch preparation

CineTrack already shares its product code between desktop and iOS through Tauri. This document separates **development/testing readiness** from **TestFlight/App Store readiness**.

## Current iOS status

| Target | Status | Command |
| --- | --- | --- |
| iOS Simulator | Supported and CI-built without signing | `pnpm ios:init && pnpm ios:build:sim` |
| Personal iPhone/iPad | Development testing available with Xcode Personal Team | `pnpm ios:dev:open` |
| TestFlight / App Store | Blocked until Apple Developer Program enrollment | — |

The generated native project lives under `src-tauri/gen/` and remains gitignored. It is regenerated from the committed Tauri configuration.

## iOS without Apple Developer Program

A paid membership is not required for the iOS Simulator. A free Apple Account can also use Xcode's **Personal Team** to install development builds on personal devices.

Personal Team provisioning is temporary: profiles expire and development-device/App ID limits apply, so builds may need to be re-signed and reinstalled regularly.

It does **not** provide TestFlight or App Store Connect distribution. Public or internal TestFlight distribution therefore remains a launch gate until the project joins the Apple Developer Program.

### Simulator

```bash
pnpm ios:init
pnpm ios:build:sim
pnpm ios:dev
```

Open the generated Xcode project when native diagnostics or signing settings are needed:

```bash
pnpm ios:dev:open
```

### Personal iPhone/iPad

1. Connect the device to the Mac and trust the computer.
2. Run `pnpm ios:dev:open`.
3. In Xcode, select the CineTrack target and choose your Apple Account's **Personal Team** under Signing & Capabilities.
4. Select the connected device and run.
5. For CLI development on a physical device, use Tauri's `--host` option. `vite.config.ts` already binds HMR to `TAURI_DEV_HOST` when Tauri provides it.

Do not add distribution-only entitlements merely to make a free-signing development build work. The current iOS feature set uses custom deep links, local notifications, local storage/Stronghold, file sharing and network access; it does not currently depend on APNs push entitlements.

## Required iOS QA before calling the mobile beta ready

Run this list on at least one recent iPhone Simulator and, when available, one physical iPhone:

- cold launch and warm resume;
- first-run onboarding and profile creation;
- TMDB token save, vault lock/unlock, then catalogue search;
- email-code sign-in;
- every enabled OAuth provider, including return through `cinetrack://auth/callback`;
- create/switch/PIN-lock local profiles;
- add/remove films and series, episode progress, ratings, notes and lists;
- kill and restart the app, then verify persistence;
- background/foreground with cloud sync enabled and verify missed changes recover on resume;
- notification permission, calendar reminder and availability-alert delivery;
- offline launch and recovery after connectivity returns;
- backup export through the native share sheet, backup import, restore and undo;
- Wrapped/recap/milestone native image sharing;
- safe areas at the notch/Dynamic Island/home indicator and landscape rotation;
- software keyboard on auth/search/forms: focused controls must remain visible;
- external links and OAuth browser hand-off;
- reduced-motion, dark/light theme and French text at narrow widths.

## Distribution gates

Before TestFlight/App Store:

- enroll in the Apple Developer Program;
- configure the distribution team, certificates and provisioning;
- validate the final bundle identifier and signing;
- prepare privacy details, screenshots, metadata and support/privacy URLs;
- archive and upload a signed build to App Store Connect;
- run TestFlight on real devices before production review.

## Important notification limitation

The current periodic checks are reliable while CineTrack is running and are refreshed when the app returns to the foreground. That is not the same as guaranteed iOS background scheduling. If reminders must arrive while the app remains suspended or terminated, that requires a native scheduling or push-notification design.

## Official references

- Tauri CLI: https://tauri.app/reference/cli/
- Tauri mobile development: https://v2.tauri.app/develop/
- Apple developer account basics: https://developer.apple.com/help/account/basics/about-your-developer-account
- Apple programs overview: https://developer.apple.com/help/account/membership/programs-overview
