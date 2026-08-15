# CineTrack — database schema

The database is local SQLite, embedded in the app via Tauri — no server, everything lives on the machine. It's designed to be **multi-profile** from the start: almost every table carries a `profile_id` that isolates one profile's data from the others, with `FOREIGN KEY … ON DELETE CASCADE` constraints guaranteeing no row survives the deletion of its profile or its list. Each profile is also **linked to a Supabase account** — accessing it requires being signed in with that specific account.

Every table's primary key is a `uuid TEXT PRIMARY KEY`, generated app-side with `crypto.randomUUID()` (see [`src/shared/lib/id.ts`](../src/shared/lib/id.ts)) — there is no separate internal integer id. Two tables deliberately don't follow this: `preferences` (`key` is already a stable natural primary key) and `availability_snapshots` (a pure cache keyed by `(media_id, media_type, region)`, with no row ever referenced individually).

**13 active tables · 2 migrations · 1 database file per machine.**

The full DDL lives in [`src/db/migrations/001-initial-schema.ts`](../src/db/migrations/001-initial-schema.ts) plus a follow-up [`002-availability-alerts-unique.ts`](../src/db/migrations/002-availability-alerts-unique.ts) (ported verbatim to Rust in [`src-tauri/src/database/migrations.rs`](../src-tauri/src/database/migrations.rs), which is what the desktop app actually runs against — the TypeScript copies back the test harness). This document is a readable companion to that file, not a replacement for it.

## Profiles & preferences

The foundation for everything else: each profile has its own library, history, and lists. Preferences, on the other hand, deliberately do **not** follow this split.

### `profiles`

A profile = a person using the app. **Every** table below attaches to it via `profile_id` (which points to `profiles.uuid`). The `'default'` profile is created automatically by the migration and can never be deleted. A profile must be **linked to a Supabase account** to be accessible: the first account that signs in automatically claims `'default'` (and its existing data), any following account must create its own profile. This is enforced by the app's `ProfileGate` (`src/features/auth/profile-gate.tsx`), not by a SQLite constraint or a check inside the Rust commands themselves — see the "Authorization belongs in the Rust command" rule in `CLAUDE.md`.

| Column                     | Type | Notes                                                                                                                          |
| -------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| `uuid` **PK**              | TEXT | `'default'` or a generated UUID — this is what the app calls `.id`                                                             |
| `name`                     | TEXT | displayed name                                                                                                                 |
| `avatar`                   | TEXT | optional                                                                                                                       |
| `supabase_user_id` **UK**  | TEXT | optional, unique — id of the linked Supabase account; no FK possible, `auth.users` lives on Supabase, outside this SQLite file |
| `created_at`, `updated_at` | TEXT | ISO dates                                                                                                                      |

Relations: a profile has `0..n` rows in every table below. No dedicated index (the table is tiny and always scanned by `uuid`).

### `preferences`

Application settings: theme, accent color, language, TMDB region, spoiler protection, notifications, and `activeProfileId` — the currently selected profile. This is a **global** table, shared by every profile: they share the same app, not the same per-profile preferences.

| Column       | Type | Notes                           |
| ------------ | ---- | ------------------------------- |
| `key` **PK** | TEXT | e.g. `theme`, `activeProfileId` |
| `value`      | TEXT | value encoded as JSON           |
| `updated_at` | TEXT | ISO date                        |

No declared relation — table intentionally independent from profiles. No `uuid`: `key` is already a stable natural key, and nothing references an individual preference row.

## Library & progress

The functional core of the app. Three ideas deliberately coexist: a current _state_ (`library_items`, `status`), an immutable _event log_ (`viewing_events`, used for statistics), and lighter tables that are faster to query for day-to-day interactive use (watchlist, seen/unseen, episode progress, tracked shows).

### `library_items`

The full record of a movie or show in a profile's library: its **status** (`planned`, `watching`, `paused`, `completed`, `dropped`, `rewatching`), the personal rating, free-form notes, tags, start/end dates, and the rewatch count.

