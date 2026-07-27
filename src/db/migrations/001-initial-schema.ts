import type { Migration } from "./types";

// `watchlist`, `seen_movies`, `tracked_series`, and `episode_progress` (this
// migration) are superseded by their `profile_*` / `library_items`
// equivalents from migration 3 onward and are no longer written to by any
// repository. They stay in the schema, unused, purely so migration 3's
// `INSERT OR IGNORE ... SELECT ... FROM <legacy table>` backfill keeps
// working against databases created before profiles existed — dropping them
// would break that one-time migration for existing installs.
export const migration: Migration = {
  version: 1,
  name: "initial schema and indexes",
  statements: [
    `CREATE TABLE IF NOT EXISTS watchlist (
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      year INTEGER,
      rating REAL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (media_id, media_type)
    )`,
    `CREATE TABLE IF NOT EXISTS seen_movies (
      movie_id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      watched_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS tracked_series (
      series_id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      total_episodes INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS episode_progress (
      series_id INTEGER NOT NULL,
      episode_id INTEGER NOT NULL,
      season_number INTEGER NOT NULL,
      episode_number INTEGER NOT NULL,
      watched INTEGER NOT NULL DEFAULT 1,
      watched_at TEXT,
      PRIMARY KEY (series_id, episode_id)
    )`,
    `CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      action TEXT NOT NULL,
      season_number INTEGER,
      episode_number INTEGER,
      episode_title TEXT,
      timestamp TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    "CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp DESC)",
    "CREATE INDEX IF NOT EXISTS idx_episode_progress_series_watched ON episode_progress(series_id, watched)",
    "CREATE INDEX IF NOT EXISTS idx_tracked_series_updated ON tracked_series(updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_watchlist_created ON watchlist(created_at DESC)",
  ],
};
