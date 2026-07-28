import type { Migration } from "./types";

// sqlx-sqlite (the driver behind tauri-plugin-sql) sets `PRAGMA foreign_keys
// = ON` on every connection by default, but none of these tables actually
// declare a FOREIGN KEY, so nothing has ever been enforced. SQLite can't add
// a constraint to an existing table via ALTER TABLE, so each table is
// rebuilt under a `_new` name with the exact same columns in the same order
// (so `SELECT *` stays a valid straight copy) plus the constraint, the
// original is dropped, and the copy is renamed into place — the standard
// SQLite procedure for schema changes ALTER TABLE doesn't support. Every
// `_new` table is dropped first so this is safe to reason about even if a
// prior attempt left one behind, and every profile_id/list_id is
// sanitized to a known-good value first so a constraint that didn't exist
// yesterday can't fail today's upgrade because of stale, pre-existing data.
export const migration: Migration = {
  version: 7,
  name: "enforce foreign keys on profile- and list-scoped tables",
  statements: [
    // A NULL profile_id/list_id is never checked by SQLite's FK enforcement
    // (there's simply nothing to look up), so these guards only need to
    // reassign non-NULL values that don't match any real profiles/list row.
    "UPDATE profile_watchlist SET profile_id = 'default' WHERE profile_id NOT IN (SELECT id FROM profiles)",
    "UPDATE profile_seen_movies SET profile_id = 'default' WHERE profile_id NOT IN (SELECT id FROM profiles)",
    "UPDATE profile_episode_progress SET profile_id = 'default' WHERE profile_id NOT IN (SELECT id FROM profiles)",
    "UPDATE profile_tracked_series SET profile_id = 'default' WHERE profile_id NOT IN (SELECT id FROM profiles)",
    "UPDATE library_items SET profile_id = 'default' WHERE profile_id NOT IN (SELECT id FROM profiles)",
    "UPDATE viewing_events SET profile_id = 'default' WHERE profile_id NOT IN (SELECT id FROM profiles)",
    "UPDATE availability_alerts SET profile_id = 'default' WHERE profile_id NOT IN (SELECT id FROM profiles)",
    "UPDATE activity_log SET profile_id = 'default' WHERE profile_id IS NOT NULL AND profile_id NOT IN (SELECT id FROM profiles)",
    "UPDATE custom_lists SET profile_id = 'default' WHERE profile_id NOT IN (SELECT id FROM profiles)",
    // custom_list_items has no sensible list to reassign an orphan to.
    "DELETE FROM custom_list_items WHERE list_id NOT IN (SELECT id FROM custom_lists)",

    // profile_watchlist
    "DROP TABLE IF EXISTS profile_watchlist_new",
    `CREATE TABLE profile_watchlist_new (
      profile_id TEXT NOT NULL,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      year INTEGER,
      rating REAL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (profile_id, media_id, media_type),
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,
    "INSERT INTO profile_watchlist_new SELECT * FROM profile_watchlist",
    "DROP TABLE profile_watchlist",
    "ALTER TABLE profile_watchlist_new RENAME TO profile_watchlist",
    "CREATE INDEX IF NOT EXISTS idx_profile_watchlist_created ON profile_watchlist(profile_id, created_at DESC)",

    // profile_seen_movies
    "DROP TABLE IF EXISTS profile_seen_movies_new",
    `CREATE TABLE profile_seen_movies_new (
      profile_id TEXT NOT NULL,
      movie_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      watched_at TEXT NOT NULL,
      PRIMARY KEY (profile_id, movie_id),
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,
    "INSERT INTO profile_seen_movies_new SELECT * FROM profile_seen_movies",
    "DROP TABLE profile_seen_movies",
    "ALTER TABLE profile_seen_movies_new RENAME TO profile_seen_movies",
    "CREATE INDEX IF NOT EXISTS idx_profile_seen_movies_watched ON profile_seen_movies(profile_id, watched_at DESC)",

    // profile_episode_progress
    "DROP TABLE IF EXISTS profile_episode_progress_new",
    `CREATE TABLE profile_episode_progress_new (
      profile_id TEXT NOT NULL,
      series_id INTEGER NOT NULL,
      episode_id INTEGER NOT NULL,
      season_number INTEGER NOT NULL,
      episode_number INTEGER NOT NULL,
      watched INTEGER NOT NULL DEFAULT 1,
      watched_at TEXT,
      PRIMARY KEY (profile_id, series_id, episode_id),
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,
    "INSERT INTO profile_episode_progress_new SELECT * FROM profile_episode_progress",
    "DROP TABLE profile_episode_progress",
    "ALTER TABLE profile_episode_progress_new RENAME TO profile_episode_progress",
    "CREATE INDEX IF NOT EXISTS idx_profile_episode_progress ON profile_episode_progress(profile_id, series_id, watched)",

    // profile_tracked_series
    "DROP TABLE IF EXISTS profile_tracked_series_new",
    `CREATE TABLE profile_tracked_series_new (
      profile_id TEXT NOT NULL,
      series_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      total_episodes INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (profile_id, series_id),
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,
    "INSERT INTO profile_tracked_series_new SELECT * FROM profile_tracked_series",
    "DROP TABLE profile_tracked_series",
    "ALTER TABLE profile_tracked_series_new RENAME TO profile_tracked_series",
    "CREATE INDEX IF NOT EXISTS idx_profile_tracked_series ON profile_tracked_series(profile_id, updated_at DESC)",

    // library_items
    "DROP TABLE IF EXISTS library_items_new",
    `CREATE TABLE library_items_new (
      profile_id TEXT NOT NULL,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      year INTEGER,
      rating REAL,
      genres TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'planned',
      favourite INTEGER NOT NULL DEFAULT 0,
      user_rating REAL,
      notes TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      started_at TEXT,
      completed_at TEXT,
      rewatch_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (profile_id, media_id, media_type),
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,
    "INSERT INTO library_items_new SELECT * FROM library_items",
    "DROP TABLE library_items",
    "ALTER TABLE library_items_new RENAME TO library_items",
    "CREATE INDEX IF NOT EXISTS idx_library_profile_status ON library_items(profile_id, status, updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_library_profile_updated ON library_items(profile_id, updated_at DESC)",

    // viewing_events
    "DROP TABLE IF EXISTS viewing_events_new",
    `CREATE TABLE viewing_events_new (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      event_type TEXT NOT NULL,
      watched_at TEXT NOT NULL,
      duration_minutes INTEGER,
      episode_id INTEGER,
      season_number INTEGER,
      episode_number INTEGER,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,
    "INSERT INTO viewing_events_new SELECT * FROM viewing_events",
    "DROP TABLE viewing_events",
    "ALTER TABLE viewing_events_new RENAME TO viewing_events",
    "CREATE INDEX IF NOT EXISTS idx_viewing_events_date ON viewing_events(profile_id, watched_at DESC)",

    // availability_alerts
    "DROP TABLE IF EXISTS availability_alerts_new",
    `CREATE TABLE availability_alerts_new (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      region TEXT NOT NULL,
      provider_ids TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,
    "INSERT INTO availability_alerts_new SELECT * FROM availability_alerts",
    "DROP TABLE availability_alerts",
    "ALTER TABLE availability_alerts_new RENAME TO availability_alerts",
    "CREATE INDEX IF NOT EXISTS idx_availability_alerts_profile_created ON availability_alerts(profile_id, created_at DESC)",

    // activity_log — profile_id stays nullable (it was added via ALTER
    // TABLE before migration 5's backfill gave every row a value); SQLite
    // simply doesn't check the FK for NULL values, so this is safe even
    // though in practice every row has had one since migration 5.
    "DROP TABLE IF EXISTS activity_log_new",
    `CREATE TABLE activity_log_new (
      id TEXT PRIMARY KEY,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      action TEXT NOT NULL,
      season_number INTEGER,
      episode_number INTEGER,
      episode_title TEXT,
      timestamp TEXT NOT NULL,
      metadata TEXT,
      profile_id TEXT,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,
    "INSERT INTO activity_log_new SELECT * FROM activity_log",
    "DROP TABLE activity_log",
    "ALTER TABLE activity_log_new RENAME TO activity_log",
    "CREATE INDEX IF NOT EXISTS idx_activity_log_profile_timestamp ON activity_log(profile_id, timestamp DESC)",

    // custom_lists — rebuilt before custom_list_items, which references it.
    "DROP TABLE IF EXISTS custom_lists_new",
    `CREATE TABLE custom_lists_new (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,
    "INSERT INTO custom_lists_new SELECT * FROM custom_lists",
    "DROP TABLE custom_lists",
    "ALTER TABLE custom_lists_new RENAME TO custom_lists",
    "CREATE INDEX IF NOT EXISTS idx_custom_lists_profile ON custom_lists(profile_id, updated_at DESC)",

    // custom_list_items
    "DROP TABLE IF EXISTS custom_list_items_new",
    `CREATE TABLE custom_list_items_new (
      list_id TEXT NOT NULL,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      position INTEGER NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (list_id, media_id, media_type),
      FOREIGN KEY (list_id) REFERENCES custom_lists(id) ON DELETE CASCADE
    )`,
    "INSERT INTO custom_list_items_new SELECT * FROM custom_list_items",
    "DROP TABLE custom_list_items",
    "ALTER TABLE custom_list_items_new RENAME TO custom_list_items",
    "CREATE INDEX IF NOT EXISTS idx_custom_list_items_position ON custom_list_items(list_id, position)",
  ],
};