| Column                                        | Type      | Notes                                                                   |
| --------------------------------------------- | --------- | ----------------------------------------------------------------------- |
| `uuid` **PK**                                 | TEXT      | public identifier of the row                                            |
| `profile_id` `FK`                             | TEXT      | → `profiles.uuid`                                                       |
| `media_id`, `media_type` **UK**               | INT, TEXT | TMDB id + `movie`/`series` — `UNIQUE(profile_id, media_id, media_type)` |
| `title`, `poster_path`, `backdrop_path`       | TEXT      | TMDB copy taken when added                                              |
| `year`, `rating`                              | INT, REAL | TMDB copy (`year > 1800`, `rating` 0–10)                                |
| `genres`                                      | TEXT      | JSON array, copied from TMDB                                            |
| `status`                                      | TEXT      | defaults to `planned`                                                   |
| `favourite`, `user_rating`, `notes`, `tags`   | …         | `user_rating` 1–10, `tags` as JSON                                      |
| `started_at`, `completed_at`, `rewatch_count` | …         | set based on status changes                                             |
| `created_at`, `updated_at`                    | TEXT      | ISO dates                                                               |

Indexes: `(profile_id, status, updated_at DESC)`, `(profile_id, updated_at DESC)`, `(media_id, media_type)`.

Relations: a profile owns `0..n` library entries. Deleting the profile deletes the row (`ON DELETE CASCADE`). Updates go through `INSERT … ON CONFLICT DO UPDATE` rather than `INSERT OR REPLACE`, so `uuid`/`created_at` survive a status change.

### `viewing_events`

Every watch (or un-watch) generates a row here: a whole movie or a specific episode, with its duration. This is **this** table — not `library_items.status` — that feeds the statistics (minutes watched, consecutive-day streaks, monthly activity).

| Column                                          | Type      | Notes                                                                                   |
| ----------------------------------------------- | --------- | --------------------------------------------------------------------------------------- |
| `uuid` **PK**                                   | TEXT      | public identifier of the row                                                            |
| `profile_id` `FK`                               | TEXT      | → `profiles.uuid`                                                                       |
| `media_id`, `media_type`, `title`               | …         | which title the event is about                                                          |
| `event_type`                                    | TEXT      | `watched` / `unwatched` / `rewatched`                                                   |
| `watched_at`, `duration_minutes`                | TEXT, INT | timestamp + duration for stats                                                          |
| `episode_id`, `season_number`, `episode_number` | INT       | null for a movie                                                                        |
| `created_at`                                    | TEXT      | ISO date; no `updated_at` — **append-only** log, no row is ever modified after the fact |

Indexes: `(profile_id, watched_at DESC)`, `(media_id, media_type)`.

Relations: a profile logs `0..n` events.

### `watchlist_items`

The simple "to watch" list — lighter than `library_items`, with no status or rating. Used to be called `profile_watchlist` before the single schema: the `profile_` prefix distinguished this table from an old, non-profile-scoped `watchlist` table, now removed.

| Column                                                    | Type | Notes                                                          |
| --------------------------------------------------------- | ---- | -------------------------------------------------------------- |
| `uuid` **PK**                                             | TEXT | public identifier of the row                                   |
| `profile_id`, `media_id`, `media_type` `FK` **UK**        | …    | → `profiles.uuid` ; `UNIQUE(profile_id, media_id, media_type)` |
| `title`, `poster_path`, `backdrop_path`, `year`, `rating` | …    | TMDB copy taken when added                                     |
| `created_at`, `updated_at`                                | TEXT | ISO dates                                                      |

Indexes: `(profile_id, created_at DESC)`, `(media_id, media_type)`.

Relations: a profile has `0..n` entries to watch.

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

| Column                                              | Type       | Notes                                     |
| --------------------------------------------------- | ---------- | ----------------------------------------- |
| `uuid` **PK**                                       | TEXT       | public identifier of the row              |
| `profile_id`, `series_id`, `episode_id` `FK` **UK** | …          | → `profiles.uuid` ; natural composite key |
| `season_number`, `episode_number`                   | INT        | locates the episode (both `>= 0`)         |
| `watched`, `watched_at`                             | BOOL, TEXT | defaults to watched                       |
| `created_at`, `updated_at`                          | TEXT       | ISO dates                                 |

