# Release signing

`.github/workflows/release.yml` builds unsigned Linux/Windows/macOS installers on every manual run or `v*` tag push. A manual run (Actions tab → Release build → Run workflow) only uploads them as workflow artifacts. A `v*` tag push additionally publishes them to a **draft** GitHub Release attached to that tag — draft on purpose, so nothing goes out until you review it and click "Publish release" yourself (see "Publishing a release" below). It reads the signing secrets below via `${{ secrets.* }}`; none exist yet, so the Tauri CLI silently skips signing and notarization. Add a secret under **Settings → Secrets and variables → Actions → Repository secrets** and the corresponding step starts signing automatically — no workflow changes needed.

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

## Auto-updater signature (not needed yet)

CineTrack's update channel isn't configured yet (see `desktop.updateChannelNotConfigured` in the i18n locales — no endpoint/public key in `tauri.conf.json`'s `plugins.updater`). Once it is, generate a keypair with `pnpm tauri signer generate` and add:

| Secret                               | Value                              |
| ------------------------------------ | ---------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | The generated private key          |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password chosen when generating it |

Full details: [Tauri — macOS code signing](https://v2.tauri.app/distribute/sign/macos/), [Tauri — Windows code signing](https://v2.tauri.app/distribute/sign/windows/).

## Publishing a release

1. Push a tag matching `v*` (e.g. `git tag v0.4.0 && git push origin v0.4.0`).
2. Wait for all 3 matrix jobs (Linux/Windows/macOS) to finish — each uploads its own installer to the same draft release.
3. Open the **Releases** page, check the attached installers and the auto-generated notes, edit the notes if needed.
4. Click **Publish release** once you're satisfied. Nothing is public before this step.

## Rollback strategy

A published release is a tag plus a set of attached binaries — nothing about publishing it touches user data or forces an upgrade (there's no auto-update channel wired up yet, see below), so "rollback" here means undoing the _release_, not reverting anything already installed on a user's machine.

- **The release turns out to be broken before anyone has downloaded it (or you just want it back to draft):** on the Releases page, edit the release and re-check "Set as a draft", or delete it outright (`gh release delete vX.Y.Z`). The tag itself can stay — re-running the workflow against the same tag (re-push it, or re-run the workflow from a later commit against a new tag) produces a fresh draft to replace it.
- **Users have already downloaded the broken release:** don't delete it — pull it from being the _latest_ release instead (`gh release edit vX.Y.Z --latest=false`, and mark the previous good one `--latest=true`) so new visitors to the Releases page land on the last good version, while the broken one stays visible with a note added to its description explaining the issue and pointing at the fixed version. Deleting a release users already have installed removes their ability to see what they're running or re-download it if they need to reinstall.
- **Ship the actual fix:** cut a new patch tag (`vX.Y.Z+1`) through the same workflow rather than force-pushing or reusing the broken tag — tags are meant to be immutable pointers to what was actually built and shipped; reusing one after the fact makes "what does tag vX.Y.Z contain" an unanswerable question for anyone who already has it.
- **Once the auto-updater is configured** (see above — not yet the case): the same rule applies one level up. `latest.json` (what the updater polls) should only ever point at the last release marked `--latest=true`, so pulling `--latest` from a broken release also stops it from being offered as an update to existing installs, without needing anything updater-specific.
