import type { Migration } from "./types";

// Every data table gets `id INTEGER PRIMARY KEY` (internal rowid, never
// surfaced outside SQL) plus `uuid TEXT NOT NULL UNIQUE` (the stable public
// identifier the app treats as `.id`, generated with crypto.randomUUID() at
// insert time — see src/shared/lib/id.ts). `created_at`/`updated_at` are
// ISO-8601 strings supplied by the app (nowIso()), matching the only date
// format already used everywhere, rather than mixing in SQL-side triggers.
//
// Two documented exceptions:
// - `preferences` is a singleton key/value store: `key` is already a stable
//   natural PK and no repository ever needs to reference an individual row's
//   identity, so it only gains `updated_at`.
// - `availability_snapshots` is a pure TTL-style cache keyed by
//   (media_id, media_type, region) and fully overwritten on every refresh —
//   `checked_at` already tells you everything `created_at`/`updated_at`
//   would, so neither is added.
//
// `viewing_events` is append-only (every write is a plain INSERT, never an
// update-in-place), so it gets `created_at` but no `updated_at`, which would
// always equal it. `custom_list_items` already has a business-meaningful
// `added_at` timestamp (when the title joined the list) that plays the role
// `created_at` would, so it gains `updated_at` (for reordering) but not a
// redundant `created_at`.
export const migration: Migration = {
  version: 1,
  name: "initial schema",
  statements: [
    `CREATE TABLE profiles (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      avatar TEXT,
      supabase_user_id TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,

    `CREATE TABLE library_items (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL UNIQUE,
      profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      year INTEGER,
      rating REAL,
      genres TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned','watching','paused','completed','dropped','rewatching')),
      favourite INTEGER NOT NULL DEFAULT 0 CHECK (favourite IN (0,1)),
      user_rating REAL,
      notes TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      started_at TEXT,
      completed_at TEXT,
      rewatch_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (profile_id, media_id, media_type)
    )`,
    "CREATE INDEX idx_library_profile_status ON library_items(profile_id, status, updated_at DESC)",
    "CREATE INDEX idx_library_profile_updated ON library_items(profile_id, updated_at DESC)",

    `CREATE TABLE watchlist_items (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL UNIQUE,
      profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      year INTEGER,
      rating REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (profile_id, media_id, media_type)
    )`,
    "CREATE INDEX idx_watchlist_items_profile_created ON watchlist_items(profile_id, created_at DESC)",

    `CREATE TABLE seen_movies (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL UNIQUE,
      profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
      movie_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      watched_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (profile_id, movie_id)
    )`,
    "CREATE INDEX idx_seen_movies_profile_watched ON seen_movies(profile_id, watched_at DESC)",

    `CREATE TABLE episode_progress (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL UNIQUE,
      profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
      series_id INTEGER NOT NULL,
      episode_id INTEGER NOT NULL,
      season_number INTEGER NOT NULL,
      episode_number INTEGER NOT NULL,
      watched INTEGER NOT NULL DEFAULT 1 CHECK (watched IN (0,1)),
      watched_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (profile_id, series_id, episode_id)
    )`,
    "CREATE INDEX idx_episode_progress_series_watched ON episode_progress(profile_id, series_id, watched)",

    `CREATE TABLE tracked_series (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL UNIQUE,
      profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
      series_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      total_episodes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (profile_id, series_id)
    )`,
    "CREATE INDEX idx_tracked_series_profile_updated ON tracked_series(profile_id, updated_at DESC)",

    `CREATE TABLE viewing_events (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL UNIQUE,
      profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
      title TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('watched','unwatched','rewatched')),
      watched_at TEXT NOT NULL,
      duration_minutes INTEGER,
      episode_id INTEGER,
      season_number INTEGER,
      episode_number INTEGER,
      created_at TEXT NOT NULL
    )`,
    "CREATE INDEX idx_viewing_events_profile_date ON viewing_events(profile_id, watched_at DESC)",

    `CREATE TABLE activity_log (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL UNIQUE,
      profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
      title TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN (
        'movie:watched','movie:unwatched','episode:watched','episode:unwatched',
        'season:watched','season:unwatched','series:watched','series:unwatched',
        'watchlist:add','watchlist:remove','library:update','list:add','list:remove'
      )),
      season_number INTEGER,
      episode_number INTEGER,
      episode_title TEXT,
      metadata TEXT,
      timestamp TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    "CREATE INDEX idx_activity_log_profile_timestamp ON activity_log(profile_id, timestamp DESC)",

    `CREATE TABLE custom_lists (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL UNIQUE,
      profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    "CREATE INDEX idx_custom_lists_profile_updated ON custom_lists(profile_id, updated_at DESC)",

    `CREATE TABLE custom_list_items (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL UNIQUE,
      list_id TEXT NOT NULL REFERENCES custom_lists(uuid) ON DELETE CASCADE,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
      title TEXT NOT NULL,
      poster_path TEXT,
      position INTEGER NOT NULL,
      added_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (list_id, media_id, media_type)
    )`,
    "CREATE INDEX idx_custom_list_items_position ON custom_list_items(list_id, position)",

    `CREATE TABLE availability_alerts (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL UNIQUE,
      profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
      title TEXT NOT NULL,
      region TEXT NOT NULL,
      provider_ids TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    "CREATE INDEX idx_availability_alerts_profile_created ON availability_alerts(profile_id, created_at DESC)",

    `CREATE TABLE availability_snapshots (
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
      region TEXT NOT NULL,
      provider_ids TEXT NOT NULL,
      checked_at TEXT NOT NULL,
      PRIMARY KEY (media_id, media_type, region)
    )`,

    `CREATE TABLE preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,

    `INSERT OR IGNORE INTO profiles (uuid, name, created_at, updated_at)
     VALUES ('default', 'Principal', datetime('now'), datetime('now'))`,
  ],
};
