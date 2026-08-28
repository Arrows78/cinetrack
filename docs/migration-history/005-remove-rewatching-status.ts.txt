import type { Migration } from "./types";

// SQLite can't ALTER a CHECK constraint in place — dropping 'rewatching'
// from library_items.status needs the standard rebuild: a new table with
// the narrower CHECK, every row copied across (remapping any existing
// 'rewatching' row to 'watching' — an audit found this status carried no
// behavior distinct from watching/completed; it was a selectable label
// only, unrelated to the separate rewatch_count field that actually powers
// rewatch tracking), drop the old table, rename, recreate its indexes.
export const migration: Migration = {
  version: 12,
  name: "remove the rewatching library status",
  statements: [
    `CREATE TABLE library_items_new (
      uuid TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      year INTEGER CHECK (year IS NULL OR year > 1800),
      rating REAL CHECK (rating IS NULL OR (rating >= 0 AND rating <= 10)),
      genres TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned','watching','paused','completed','dropped')),
      favourite INTEGER NOT NULL DEFAULT 0 CHECK (favourite IN (0,1)),
      user_rating REAL CHECK (user_rating IS NULL OR (user_rating >= 1 AND user_rating <= 10)),
      notes TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      started_at TEXT,
      completed_at TEXT,
      rewatch_count INTEGER NOT NULL DEFAULT 0 CHECK (rewatch_count >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (profile_id, media_id, media_type)
    )`,
    `INSERT INTO library_items_new
     SELECT uuid, profile_id, media_id, media_type, title, poster_path, backdrop_path, year, rating,
            genres, CASE WHEN status = 'rewatching' THEN 'watching' ELSE status END, favourite, user_rating,
            notes, tags, started_at, completed_at, rewatch_count, created_at, updated_at
     FROM library_items`,
    "DROP TABLE library_items",
    "ALTER TABLE library_items_new RENAME TO library_items",
    "CREATE INDEX idx_library_profile_status ON library_items(profile_id, status, updated_at DESC)",
    "CREATE INDEX idx_library_profile_updated ON library_items(profile_id, updated_at DESC)",
    "CREATE INDEX idx_library_media_id ON library_items(media_id, media_type)",
  ],
};