Indexes: `(profile_id, series_id, watched)`, `(episode_id)`.

Relations: a profile has `0..n` episodes marked as watched.

### `tracked_series`

One row per show a profile actively tracks. The number of watched episodes is **not** stored here: it's computed via a join with `episode_progress` on every read, so a counter can never drift out of sync. Used to be called `profile_tracked_series` before the single schema.

| Column                                  | Type | Notes                                     |
| --------------------------------------- | ---- | ----------------------------------------- |
| `uuid` **PK**                           | TEXT | public identifier of the row              |
| `profile_id`, `series_id` `FK` **UK**   | …    | → `profiles.uuid` ; natural composite key |
| `title`, `poster_path`, `backdrop_path` | TEXT | TMDB copy taken when added                |
| `total_episodes`                        | INT  | total known from TMDB, defaults to 0      |
| `created_at`, `updated_at`              | TEXT | ISO dates                                 |

Indexes: `(profile_id, updated_at DESC)`, `(series_id)`.

Relations: a profile tracks `0..n` shows.

## Activity history

The activity feed shown on the "History" screen — human-readable, distinct from the statistical log above even though the two are often written at the same time.

### `activity_log`

Every notable action — adding to a list, a movie marked watched, an episode or a whole season checked off — becomes a row here with an `action` from 13 possible values (`movie:watched`, `watchlist:add`, `list:remove`, …) and a `metadata` JSON field for details specific to each action.

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

Relations: a profile has `0..n` history rows.

## Custom lists

The collections users create themselves — "Christmas movies", "Rewatch with…" — distinct from the system watchlist.

### `custom_lists`

A named list created by a profile.

| Column                     | Type | Notes                                                                        |
| -------------------------- | ---- | ---------------------------------------------------------------------------- |
| `uuid` **PK**              | TEXT | public identifier of the list — target of the `custom_list_items.list_id` FK |
| `profile_id` `FK`          | TEXT | → `profiles.uuid`                                                            |
| `name`, `description`      | TEXT |                                                                              |
| `created_at`, `updated_at` | TEXT | ISO dates                                                                    |

Indexes: `(profile_id, updated_at DESC)`.

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

Relations: a list contains `0..n` items.

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
    WATCHLIST_ITEMS {
        string uuid PK
        string profile_id FK
        int media_id
        string media_type
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

    PROFILES ||--o{ LIBRARY_ITEMS : tracks
    PROFILES ||--o{ VIEWING_EVENTS : logs
    PROFILES ||--o{ WATCHLIST_ITEMS : "wants to watch"
    PROFILES ||--o{ SEEN_MOVIES : "has watched"
    PROFILES ||--o{ EPISODE_PROGRESS : progresses
    PROFILES ||--o{ TRACKED_SERIES : tracks
    PROFILES ||--o{ ACTIVITY_LOG : logs
    PROFILES ||--o{ CUSTOM_LISTS : creates
    PROFILES ||--o{ AVAILABILITY_ALERTS : subscribes
    CUSTOM_LISTS ||--o{ CUSTOM_LIST_ITEMS : contains
```

`PREFERENCES` and `AVAILABILITY_SNAPSHOTS` are deliberately isolated, with no FK to `PROFILES`.

`PROFILES.supabase_user_id` deliberately has no relationship line in this diagram: its conceptual "parent", `auth.users`, lives in Supabase's own Postgres database — a separate SQLite file can neither reference nor join it. It's a correlation value, not a constraint enforced by the engine.

---

The 9 relations to `profiles`, plus the one from `custom_list_items` to `custom_lists`, are declared as `ON DELETE CASCADE` — deleting a profile or a list deletes everything that belongs to it, all the way down the chain. The `profiles.supabase_user_id` link conditions access to a profile on a Supabase sign-in.
