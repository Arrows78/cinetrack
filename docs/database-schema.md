# CineTrack — database schema

The database is local SQLite, embedded in the app via Tauri — no server, everything lives on the machine. It's designed to be **multi-profile** from the start: almost every table carries a `profile_id` that isolates one profile's data from the others, with `FOREIGN KEY … ON DELETE CASCADE` constraints guaranteeing no row survives the deletion of its profile or its list. A profile is only _optionally_ linked to a Clerk account: fully offline (the default, `VITE_AUTH_REQUIRED=false`), a user can create, switch between, and remove as many local-only profiles as they want with no account involved at all (`src/pages/settings-page.tsx` — the standalone Collections page was retired into Library and Settings). Linking only comes into play once Clerk sign-in is required — see below.

Every table's primary key is a `uuid TEXT PRIMARY KEY`, generated app-side in Rust (`new_uuid()`, a UUIDv7, in [`src-tauri/src/database/mod.rs`](../src-tauri/src/database/mod.rs)) — there is no separate internal integer id. Two tables deliberately don't follow this: `preferences` (`key` is already a stable natural primary key) and `availability_snapshots` (a pure cache keyed by `(media_id, media_type, region)`, with no row ever referenced individually).

**18 active tables · 16 migrations · 1 database file per machine.**

The canonical DDL is SQL, under [`src-tauri/src/database/migrations/`](../src-tauri/src/database/migrations/) — `001-initial-schema.sql` plus sixteen follow-ups: `009-availability-alerts-unique.sql`, `010-merge-watchlist-into-library.sql`, `011-add-status-to-tracked-series.sql`, `012-remove-rewatching-status.sql`, `013-add-note-to-viewing-events.sql`, `014-add-smart-lists.sql`, `015-add-saved-filters.sql`, `016-index-large-library-stats.sql`, `017-library-cursor-pagination-indexes.sql`, `018-add-sync-outbox.sql`, `019-add-rating-to-episode-progress.sql`, `020-add-dismissed-recommendations.sql`, `021-sync-activity-log-and-episode-rating.sql`, `022-split-notification-preferences.sql`, `023-add-profile-pin.sql`, `024-add-library-status-origin.sql` (versions jump from 1 to 9 because an earlier 8-step pre-launch sequence was squashed into version 1 — see the comment in `src/db/migrations/index.ts`). The frontend imports these same files via `src/db/migrations/index.ts`/`canonical.ts` — there's no separate hand-written TS migration set to drift from the Rust side. This document is a readable companion to those files, not a replacement for them.
The canonical DDL is SQL, under [`src-tauri/src/database/migrations/`](../src-tauri/src/database/migrations/) — `001-initial-schema.sql` plus sixteen follow-ups: `009-availability-alerts-unique.sql`, `010-merge-watchlist-into-library.sql`, `011-add-status-to-tracked-series.sql`, `012-remove-rewatching-status.sql`, `013-add-note-to-viewing-events.sql`, `014-add-smart-lists.sql`, `015-add-saved-filters.sql`, `016-index-large-library-stats.sql`, `017-library-cursor-pagination-indexes.sql`, `018-add-sync-outbox.sql`, `019-add-rating-to-episode-progress.sql`, `020-add-dismissed-recommendations.sql`, `021-sync-activity-log-and-episode-rating.sql`, `022-split-notification-preferences.sql`, `023-add-profile-pin.sql`, `024-add-insert-seq-to-viewing-events.sql` (versions jump from 1 to 9 because an earlier 8-step pre-launch sequence was squashed into version 1 — see the comment in `src/db/migrations/index.ts`). The frontend imports these same files via `src/db/migrations/index.ts`/`canonical.ts` — there's no separate hand-written TS migration set to drift from the Rust side. This document is a readable companion to those files, not a replacement for them.

`supabase/migrations/` is a **separate** schema, in a separate Postgres database on Supabase, applied with `supabase db push` rather than by this app's own migration runner — it's the cloud-sync/community counterpart described in "Cloud sync" below, not part of the local SQLite file this document otherwise covers.

## Profiles & preferences

The foundation for everything else: each profile has its own library, history, and lists. Preferences, on the other hand, deliberately do **not** follow this split.

### `profiles`

