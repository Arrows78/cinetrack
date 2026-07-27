import type { Migration } from "./types";

export const migration: Migration = {
  version: 2,
  name: "unified library, tags and viewing events",
  statements: [
    "ALTER TABLE activity_log ADD COLUMN metadata TEXT",
    `CREATE TABLE IF NOT EXISTS library_items (
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
      PRIMARY KEY (profile_id, media_id, media_type)
    )`,
    `CREATE TABLE IF NOT EXISTS viewing_events (
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
      episode_number INTEGER
    )`,
    `INSERT OR IGNORE INTO library_items (
      profile_id, media_id, media_type, title, poster_path, backdrop_path, year, rating, genres,
      status, favourite, tags, rewatch_count, created_at, updated_at
    )
    SELECT 'default', media_id, media_type, title, poster_path, backdrop_path, year, rating, '[]',
      'planned', 0, '[]', 0, created_at, created_at
    FROM watchlist`,
    "CREATE INDEX IF NOT EXISTS idx_library_profile_status ON library_items(profile_id, status, updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_library_favourite ON library_items(profile_id, favourite)",
    "CREATE INDEX IF NOT EXISTS idx_viewing_events_date ON viewing_events(profile_id, watched_at DESC)",
  ],
};
