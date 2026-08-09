# Release signing

`.github/workflows/release.yml` builds unsigned Linux/Windows/macOS installers on every manual run or `v*` tag push, and uploads them as workflow artifacts (it never creates a GitHub Release). It reads the secrets below via `${{ secrets.* }}`; none exist yet, so the Tauri CLI silently skips signing and notarization. Add a secret under **Settings → Secrets and variables → Actions → Repository secrets** and the corresponding step starts signing automatically — no workflow changes needed.

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