A profile = a person using the app. **Every** table below attaches to it via `profile_id` (which points to `profiles.uuid`). The `'default'` profile is created automatically by the migration and can never be deleted. Fully offline, profiles are unlinked and freely switchable — see above. Once Clerk sign-in is required, a profile must be **linked to a Clerk account** to be accessible: the first account that signs in automatically claims `'default'` (and its existing data), any following account must create its own profile. This is enforced by the Rust command layer itself, not just the app's `ProfileGate` (`src/features/auth/profile-gate.tsx`): `set_active_profile` (`src-tauri/src/preferences/service.rs`) checks the target profile's `supabase_user_id` against the caller-supplied id before switching, and `update_preference` refuses to change `activeProfileId` through any other path. The column name stays `supabase_user_id`; the value is the Clerk `sub` (`user_xxx`). This isn't cryptographic verification of that id (it's an unsigned string over the same `invoke()` boundary as everything else), but it closes the gap where switching used to be a bare, unchecked preference write — see the "Authorization belongs in the Rust command" rule in `CLAUDE.md`.

| Column                     | Type | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uuid` **PK**              | TEXT | `'default'` or a generated UUID — this is what the app calls `.id`                                                                                                                                                                                                                                                                                                                                                                                |
| `name`                     | TEXT | displayed name                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `avatar`                   | TEXT | optional                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `supabase_user_id` **UK**  | TEXT | optional, unique — Clerk `sub` of the linked account (column name kept); no FK possible, Clerk users live outside this SQLite file                                                                                                                                                                                                                                                                                                                |
| `pin_hash`, `pin_salt`     | TEXT | optional PIN lock, both null when unset — `pin_hash` is a sha256 hex digest of `pin_salt` + the PIN, never the raw PIN; never sent to the frontend (`UserProfile` only exposes a derived `has_pin` boolean). Enforced in Rust, not only by the UI prompt: switching into, editing, deleting, or changing the PIN of a PIN-protected profile other than the active one needs that PIN (`authorize_pin_protected_access`, `profiles/repository.rs`) |
| `created_at`, `updated_at` | TEXT | ISO dates                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Relations: a profile has `0..n` rows in every table below. No dedicated index (the table is tiny and always scanned by `uuid`).

**PIN and backup restore.** A backup export never carries a PIN (hash and salt are device secrets). `import_impl` (`backup/repository.rs`) replaces every profile, but inside the same transaction it first reads the PIN of each profile that exists before the restore and puts it back on the profile with the same `uuid` after re-inserting it. So a restore on the **same device** — including "undo the last restore", which restores `pre-restore.json` through the same path — keeps the PIN of every profile present both before and in the backup; a profile **absent from the database before the restore** (a backup from another device) arrives without a PIN, and a locked profile that the backup lacks disappears along with its PIN, like any other profile data.

### `preferences`

Application settings: theme, accent color, language, TMDB region, spoiler protection, notifications (`notificationsEnabled` for calendar reminders, plus `availabilityAlertsEnabled` and `desktopNotificationsEnabled` split out by migration 22), availability check frequency (`availabilityCheckIntervalHours`), automatic-backup frequency (`backupFrequency`), keyboard shortcuts (`commandPaletteShortcut`, `globalCommandPaletteShortcut`), onboarding/tour flags, recent searches, and `activeProfileId` — the currently selected profile. This is a **global** table, shared by every profile: they share the same app, not the same per-profile preferences.

| Column       | Type | Notes                           |
| ------------ | ---- | ------------------------------- |
| `key` **PK** | TEXT | e.g. `theme`, `activeProfileId` |
| `value`      | TEXT | value encoded as JSON           |
| `updated_at` | TEXT | ISO date                        |

No declared relation — table intentionally independent from profiles. No `uuid`: `key` is already a stable natural key, and nothing references an individual preference row.

Only some keys leave this device at all. `ACCOUNT_SCOPE_PREFERENCE_KEYS` (`src-tauri/src/preferences/models.rs`) — currently `language`, `region`, `preferredProviderIds`, `spoilerProtection`, `hideWatchedInDiscovery`, `accentColor`, `onThisDayEnabled` — are the only rows cloud sync ever queues; the rest (`theme`, `compactMode`, `sidebarCollapsed`, the notification and availability-check keys, `notifyHoursBefore`, `backupDirectory`, `backupFrequency`, the shortcut keys, `activeProfileId`, ...) describe this specific installation and stay local. See "Cloud sync" below.

## Library & progress

The functional core of the app. Three ideas deliberately coexist: a current _state_ (`library_items`, `status`), an immutable _event log_ (`viewing_events`, used for statistics), and lighter tables that are faster to query for day-to-day interactive use (seen/unseen, episode progress, tracked shows).

### `library_items`

The full record of a movie or show in a profile's library: its **status** (`planned`, `watching`, `paused`, `completed`, `dropped`), the personal rating, free-form notes, tags, start/end dates, and the rewatch count.

| Column                                        | Type      | Notes                                                                   |
| --------------------------------------------- | --------- | ----------------------------------------------------------------------- |
| `uuid` **PK**                                 | TEXT      | public identifier of the row                                            |
| `profile_id` `FK`                             | TEXT      | → `profiles.uuid`                                                       |
| `media_id`, `media_type` **UK**               | INT, TEXT | TMDB id + `movie`/`series` — `UNIQUE(profile_id, media_id, media_type)` |
| `title`, `poster_path`, `backdrop_path`       | TEXT      | TMDB copy taken when added                                              |
| `year`, `rating`                              | INT, REAL | TMDB copy (`year > 1800`, `rating` 0–10)                                |
| `genres`                                      | TEXT      | JSON array, copied from TMDB                                            |
| `status`                                      | TEXT      | defaults to `planned`                                                   |
| `status_origin`                               | TEXT      | `manual` (default) or `auto` — who set `status` (migration 24)          |
| `favourite`, `user_rating`, `notes`, `tags`   | …         | `user_rating` 1–10, `tags` as JSON                                      |
| `started_at`, `completed_at`, `rewatch_count` | …         | set based on status changes                                             |
| `created_at`, `updated_at`                    | TEXT      | ISO dates                                                               |

Indexes: `(profile_id, status, updated_at DESC)`, `(media_id, media_type)`, plus two added by migration 16 for large-library stats queries: `(profile_id, media_type, status, completed_at ASC)` and a partial index `(profile_id, user_rating) WHERE user_rating IS NOT NULL`. Migration 17 replaced the plain `(profile_id, updated_at DESC)` index with `(profile_id, updated_at DESC, media_id DESC, media_type DESC)` — matching the tiebreak order the Library listing query already sorts by — and added two more for the Library page's cursor-paginated grid/list: `(profile_id, title ASC, media_id ASC, media_type ASC)` and `(profile_id, COALESCE(user_rating, rating, -1.0) DESC, media_id DESC, media_type DESC)`, one per sort mode `list_library_page` supports (see `src-tauri/src/library/queries.rs`'s `list_page_impl`).

`status_origin` records who set the current status: `manual` for a status the viewer chose (a new entry, or a save that changes the status), `auto` for one the viewing auto-sync derived (`auto_sync_status_impl`, and a series reopened by `refresh_tracked_series_status`). Only an `auto` Completed series is reopened automatically when TMDB reports more episodes than watched; a Completed the viewer picked by hand is never reopened by a refresh. Migration 24 backfills conservatively: every existing row is `manual`, except a Completed series whose recorded progress already covers its cached total, which is `auto`. The column is carried in the sync payload (`statusOrigin`, recreated outbox triggers; a payload without it keeps the stored value, or is `manual` for a new row) and in backups (`LibraryItem.statusOrigin`, optional; a backup made before it existed restores as `manual`).

Relations: a profile owns `0..n` library entries. Deleting the profile deletes the row (`ON DELETE CASCADE`). Updates go through `INSERT … ON CONFLICT DO UPDATE` rather than `INSERT OR REPLACE`, so `uuid`/`created_at` survive a status change.

`library_items` also covers what used to be a separate `watchlist_items` table, folded in by migration 10 (`src-tauri/src/database/migrations.rs`): a `planned` status row is the "to watch" equivalent — adding a title to the library defaults it to `planned` rather than writing to a second table. The migration is one-way and non-destructive: an existing `watchlist_items` row becomes a new `planned` library row unless a library row already exists for the same `(profile_id, media_id, media_type)`, in which case the library row wins and the watchlist row is dropped. A "not interested" dismissal (`dismissed_recommendations`, one row per profile and title, excluded from Watch Tonight and the recommendation rails) is lifted when the title is planned afterwards: `upsert_impl` deletes the profile's dismissal row in the same transaction whenever an entry is created as, or moves to, `planned` (a plain re-save of an already-planned entry does not, so a dismissal made later stays). The most recent intent wins, without any extra column.

### `viewing_events`

Every watch (or un-watch) generates a row here: a whole movie or a specific episode, with its duration. This is **this** table — not `library_items.status` — that feeds the statistics (minutes watched, consecutive-day streaks, monthly activity). The statistics read the log as a _current state_, not a history: a title is seen when its latest event is a `watched`/`rewatched`, a cancelled watch (latest event `unwatched`) is in no figure, and a watch → unwatch → watch cycle is one watch dated at the last active watch (see `docs/architecture.md`'s "Statistics semantics").

| Column                                          | Type      | Notes                                                                                                            |
| ----------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| `uuid` **PK**                                   | TEXT      | public identifier of the row                                                                                     |
| `profile_id` `FK`                               | TEXT      | → `profiles.uuid`                                                                                                |
| `media_id`, `media_type`, `title`               | …         | which title the event is about                                                                                   |
| `event_type`                                    | TEXT      | `watched` / `unwatched` / `rewatched`                                                                            |
| `watched_at`, `duration_minutes`                | TEXT, INT | timestamp + duration for stats                                                                                   |
| `episode_id`, `season_number`, `episode_number` | INT       | null for a movie                                                                                                 |
| `note`                                          | TEXT      | optional free-form note on the event, nullable (added by migration 13)                                           |
| `insert_seq`                                    | INTEGER   | position in the order events were **logged** (migration 25): unique, increasing, `NOT NULL DEFAULT 0`; see below |
| `created_at`                                    | TEXT      | ISO date; no `updated_at` — **append-only** log, no row is ever modified after the fact                          |

Indexes: `(profile_id, watched_at DESC)`, `(media_id, media_type)`, plus two added by migration 16 for large-library stats queries: `(profile_id, media_id, media_type, episode_id, watched_at DESC, created_at DESC)` and `(profile_id, media_id, media_type, watched_at DESC)`.

**Order of events (`insert_seq`).** "A title is seen when its latest event is a watch" needs a latest that dates cannot give: a watch can carry an earlier date than an unwatch that came before it (a TV Time import of old history, a clock that ran late), and two events can share a date. `insert_seq` is the order the rows were inserted in. An `AFTER INSERT` trigger (`viewing_events_assign_insert_seq`) numbers every row that arrives with `insert_seq = 0` as `MAX(insert_seq) + 1`, so no insert statement has to compute it; `viewing_events` has no `UPDATE` sync trigger, so numbering a row queues no second cloud mutation. Migration 25 numbered the existing rows by `rowid` (the order they sit in the table, i.e. the order they were logged in). Two indexes serve it: `UNIQUE (insert_seq)` (also what makes `MAX` cheap) and `(profile_id, media_id, media_type, episode_id, insert_seq)`, which the current-state window in `stats/queries/mod.rs` reads in log order. The number is local to a database: a backup exports it as `insertSeq` (events are exported in that order, and a restore replays them in it — one from before the field existed is replayed by `watched_at`), and a cloud sync does not carry it, so a device numbers pulled events in the order it receives them.

Relations: a profile logs `0..n` events.

### `seen_movies`

A simple "seen" toggle for movies, faster than going through the full library. Used to be called `profile_seen_movies` before the single schema.

| Column                                  | Type | Notes                                              |
| --------------------------------------- | ---- | -------------------------------------------------- |
| `uuid` **PK**                           | TEXT | public identifier of the row                       |
| `profile_id`, `movie_id` `FK` **UK**    | …    | → `profiles.uuid` ; `UNIQUE(profile_id, movie_id)` |
| `title`, `poster_path`, `backdrop_path` | TEXT | TMDB copy taken when added                         |
| `watched_at`                            | TEXT | watch date (can predate the import, e.g. TV Time)  |
| `created_at`, `updated_at`              | TEXT | ISO dates — row insertion vs. last modification    |

Indexes: `(profile_id, watched_at DESC)`, `(movie_id)`.

Relations: a profile has `0..n` movies marked as seen.

### `episode_progress`

One row per watched episode. This is the source of truth for where a profile stands in a show — the displayed count is recomputed on read, not stored. Used to be called `profile_episode_progress` before the single schema.

| Column                                              | Type       | Notes                                                                                         |
| --------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| `uuid` **PK**                                       | TEXT       | public identifier of the row                                                                  |
| `profile_id`, `series_id`, `episode_id` `FK` **UK** | …          | → `profiles.uuid` ; natural composite key                                                     |
| `season_number`, `episode_number`                   | INT        | locates the episode (both `>= 0`)                                                             |
| `watched`, `watched_at`                             | BOOL, TEXT | defaults to watched                                                                           |
| `created_at`, `updated_at`                          | TEXT       | ISO dates                                                                                     |
| `rating`                                            | INT        | 1-5, nullable (migration 19); included in the `sync_outbox` payload from migration 21 onwards |

Indexes: `(profile_id, series_id, watched)`, `(episode_id)`.

Relations: a profile has `0..n` episodes marked as watched.

### `tracked_series`

One row per show a profile actively tracks. The number of watched episodes is **not** stored here: it's computed via a join with `episode_progress` on every read, so a counter can never drift out of sync. `total_episodes` and `status` are caches, refreshed by `refresh_tracked_series_status` (from a series' detail page, and from the Today Hub when it finds an aired unwatched episode). That command also moves a `completed` `library_items` row back to `watching` (clearing `completed_at`, and setting `started_at` if it had none) once the show has more episodes than watched ones, but only if the status was set automatically (`status_origin = 'auto'`) and the show has recorded episode progress. Automatic `completed` itself requires TMDB status `Ended`/`Canceled`. A row only counts as _followed_ while the series is also in the profile's `library_items`: `list_tracked_series` and the watch forecast skip a series removed from the library (so it produces no reminders and drops out of Watch Next and the Today Hub), but the row and the episode progress are kept, so re-adding the series brings its progress back. Used to be called `profile_tracked_series` before the single schema.

| Column                                  | Type | Notes                                                                                                                                            |
| --------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `uuid` **PK**                           | TEXT | public identifier of the row                                                                                                                     |
| `profile_id`, `series_id` `FK` **UK**   | …    | → `profiles.uuid` ; natural composite key                                                                                                        |
| `title`, `poster_path`, `backdrop_path` | TEXT | TMDB copy taken when added                                                                                                                       |
| `total_episodes`                        | INT  | total known from TMDB, defaults to 0                                                                                                             |
| `status`                                | TEXT | TMDB production status ("Returning Series", "Ended", …), nullable — unknown for rows written before this column existed or imported from TV Time |
| `created_at`, `updated_at`              | TEXT | ISO dates                                                                                                                                        |

Indexes: `(profile_id, updated_at DESC)`, `(series_id)`.

Relations: a profile tracks `0..n` shows.

## Activity history

The activity feed shown on the "History" screen — human-readable, distinct from the statistical log above even though the two are often written at the same time.

### `activity_log`

Every notable action — adding to a list, a movie marked watched, an episode or a whole season checked off — becomes a row here with an `action` from 13 possible values (`movie:watched`, `watchlist:add`, `list:remove`, …) and a `metadata` JSON field for details specific to each action. Cloud sync captures these rows from migration 21 so the History screen converges across devices.

| Column                                             | Type | Notes                                                                    |
| -------------------------------------------------- | ---- | ------------------------------------------------------------------------ |
| `uuid` **PK**                                      | TEXT | public identifier of the row                                             |
| `profile_id` `FK`                                  | TEXT | → `profiles.uuid`                                                        |
| `media_id`, `media_type`, `title`                  | …    | which title the action is about                                          |
| `action`                                           | TEXT | `CHECK` constraint on the 13 possible values                             |
| `season_number`, `episode_number`, `episode_title` | …    | set for episode/season actions                                           |
| `metadata`                                         | TEXT | free-form JSON                                                           |
| `timestamp`                                        | TEXT | when the action happened, indexed for fast sorting                       |
| `created_at`, `updated_at`                         | TEXT | ISO dates — when the row was written/modified, distinct from `timestamp` |

Indexes: `(profile_id, timestamp DESC)`, `(media_id, media_type)`.

`metadata.media` — written for `movie:watched`/`movie:unwatched` (`progress/repository.rs`) and `watchlist:remove` (`library/repository.rs`) — is a snapshot of the title's catalogue fields (`title`, `posterPath`, `backdropPath`, `runtime`, `year`, `rating`, `genres`; `MediaSnapshot` in `history/models.rs`). It is what lets the History screen undo these entries offline: `use-undo-history-item.ts` rebuilds the title from it, and only an older entry without a snapshot falls back to TMDB (with a translated error when that is unreachable). No migration: the column was already free-form JSON.

Relations: a profile has `0..n` history rows.

## Custom lists

The collections users create themselves — "Christmas movies", "Rewatch with…" — distinct from the library.

### `custom_lists`

A named list created by a profile.

| Column                     | Type | Notes                                                                        |
| -------------------------- | ---- | ---------------------------------------------------------------------------- |
| `uuid` **PK**              | TEXT | public identifier of the list — target of the `custom_list_items.list_id` FK |
| `profile_id` `FK`          | TEXT | → `profiles.uuid`                                                            |
| `name`, `description`      | TEXT |                                                                              |
| `created_at`, `updated_at` | TEXT | ISO dates                                                                    |

Indexes: `(profile_id, updated_at DESC)`. `updated_at` is bumped when an item is really added or removed; re-adding a title already in the list, or removing one that is not, changes nothing.

Relations: a profile creates `0..n` lists. Deleting the profile deletes the list, which in turn deletes its contents (cascading chain).

### `custom_list_items`

A movie or show inside a list, with its position for display order.

| Column                          | Type | Notes                                                                  |
| ------------------------------- | ---- | ---------------------------------------------------------------------- |
| `uuid` **PK**                   | TEXT | public identifier of the row                                           |
| `list_id` `FK`                  | TEXT | → `custom_lists.uuid`                                                  |
| `media_id`, `media_type` **UK** | …    | `UNIQUE(list_id, media_id, media_type)`                                |
| `title`, `poster_path`          | TEXT | TMDB copy taken when added                                             |
| `position`                      | INT  | order within the list, `>= 0`                                          |
| `added_at`, `updated_at`        | TEXT | date added, then last modified (reordering) — no separate `created_at` |

Indexes: `(list_id, position)`, `(media_id, media_type)`.

Relations: a list contains `0..n` items. Adding a title already present is a no-op: it keeps its position and its stored title/poster.

## Smart lists & saved filters

Two lighter-weight personalization tables, both added after the initial schema: a smart list is a saved _rule_, not a saved set of items (contrast with `custom_lists`/`custom_list_items` above), and a saved filter is a named shortcut back to a specific filter/sort combination on a given page.

### `smart_lists`

A named, rule-based list: instead of storing member items, it stores the filter/sort rule that defines membership, evaluated live against `library_items` whenever the list is opened.

| Column                     | Type | Notes                                  |
| -------------------------- | ---- | -------------------------------------- |
| `uuid` **PK**              | TEXT | public identifier of the row           |
| `profile_id` `FK`          | TEXT | → `profiles.uuid`                      |
| `name`                     | TEXT |                                        |
| `rules`                    | TEXT | JSON — the filter/sort rule definition |
| `created_at`, `updated_at` | TEXT | ISO dates                              |

Indexes: `(profile_id, updated_at DESC)`.

Relations: a profile creates `0..n` smart lists. Deleting the profile deletes them (`ON DELETE CASCADE`).

### `saved_filters`

A named shortcut to a filter/sort combination, scoped to a specific page (e.g. the Library page vs. a custom list's page) so the same name can mean different things in different contexts.

| Column                     | Type | Notes                                    |
| -------------------------- | ---- | ---------------------------------------- |
| `uuid` **PK**              | TEXT | public identifier of the row             |
| `profile_id` `FK`          | TEXT | → `profiles.uuid`                        |
| `page`                     | TEXT | which page/screen this filter applies to |
| `name`                     | TEXT |                                          |
| `filters`                  | TEXT | JSON — the saved filter/sort state       |
| `created_at`, `updated_at` | TEXT | ISO dates                                |

Indexes: `(profile_id, page, updated_at DESC)`.

Relations: a profile creates `0..n` saved filters. Deleting the profile deletes them (`ON DELETE CASCADE`).

## Streaming availability

"What to watch tonight" and availability alerts rely on these two tables — one belongs to a profile, the other describes a fact about a title, shared by everyone.

### `availability_alerts`

"Tell me when this title becomes available on this platform" — a profile can subscribe to a title for a region and a list of preferred platforms.

| Column                            | Type | Notes                          |
| --------------------------------- | ---- | ------------------------------ |
| `uuid` **PK**                     | TEXT | public identifier of the row   |
| `profile_id` `FK`                 | TEXT | → `profiles.uuid`              |
| `media_id`, `media_type`, `title` | …    | which title the alert is about |
| `region`, `provider_ids`          | TEXT | `provider_ids` as JSON         |
| `enabled`                         | BOOL | defaults to true               |
| `created_at`, `updated_at`        | TEXT | ISO dates                      |

Indexes: `(profile_id, created_at DESC)`, `(enabled, profile_id)`, plus a `UNIQUE(profile_id, media_id, media_type)` index added by migration 9 to stop a profile from ending up with two alerts for the same title.

Relations: a profile creates `0..n` alerts.

### `availability_snapshots`

The latest known list of platforms offering a title, per region — a property of the **title**, not of a profile, so shared by everyone. Matched against alerts in memory by the app (no foreign key between the two), to detect new availability.

| Column                                    | Type | Notes                                       |
| ----------------------------------------- | ---- | ------------------------------------------- |
| `media_id`, `media_type`, `region` **PK** | …    | composite key                               |
| `provider_ids`                            | TEXT | JSON                                        |
| `checked_at`                              | TEXT | last check — also serves as "last modified" |

No declared relation — table independent from profiles. No `uuid`: a pure cache, fully overwritten on every check, none of whose rows ever needs to be referenced individually.

## Cloud sync

Added by migration 18, purely local bookkeeping for the multi-device sync engine described in `docs/architecture.md`'s "Cloud sync" section — none of these four tables is itself pushed to Supabase; they only track what has been / still needs to be.

### `sync_control`

A single row (`id = 1`), toggling `suppress_outbox` while `apply_remote_changes` writes trusted data down from the server (or while a profile is being deleted), so those writes don't re-trigger the very triggers described below.

### `sync_metadata`

Generic key/value bookkeeping: this install's `deviceId` (a UUID, generated once), each profile's pull cursor (`cursor:<profile_id>`), and a one-time bootstrap marker (`bootstrap:<profile_id>`) recording that this profile's pre-existing rows have already been seeded into `sync_outbox`.

### `sync_entity_state`

| Column                                          | Type    | Notes                                      |
| ----------------------------------------------- | ------- | ------------------------------------------ |
| `profile_id`, `entity_type`, `entity_id` **PK** | TEXT    | which local row this tracks                |
| `remote_version`                                | INTEGER | the last server-acknowledged version       |
| `deleted`                                       | INTEGER | 0/1 — set when a remote delete was applied |
| `updated_at`                                    | TEXT    | ISO date                                   |

Lets a freshly-created local row start its very first push from `base_version = 0` (via `COALESCE(..., 0)` in every trigger) rather than guessing.

### `sync_outbox`

| Column                        | Type    | Notes                                                                                          |
| ----------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `mutation_id` **PK**          | TEXT    | generated per queued change                                                                    |
| `profile_id`                  | TEXT    | FK → `profiles.uuid`, cascades on profile delete                                               |
| `entity_type`, `entity_id`    | TEXT    | e.g. `library_item` + that row's uuid; `account_preferences` + a preference `key`              |
| `operation`                   | TEXT    | `upsert` or `delete`                                                                           |
| `payload`                     | TEXT    | JSON snapshot of the row (`NULL` for a delete)                                                 |
| `base_version`                | INTEGER | the version this change was made against — the server rejects it as a conflict if that's stale |
| `created_at`                  | TEXT    | ISO date                                                                                       |
| `attempt_count`, `last_error` |         | retry bookkeeping                                                                              |

`UNIQUE(profile_id, entity_type, entity_id)`: a second local edit to the same row before the first has synced replaces the pending mutation in place rather than queuing two — only the latest value ever needs to reach the server. Populated by the `AFTER INSERT/UPDATE/DELETE` triggers on `library_items`, `seen_movies`, `episode_progress`, `tracked_series`, `viewing_events`, `custom_lists`, `custom_list_items`, `smart_lists`, `saved_filters`, `availability_alerts`, `dismissed_recommendations` (migration 20), and `activity_log` (migration 21). `account_preferences` is the one synced entity type with no trigger of its own, captured instead directly in `preferences::repository::write_preference` (see `preferences` above; `preferences` has no `profile_id` column to key a trigger's `sync_outbox` row off in the first place).

Relations: a profile has `0..n` queued mutations; deleting the profile cascades.

## Conceptual model (ERD)

The entities and their cardinalities — the full column lists are above. `||--o{` reads as "one, mandatory" on the double-bar side, "zero to many" on the open-crow's-foot side. Example — `PROFILES ||--o{ LIBRARY_ITEMS`: a profile has zero to many library records, a record belongs to exactly one profile.

```mermaid
erDiagram
    PROFILES {
        string uuid PK
        string name
        string created_at
        string supabase_user_id UK
    }
    PREFERENCES {
        string key PK
        string value
    }
    LIBRARY_ITEMS {
        string uuid PK
        string profile_id FK
        int media_id
        string media_type
        string status
    }
    VIEWING_EVENTS {
        string uuid PK
        string profile_id FK
        string event_type
        string watched_at
    }
    SEEN_MOVIES {
        string uuid PK
        string profile_id FK
        int movie_id
        string watched_at
    }
    EPISODE_PROGRESS {
        string uuid PK
        string profile_id FK
        int series_id
        int episode_id
        bool watched
    }
    TRACKED_SERIES {
        string uuid PK
        string profile_id FK
        int series_id
        int total_episodes
    }
    ACTIVITY_LOG {
        string uuid PK
        string profile_id FK
        string action
        string timestamp
    }
    CUSTOM_LISTS {
        string uuid PK
        string profile_id FK
        string name
    }
    CUSTOM_LIST_ITEMS {
        string uuid PK
        string list_id FK
        int media_id
        int position
    }
    SMART_LISTS {
        string uuid PK
        string profile_id FK
        string name
        string rules
    }
    SAVED_FILTERS {
        string uuid PK
        string profile_id FK
        string page
        string name
        string filters
    }
    AVAILABILITY_ALERTS {
        string uuid PK
        string profile_id FK
        string region
        string provider_ids
    }
    AVAILABILITY_SNAPSHOTS {
        int media_id
        string media_type
        string region
        string checked_at
    }
    SYNC_OUTBOX {
        string mutation_id PK
        string profile_id FK
        string entity_type
        string entity_id
        string operation
    }

    PROFILES ||--o{ LIBRARY_ITEMS : tracks
    PROFILES ||--o{ VIEWING_EVENTS : logs
    PROFILES ||--o{ SEEN_MOVIES : "has watched"
    PROFILES ||--o{ EPISODE_PROGRESS : progresses
    PROFILES ||--o{ TRACKED_SERIES : tracks
    PROFILES ||--o{ ACTIVITY_LOG : logs
    PROFILES ||--o{ CUSTOM_LISTS : creates
    PROFILES ||--o{ SMART_LISTS : creates
    PROFILES ||--o{ SAVED_FILTERS : creates
    PROFILES ||--o{ AVAILABILITY_ALERTS : subscribes
    PROFILES ||--o{ SYNC_OUTBOX : queues
    CUSTOM_LISTS ||--o{ CUSTOM_LIST_ITEMS : contains
```

`PREFERENCES` and `AVAILABILITY_SNAPSHOTS` are deliberately isolated, with no FK to `PROFILES`. So are `sync_control`, `sync_metadata`, and `sync_entity_state` (omitted above for the same reason as `PREFERENCES`/indexes generally — pure bookkeeping, not a modeled business entity); `sync_metadata` in particular has no `profile_id` column at all.

`PROFILES.supabase_user_id` deliberately has no relationship line in this diagram: its conceptual "parent" is a Clerk user (`user_xxx`), which lives outside this SQLite file. It's a correlation value, not a constraint enforced by the engine.

---

The 11 relations to `profiles`, plus the one from `custom_list_items` to `custom_lists`, are declared as `ON DELETE CASCADE` — deleting a profile or a list deletes everything that belongs to it, all the way down the chain. The `profiles.supabase_user_id` link conditions access to a profile on a Clerk sign-in.
