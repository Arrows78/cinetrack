import type { Migration } from "./types";

export const migration: Migration = {
  version: 3,
  name: "profiles and custom lists",
  statements: [
    `CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS profile_watchlist (
      profile_id TEXT NOT NULL,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      year INTEGER,
      rating REAL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (profile_id, media_id, media_type)
    )`,
    `CREATE TABLE IF NOT EXISTS profile_seen_movies (
      profile_id TEXT NOT NULL,
      movie_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      watched_at TEXT NOT NULL,
      PRIMARY KEY (profile_id, movie_id)
    )`,
    `CREATE TABLE IF NOT EXISTS profile_episode_progress (
      profile_id TEXT NOT NULL,
      series_id INTEGER NOT NULL,
      episode_id INTEGER NOT NULL,
      season_number INTEGER NOT NULL,
      episode_number INTEGER NOT NULL,
      watched INTEGER NOT NULL DEFAULT 1,
      watched_at TEXT,
      PRIMARY KEY (profile_id, series_id, episode_id)
    )`,
    `CREATE TABLE IF NOT EXISTS profile_tracked_series (
      profile_id TEXT NOT NULL,
      series_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      total_episodes INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (profile_id, series_id)
    )`,
    `INSERT OR IGNORE INTO profile_watchlist
      SELECT 'default', media_id, media_type, title, poster_path, backdrop_path, year, rating, created_at FROM watchlist`,
    `INSERT OR IGNORE INTO profile_seen_movies
      SELECT 'default', movie_id, title, poster_path, backdrop_path, watched_at FROM seen_movies`,
    `INSERT OR IGNORE INTO profile_episode_progress
      SELECT 'default', series_id, episode_id, season_number, episode_number, watched, watched_at FROM episode_progress`,
    `INSERT OR IGNORE INTO profile_tracked_series
      SELECT 'default', series_id, title, poster_path, backdrop_path, total_episodes, updated_at FROM tracked_series`,
    "CREATE INDEX IF NOT EXISTS idx_profile_watchlist_created ON profile_watchlist(profile_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_profile_episode_progress ON profile_episode_progress(profile_id, series_id, watched)",
    "CREATE INDEX IF NOT EXISTS idx_profile_tracked_series ON profile_tracked_series(profile_id, updated_at DESC)",
    `CREATE TABLE IF NOT EXISTS custom_lists (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS custom_list_items (
      list_id TEXT NOT NULL,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      position INTEGER NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (list_id, media_id, media_type)
    )`,
    "INSERT OR IGNORE INTO profiles (id, name, created_at) VALUES ('default', 'Principal', datetime('now'))",
    "CREATE INDEX IF NOT EXISTS idx_custom_lists_profile ON custom_lists(profile_id, updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_custom_list_items_position ON custom_list_items(list_id, position)",
  ],
};
