# 🎬 CineTrack

**A local-first desktop application for discovering, organising, and tracking films and TV series.**

[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

CineTrack is a local-first desktop application built with **Tauri**, **React**, **TypeScript**, and **SQLite**. It uses the [TMDB](https://www.themoviedb.org/) catalogue to explore films and TV series while keeping your library, viewing progress, and activity history on your device.

> [!NOTE]
> The interface is available in English and French, with the internationalisation architecture in place for adding more languages.

## ✨ Features

### Discover

- Browse popular, top-rated, currently airing, and upcoming films and TV series.
- Explore the catalogue by genre and streaming provider, or get a random pick with "Watch tonight".
- Search films and TV series together, with filters by media type.
- View detailed media pages with synopses, cast members, genres, status, trailers, recommendations, and streaming availability by region.

### Organise

- Add films and TV series to your library (planned/watching/paused/completed/dropped) or custom lists.
- Filter and sort your library by media type, status, date, title, or rating.
- Mark films as watched or unwatched, rate and tag titles, and mark favourites.
- Review recent actions in a local activity timeline.
- Manage multiple profiles, each with its own library and history — switch, create, or remove local-only profiles freely offline; with optional Supabase sign-in configured (see "Personalise" below), a profile can also be linked to an account so it's only reachable by that account.
- Import a TV Time GDPR export (watched episodes and movies with their original dates, plus the to-watch list) as a one-time bulk migration.

### Track TV series

- Mark individual episodes as watched or unwatched.
- Mark an entire season or series at once.
- View overall and season-by-season progress.
- Quickly resume series already in progress from the home page.
- Get notified when a release date or new episode is coming up via the calendar, and set streaming-availability alerts.

### Personalise

- Switch between light and dark themes and several accent colours.
- Enable compact mode or reduced motion.
- Set a default filter for search.
- Sign in with Supabase (email OTP or social OAuth) when optional sign-in is configured; the app otherwise works fully offline with a local-only profile.
- Review viewing statistics and a yearly "wrapped" summary.

## 🧱 Technology stack

| Area                   | Technologies                                                           |
| ---------------------- | ---------------------------------------------------------------------- |
| Desktop application    | Tauri 2, Rust                                                          |
| Frontend               | React 19, TypeScript, Vite                                             |
| Styling and components | Tailwind CSS, Radix UI, local components inspired by shadcn/ui         |
| Routing                | TanStack Router                                                        |
| Remote data            | TanStack Query, TMDB API                                               |
| Optional sign-in       | Supabase Auth (email OTP, OAuth)                                       |
| Desktop persistence    | SQLite via Rust (`sqlx`) behind Tauri commands, Stronghold for secrets |
| UI state               | Zustand                                                                |
| Validation             | Zod                                                                    |
| Internationalisation   | i18next, react-i18next (English, French)                               |
| Animation and icons    | Framer Motion, Lucide React                                            |
| Testing                | Vitest, Testing Library, `cargo test`                                  |

## 🏗️ Architecture

The remote catalogue and personal data are deliberately kept separate:

```mermaid
flowchart LR
    UI[React UI] --> Q[TanStack Query]
    Q --> MP[MediaProvider]
    MP --> TMDB[TMDB API]

    UI --> LR[Local repositories]
    LR --> IPC[Tauri invoke]
    IPC --> CMD[Rust commands]
    CMD --> DB[(SQLite app.db)]
```

- `MediaProvider` abstracts catalogue access, making it possible to replace TMDB without coupling the interface to its API.
- Local repositories (one per domain: library, progress, history, preferences, profiles, collections, availability, stats, …) are thin `invoke()` wrappers; the actual SQL, transactions, and cascades live in Rust commands (`src-tauri/src/commands/`), all of it in SQLite (`sqlite:app.db`).
- SQLite is only reachable from inside the Tauri webview — a plain browser tab has no access to Tauri's IPC bridge, even when it's pointed at the same dev server `pnpm tauri dev` uses. Every local-data hook already tolerates a failed query (none use React Query's suspense mode), so the UI still renders outside Tauri for layout/styling work; reads/writes to SQLite just fail silently. A small non-blocking banner flags this, see [`src/components/desktop/browser-preview-banner.tsx`](src/components/desktop/browser-preview-banner.tsx).

See [`docs/architecture.md`](docs/architecture.md) for the full request-to-database walkthrough (the Rust command → repository → hook → page shape every domain follows), the error-handling contract, and how to add a new feature domain. See [`docs/design-system.md`](docs/design-system.md) for UI tokens and component rules, and [`docs/auth.md`](docs/auth.md) for the optional Supabase account-sync setup.

## 📦 Prerequisites

Before getting started, install:

- [Node.js](https://nodejs.org/) and Corepack;
- [pnpm](https://pnpm.io/) — the project specifies `pnpm@10.6.5`;
- the [Rust](https://www.rust-lang.org/tools/install) toolchain;
- the [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform;
- a TMDB account and an **API Read Access Token**.

Check that your environment is ready:

```bash
node --version
pnpm --version
rustc --version
cargo --version
```

## 🚀 Installation

### 1. Clone the repository

```bash
git clone https://github.com/Arrows78/cinetrack.git
cd cinetrack
```

### 2. Install dependencies

```bash
corepack enable
pnpm install
```

### 3. Configure TMDB

Copy the example environment file:

```bash
cp .env.example .env
```

Then add your token to `.env`:

```dotenv
VITE_TMDB_API_TOKEN=your_tmdb_bearer_token_here
```

The application expects the TMDB **API Read Access Token**, which is sent as a Bearer token to the TMDB API.

> **Security note:** `VITE_TMDB_API_TOKEN` is inlined by Vite into the frontend bundle at build time. Keep it set in `.env` only for local/web development. Never set it when producing a desktop bundle for distribution (`pnpm tauri build`) — a value present at that time would ship in cleartext inside the built binary, bypassing the Stronghold vault. Distributed builds should rely solely on the in-app token vault (Settings → TMDB) or leave the variable unset.

### 4. (Optional) Configure Supabase sign-in

CineTrack works fully offline with `VITE_AUTH_REQUIRED=false` (the default). To enable account sign-in (email OTP or social OAuth), follow [`docs/auth.md`](docs/auth.md) for the full Supabase project setup, redirect URLs, and provider configuration.

### 5. Start the desktop application

```bash
pnpm tauri dev
```

This command starts the Vite server on port `1420`, initialises the SQLite database, and opens the Tauri window.

## 🌐 About `pnpm dev`

`pnpm dev` (used internally by `pnpm tauri dev` to serve the frontend, and also runnable on its own) starts the same Vite server on `http://localhost:1420` — but CineTrack's only persistence layer is SQLite, reachable exclusively from inside the Tauri webview. A plain browser tab has no access to Tauri's IPC bridge, even when it's pointed at that same URL while `pnpm tauri dev` is running.

> [!NOTE]
> Opening `http://localhost:1420` outside the Tauri window — `pnpm dev` on its own, or a regular browser tab while `pnpm tauri dev` runs — still renders the full UI (useful for quick layout/styling iteration), with a small banner flagging that SQLite reads/writes won't work. Use the Tauri window (`pnpm tauri dev`) or the installed desktop application whenever you need real data.

## 🛠️ Scripts

| Command                   | Description                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                | Starts the Vite development server.                                                                                       |
| `pnpm build`              | Checks TypeScript types and creates the frontend production build.                                                        |
| `pnpm preview`            | Serves the Vite production build locally.                                                                                 |
| `pnpm lint`               | Analyses the project with ESLint.                                                                                         |
| `pnpm lint:fix`           | Analyses the project with ESLint and applies automatic fixes.                                                             |
| `pnpm format`             | Formats files with Prettier.                                                                                              |
| `pnpm format:check`       | Checks formatting without writing changes (what CI runs).                                                                 |
| `pnpm test`               | Runs the Vitest test suite.                                                                                               |
| `pnpm test:watch`         | Runs the Vitest test suite in watch mode.                                                                                 |
| `pnpm test:coverage`      | Runs the test suite with a coverage report.                                                                               |
| `pnpm typecheck`          | Checks TypeScript types without emitting output.                                                                          |
| `pnpm cargo:check`        | Runs `cargo check` on the Rust side.                                                                                      |
| `pnpm cargo:clippy`       | Runs `cargo clippy --all-targets -- -D warnings` on the Rust side.                                                        |
| `pnpm cargo:clippy:fix`   | Runs `cargo clippy` on the Rust side and applies automatic fixes.                                                         |
| `pnpm cargo:format`       | Formats the Rust side with `rustfmt`.                                                                                     |
| `pnpm cargo:format:check` | Checks Rust formatting without writing changes (what CI runs).                                                            |
| `pnpm cargo:test`         | Runs `cargo test` on the Rust side.                                                                                       |
| `pnpm cargo:coverage`     | Runs `cargo llvm-cov --branch` for per-file Rust coverage (needs a `nightly` toolchain — see `CLAUDE.md`; not run in CI). |
| `pnpm validate:frontend`  | Runs `lint`, `format:check`, `typecheck`, `test:coverage`, and `build`.                                                   |
| `pnpm validate:backend`   | Runs `cargo:check`, `cargo:clippy`, `cargo:format:check`, and `cargo:test`.                                               |
| `pnpm validate`           | Runs `validate:frontend` then `validate:backend` — the full chain, and the same checks CI runs.                           |
| `pnpm tauri dev`          | Starts the desktop application in development mode.                                                                       |
| `pnpm tauri build`        | Creates desktop bundles for the current platform.                                                                         |

For the Rust side, use `pnpm cargo:check`, `pnpm cargo:clippy`, `pnpm cargo:format:check`, and `pnpm cargo:test` (all four also run in CI).

Generated Tauri bundles are written to `src-tauri/target/release/bundle/`.

## 📂 Project structure

```text
cinetrack/
├── src/
│   ├── app/                    # Application setup, router, and QueryClient
│   ├── components/             # Presentational UI: layout, media, ui/, states/, settings, collections, desktop, library
│   ├── db/                     # Migration schema + real-SQLite test harness (production reads/writes go through src-tauri/src/commands, not this)
│   ├── features/                # One folder per domain, each bundling its repository/service with the hooks that use it
│   │   ├── auth/                #   Supabase session, OAuth, email OTP
│   │   ├── availability/        #   Streaming-availability alerts and background monitor
│   │   ├── backup/              #   Portable JSON export/import, automatic backups
│   │   ├── calendar/            #   Release and episode calendar
│   │   ├── collections/         #   Profiles and custom lists
│   │   ├── desktop/             #   Tray/deep-link wiring, updater, notifications, TMDB token vault
│   │   ├── diagnostics/          #   In-app diagnostic logger
│   │   ├── history/              #   Local activity timeline
│   │   ├── library/              #   Unified watch status, ratings, tags
│   │   ├── media/                #   TMDB client + MediaProvider, search/discovery hooks, image cache
│   │   ├── preferences/          #   Theme, language, region, and other user settings
│   │   ├── progress/              #   Movie/episode watched state and series progress
│   │   ├── stats/                #   Viewing statistics and yearly wrap-up
│   │   ├── tvtime/                #   One-time bulk import from a TV Time export
│   │   └── watch-tonight/        #   Random pick service
│   ├── hooks/                   # Generic, repository-free hooks (debounce, confetti)
│   ├── i18n/                    # Internationalisation setup and translations
│   ├── pages/                   # Route components composed from feature hooks
│   ├── shared/                  # Configuration, constants, and utilities
│   ├── store/                   # Lightweight global state with Zustand
│   ├── styles/                  # Global styles and themes
│   └── types/                   # Domain models
├── src-tauri/
│   ├── capabilities/           # Tauri permissions
│   ├── src/
│   │   ├── commands/            # One file per domain: SQL, transactions, cascades, active-profile resolution
│   │   ├── database/             # Connection pool setup and the schema migrations (squashed initial schema + later fixes)
│   │   ├── error.rs               # ApiError, the structured error every command returns
│   │   ├── models.rs              # Shared types (MediaType, ...) used across commands
│   │   ├── tray.rs                # System tray icon and menu
│   │   ├── lib.rs                  # Plugin registration, command registration, app bootstrap
│   │   └── main.rs
│   ├── Cargo.toml              # Rust dependencies
│   └── tauri.conf.json         # Desktop configuration and bundle settings
├── .env.example
├── package.json
└── README.md
```

## 💾 Local persistence

CineTrack does not require a user account or an application server to save personal data.

The SQLite schema (a single migration, see `src/db/migrations/001-initial-schema.ts`) includes:

- `profiles`, `preferences`;
- `library_items`, `viewing_events`, `seen_movies`, `episode_progress`, `tracked_series`;
- `custom_lists`, `custom_list_items`;
- `availability_alerts`, `availability_snapshots`;
- `activity_log`.

Every table (other than `preferences`, keyed by `key`, and the pure-cache `availability_snapshots`, keyed by `(media_id, media_type, region)`) uses a single `uuid TEXT PRIMARY KEY` — generated app-side in Rust (`new_uuid()`, a UUIDv7), no separate internal integer id — plus `created_at`/`updated_at` timestamps. See [`docs/database-schema.md`](docs/database-schema.md) for the full table-by-table reference and ERD.

Catalogue data, posters, and metadata are loaded from TMDB, so they require an internet connection and a valid API token.

## 🗺️ Roadmap

CineTrack aims to become a **private, local-first home for movie and TV tracking**: accurate enough to become the source of truth for your viewing history, useful enough to open every day, and portable enough that your data never becomes locked in.

### Themes

| Theme          | Scope                                              |
| -------------- | -------------------------------------------------- |
| `TRACKING`     | Diary, watch dates, rewatches and episode progress |
| `LIBRARY`      | Lists, filters and personal organisation           |
| `DISCOVERY`    | Recommendations and Watch Tonight                  |
| `STREAMING`    | Providers, availability and notifications          |
| `CALENDAR`     | Upcoming episodes, releases and scheduling         |
| `DATA`         | Imports, exports and portability                   |
| `INSIGHTS`     | Stats, recaps and viewing memories                 |
| `UX`           | Onboarding, desktop experience and personalisation |
| `INTEGRATIONS` | External media services and automatic tracking     |
| `SYNC`         | Optional multi-device functionality                |
| `SOCIAL`       | Sharing, profiles and community                    |


### 🟠 P1 — Core experience

P1 should make CineTrack better at answering: **What can I watch now? What should I watch next? What am I waiting for?**

#### Series tracking

* [ ] **`TRACKING` — Add historical watch-date backfilling.**
  When marking an older movie or episode as watched, offer **Watched now** and **Choose date**. For seasons, allow users to assign historical dates efficiently instead of opening every episode individually.

* [ ] **`TRACKING` — Add an explicit “Up to date” state for TV shows.**
  Separate shows with an available unwatched episode from shows where every currently aired episode has been watched. Show the latter under **Up to date**, with the next known air date when available.

* [ ] **`TRACKING` — Show watched date next to episode air date.**
  Build on the existing air-date display with information such as **Aired Mar 12 · Watched Mar 26 · 14 days later** to make catch-up gaps visible.

* [ ] **`TRACKING` — Improve bulk season history editing.**
  When marking a full season watched, allow choosing how dates are assigned: **Today**, **One selected date**, or individual dates afterwards. Keep episode-level corrections possible.

#### Streaming services

* [ ] **`STREAMING` — Add profile-level “My streaming services”.**
  Let each profile declare which services it subscribes to in Settings — Netflix, Prime Video, Disney+, Max, Apple TV+, etc. Use these preferences to prioritise **Watch Tonight**, Discover and **Where to watch** based on what is actually accessible to that profile.

* [ ] **`STREAMING` — Add a provider-aware availability alert editor.**
  When enabling an availability alert, allow **Any streaming service**, **My streaming services**, or a custom selection of providers. Let users override the default on a per-title basis.

* [ ] **`STREAMING` — Expose notification lead time in Settings.**
  Surface the existing lead-time capability with presets such as **At release**, **1 hour before**, **1 day before**, and **3 days before**.

#### Watch Tonight & recommendations

* [ ] **`DISCOVERY` — Add “Not interested” to Watch Tonight.**
  Let users dismiss a suggestion without adding it to their library first. The title should stop resurfacing for that profile, with an immediate **Undo** action after dismissal.

* [ ] **`DISCOVERY` — Add recommendation feedback.**
  Support signals such as **Already seen elsewhere**, **More like this**, and **Less like this**. Use this feedback alongside ratings, favourites, genres and viewing history to improve future recommendations.

* [ ] **`DISCOVERY` — Explain Watch Tonight recommendations.**
  Surface lightweight reasons such as **Because you liked Arrival**, **Matches your sci-fi favourites**, **Under 2 hours**, or **Available on Netflix**.

* [ ] **`DISCOVERY` — Add a “Surprise me from my library” mode.**
  Let Watch Tonight pick only from planned or unwatched titles already saved by the user, while keeping genre, runtime and streaming-service filters.

#### Data portability

* [ ] **`DATA` — Import Letterboxd history.**
  Import watched films, diary dates, ratings, tags and rewatches from Letterboxd CSV exports. Preserve separate diary entries instead of reducing everything to a watched flag.

* [ ] **`DATA` — Import Trakt history.**
  Import movie and episode history, ratings, watchlists and lists while preserving original watch dates and repeated watches.

* [ ] **`DATA` — Import IMDb data.**
  Support IMDb ratings and watchlist CSV exports as a lightweight migration path for users moving an existing collection into CineTrack.

* [ ] **`DATA` — Add portable CSV exports beyond the JSON backup.**
  Keep the complete JSON backup for CineTrack round-trips, but also provide plain CSV exports for **Library**, **Viewing history**, **Episodes**, **Ratings**, and **Lists**. The exported data should be readable in a spreadsheet and reusable by other applications.

#### Onboarding & desktop experience

* [ ] **`UX` — Add onboarding for the no-token path.**
  Now that local features work without a TMDB token, make this explicit during first run. Explain what works locally, what TMDB unlocks, and offer two clear actions: **Add a TMDB token now** and **Set it up later in Settings**.

* [ ] **`UX` — Add a “System” theme mode.**
  Add **System** alongside the existing Light and Dark modes and automatically follow operating-system appearance changes.

* [ ] **`UX` — Show app version and build information.**
  Display the CineTrack version and build number in Settings and make the information easy to copy for bug reports or diagnostics.

* [ ] **`UX` — Expose image-cache maintenance in Settings.**
  Show the current image-cache size and provide a **Clear image cache** action, including the amount of disk space that will be recovered.


### 🟡 P2 — Power features

P2 focuses on users with larger libraries and longer viewing histories, while making existing CineTrack data more useful.

#### Library & lists

* [ ] **`LIBRARY` — Add smart lists.**
  Create automatically updated lists from rules such as **Unwatched + Horror + under 100 min**, **My Services + rating ≥ 8**, or **Series with episodes waiting**.

* [ ] **`LIBRARY` — Add saved filters.**
  Save reusable views such as **Short movies on my services**, **Paused shows**, or **Favourite sci-fi** and reopen them in one click.

* [ ] **`LIBRARY` — Add removable active-filter chips.**
  Display active filters directly above filtered Library and Search results. Let users remove individual conditions without reopening the filter controls.

#### Discovery

* [ ] **`DISCOVERY` — Add franchise and collection progress.**
  For TMDB movie collections, show progress such as **3 / 8 watched** with watched, planned and missing entries. Add an action to **Add unwatched movies to library/list**.

* [ ] **`DISCOVERY` — Add people-based personal discovery.**
  Use viewing history to surface recommendations such as **Movies from directors you watch most**, **More with actors you like**, and similar personalised rails.

* [ ] **`DISCOVERY` — Add “Hide watched” to discovery surfaces.**
  Give users a persistent option to hide already watched titles from Discover and Watch Tonight when they specifically want something new.

#### Calendar

* [ ] **`CALENDAR` — Add relative release countdowns.**
  Display chips such as **Tomorrow**, **In 3 days**, or **In 2 weeks** alongside the exact release date in Calendar and Upcoming views.

* [ ] **`CALENDAR` — Add a weekly personal agenda.**
  Provide a compact **This week** view containing tracked movie releases, season premieres, upcoming episodes and relevant availability changes for the active profile.

#### Personal history & insights

* [ ] **`INSIGHTS` — Add “On this day”.**
  Add a small, opt-in Home surface showing what the user watched on the same date in previous years, for example **On August 21, 2023 you watched Oppenheimer**. Reuse existing viewing-history data rather than introducing a new tracking mechanism.

* [ ] **`INSIGHTS` — Add a dedicated monthly recap.**
  Build on existing statistics with a summary of movies watched, episodes watched, watch time, top-rated title, favourite genre and biggest binge for the month.

* [ ] **`INSIGHTS` — Expand rewatch analytics.**
  Build beyond the existing most-rewatched record with total rewatches, rewatch share, favourite comfort titles and rewatch activity over time.

* [ ] **`INSIGHTS` — Add director and actor statistics.**
  Show the directors and actors that appear most frequently across the user's viewing history.

* [ ] **`INSIGHTS` — Add rating distribution and evolution.**
  Show personal rating distribution, average rating by month/year and how rating behaviour evolves over time.

* [ ] **`INSIGHTS` — Add watch milestones.**
  Surface meaningful milestones such as **1,000 episodes watched**, **500 hours tracked**, **100 different directors**, or **50 completed series**.

* [ ] **`INSIGHTS` — Add shareable monthly and milestone cards.**
  Extend the existing Wrapped image-export system to monthly recaps and selected personal milestones without requiring a social account.

#### Desktop experience

* [ ] **`UX` — Add a keyboard-first Quick Log command.**
  Provide a shortcut or command palette to search a title and immediately **Mark watched**, **Log watch**, **Add to library**, or **Open next episode** without navigating through multiple pages.

* [ ] **`UX` — Add more translations.**
  Expand beyond English and French based on actual user and contributor demand.


### 🟢 P3 — Product bets

These are real strengths of competitors worth acknowledging, but they are deliberately lower priority.

Most require a durable online identity, backend infrastructure, moderation, or a larger shift away from CineTrack's current local-first model. They should only be pursued once the personal tracking experience is strong enough on its own.

#### Multi-device

* [ ] **`SYNC` — Add optional multi-device sync.**
  Sync library items, viewing events, episode progress, lists, ratings, notes and profile preferences while keeping the local SQLite database fully usable offline.

* [ ] **`SYNC` — Add visible conflict and sync-state management.**
  Show **Last synced**, pending local changes, sync errors and conflicts instead of silently treating local and remote state as identical.

#### Sharing

* [ ] **`SOCIAL` — Add shareable public lists.**
  Allow selected lists to generate an optional read-only public link without exposing the rest of the user's profile.

* [ ] **`SOCIAL` — Add opt-in public profiles.**
  Let users explicitly publish favourites, selected statistics, lists, diary activity and reviews while keeping local/private as the default.

* [ ] **`SOCIAL` — Add public reviews.**
  Extend personal reviews with an opt-in public mode, spoiler controls and links back to the associated watch entry.

#### Social layer

* [ ] **`SOCIAL` — Add following and followers.**
  Give online profiles a durable social graph that users can opt into.

* [ ] **`SOCIAL` — Add an activity feed.**
  Surface selected watches, ratings, reviews, completed shows and published lists from followed profiles.

* [ ] **`SOCIAL` — Add spoiler-safe episode discussions.**
  Allow comments at episode level while hiding discussion content until that episode has been marked watched.

* [ ] **`SOCIAL` — Add topic-based community groups.**
  Create opt-in communities around genres, franchises, shows or other interests, with discussions, recommendations and shared lists.

#### Community interactions

* [ ] **`SOCIAL` — Add action-based achievements and badges.**
  Reward meaningful behaviours rather than simple watch-count milestones, for example **Completed a 10-season series**, **Finished an entire franchise**, or **Watched a movie from 20 different countries**.

* [ ] **`SOCIAL` — Add per-episode emotional reactions.**
  Let users record a lightweight reaction such as ❤️, 😂, 😭, 😱 or 🤯 alongside the existing episode rating. If community features are enabled, optionally show aggregated reactions after the episode has been watched.

* [ ] **`SOCIAL` — Add character voting per episode.**
  After watching an episode, optionally answer **Who was your favourite character?** and compare the result with other viewers without revealing responses before the episode is marked watched.

## 🙌 Contributing

Issues and pull requests are welcome, whether you are fixing a bug, improving the documentation, or proposing a feature.

Before submitting a change, run:

```bash
pnpm validate
```

This chains lint, format:check, typecheck, test, build, and the Rust `cargo check`/`clippy`/`fmt:check`/`test` — the same checks CI runs.

## 🎞️ TMDB attribution

CineTrack uses data and images provided by TMDB.

> This product uses the TMDB API but is not endorsed or certified by TMDB.

Review the [TMDB documentation](https://developer.themoviedb.org/docs/getting-started) and [attribution requirements](https://developer.themoviedb.org/docs/faq) before publicly distributing or commercially using the application.

## 📄 License

MIT — see [LICENSE](LICENSE).
