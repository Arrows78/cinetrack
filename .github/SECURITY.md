# Security Policy

## Supported versions

CineTrack is pre-1.0 and does not yet have a formal release/versioning process. Security fixes target the latest commit on `main`; there is no long-term support for older versions.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, use [GitHub's private security advisory form](https://github.com/Arrows78/cinetrack/security/advisories/new) for this repository. You should get an initial response within a few days.

Please include:

- A description of the issue and its potential impact.
- Steps to reproduce (a minimal repro is very helpful).
- The platform (macOS/Windows/Linux desktop, or web preview) and CineTrack version.

## Scope and architecture notes

CineTrack is local-first: library, viewing progress, activity history, and preferences are stored on-device (SQLite in the desktop app). The browser preview is a development-only surface without the native SQLite backend; only its supported cache/preferences fallbacks use browser storage. There is no CineTrack server that holds user data.

Two things are worth knowing when assessing impact:

- The TMDB API token is stored via [Stronghold](https://tauri.app/plugin/stronghold/) in the desktop app, or in `localStorage` in the web preview build (the web preview is a development convenience, not a hardened deployment target).
- Account sign-in, when configured, is delegated entirely to [Supabase Auth](https://supabase.com/auth); CineTrack never sees or stores a password, and only uses the Supabase publishable (anon) key on the client. See [`docs/auth.md`](../docs/auth.md) for the auth architecture.

Reports about the TMDB or Supabase services themselves (rather than how CineTrack integrates with them) should go to those providers directly.
