# Releases and signing

`.github/workflows/release.yml` takes a merged commit all the way to a published GitHub Release, with no manual step except merging one pull request.

## How a release happens

1. Commits reach `main` as [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `perf:` count toward the version and the changelog; `docs:`, `test:`, `ci:`, `chore:`, `build:` and `refactor:` do not appear in it).
2. [release-please](https://github.com/googleapis/release-please) keeps one pull request up to date, "chore(main): release X.Y.Z": the version bumped in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` and `src-tauri/tauri.conf.json`, and `CHANGELOG.md` written. Before 1.0, a `feat` raises the minor version and a `fix` the patch. release-please itself only edits `package.json` and the changelog: a follow-up step of the same job copies the version into the other three files (`scripts/sync-release-version.mjs`, one text replacement each, so `tauri.conf.json` keeps its formatting), and `pnpm version:check` fails if any of the four disagree.
3. **Merging that pull request is the release.** release-please creates the tag's draft release (with the changelog as its notes); the workflow then waits for the `ci-ok` and `visual-regression` checks of that exact commit, builds the Linux, Windows and macOS (universal) installers, attaches them with a `SHA256SUMS` file and a build-provenance attestation, and publishes the release.
4. Anything that fails before the last step leaves a **draft** — nothing is public until every step passed. Fix the cause and run the workflow again with `tag` set to the version (tick `publish` to publish when it finishes).

A tag with a suffix (`v0.5.0-rc.1`) is published as a pre-release and never becomes "latest".

## Doing it by hand

From the Actions tab, Release → Run workflow:

| Input        | Effect                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `release-as` | Open (or refresh) the release pull request for exactly this version (`1.0.0`, `0.5.0-rc.1`) instead of the computed one.  |
| `tag`        | Rebuild an existing tag. With `publish` ticked the release is published at the end; otherwise it stays a draft to review. |
| `test-build` | Build the installers as downloadable workflow artifacts only; no release is touched. Safe to run freely.                  |

Pushing a `v*` tag by hand also works: it builds a draft release to review and publish yourself.

## One-time setup

- **A GitHub App for the release pull request** (recommended). A pull request opened with the default `GITHUB_TOKEN` does not trigger the CI, so the release pull request would show no checks. Create a GitHub App with _Contents_ and _Pull requests_ read-and-write, install it on this repository, then add the repository **variable** `RELEASE_APP_CLIENT_ID` and the **secret** `RELEASE_APP_PRIVATE_KEY`. The workflow uses the App's token as soon as the variable exists. Without it the release still works, but its pull request has to be merged by someone allowed to bypass the required checks.
- **Branch protection on `main`**, requiring `ci-ok` and `visual-regression` (see `docs/ci.md`).
- **Code signing** (below): optional, without it installers are unsigned and flagged by Gatekeeper and SmartScreen.

## macOS: code signing

| Secret                       | Value                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `APPLE_CERTIFICATE`          | Base64 of your Developer ID Application `.p12` export (`base64 -i cert.p12 \| pbcopy`) |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12`                                                |
| `APPLE_SIGNING_IDENTITY`     | The certificate's name, e.g. `Developer ID Application: Your Name (TEAMID)`            |

## macOS: notarization (requires signing above)

| Secret           | Value                                                            |
| ---------------- | ---------------------------------------------------------------- |
| `APPLE_ID`       | Apple account email                                              |
| `APPLE_PASSWORD` | App-specific password for that Apple ID (not your main password) |
| `APPLE_TEAM_ID`  | Team ID from your Apple Developer account membership page        |

## Windows: code signing

| Secret                         | Value                                    |
| ------------------------------ | ---------------------------------------- |
| `WINDOWS_CERTIFICATE`          | Base64 of your OV/EV code-signing `.pfx` |
| `WINDOWS_CERTIFICATE_PASSWORD` | Export password for the `.pfx`           |

## Auto-updater

The in-app update check is configured: `src-tauri/tauri.conf.json` carries the updater's **public** key and the endpoint `https://github.com/Arrows78/cinetrack/releases/latest/download/latest.json`, and `bundle.createUpdaterArtifacts` makes every build produce signed update bundles. The release workflow signs them with the repository secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` and attaches `latest.json` to the release, so each published release is offered to installed copies by their next update check.

This signature is the updater's own, independent of the operating system's code signing above: an unsigned installer still updates itself, it just keeps the first-install warning.

- **The private key is irreplaceable.** Keep `cinetrack-updater.key` and its password in a password manager. If they are lost, installed copies can never verify another update: a new keypair means every user reinstalls by hand.
- **Changing the key** means putting the new public key in `tauri.conf.json` and the new private key in the two secrets, and shipping one release signed with the **old** key that carries the new public key, before switching.
- **Nothing is offered until the first release made after this configuration** (earlier installs have no updater to ask).

Full details: [Tauri — macOS code signing](https://v2.tauri.app/distribute/sign/macos/), [Tauri — Windows code signing](https://v2.tauri.app/distribute/sign/windows/).

## Rollback strategy

A published release is a tag plus a set of attached binaries — nothing about publishing it touches user data or forces an upgrade (there's no auto-update channel wired up yet, see below), so "rollback" here means undoing the _release_, not reverting anything already installed on a user's machine.

- **The release turns out to be broken before anyone has downloaded it (or you just want it back to draft):** on the Releases page, edit the release and re-check "Set as a draft", or delete it outright (`gh release delete vX.Y.Z`). The tag itself can stay — re-running the workflow against the same tag (re-push it, or re-run the workflow from a later commit against a new tag) produces a fresh draft to replace it.
- **Users have already downloaded the broken release:** don't delete it — pull it from being the _latest_ release instead (`gh release edit vX.Y.Z --latest=false`, and mark the previous good one `--latest=true`) so new visitors to the Releases page land on the last good version, while the broken one stays visible with a note added to its description explaining the issue and pointing at the fixed version. Deleting a release users already have installed removes their ability to see what they're running or re-download it if they need to reinstall.
- **Ship the actual fix:** cut a new patch tag (`vX.Y.Z+1`) through the same workflow rather than force-pushing or reusing the broken tag — tags are meant to be immutable pointers to what was actually built and shipped; reusing one after the fact makes "what does tag vX.Y.Z contain" an unanswerable question for anyone who already has it.
- **Once the auto-updater is configured** (see above — not yet the case): the same rule applies one level up. `latest.json` (what the updater polls) should only ever point at the last release marked `--latest=true`, so pulling `--latest` from a broken release also stops it from being offered as an update to existing installs, without needing anything updater-specific.
