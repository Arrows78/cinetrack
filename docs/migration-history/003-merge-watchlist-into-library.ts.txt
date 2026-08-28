import type { Migration } from "./types";

// Folds watchlist_items into library_items — the two tables had become
// near-duplicates (same unique key, watchlist_items a strict subset of
// library_items' columns) with no reconciliation between them; a
// `planned`-status library row already meant "to watch" everywhere else
// in the app (see watch-tonight-service.ts). Library always wins: a
// watchlist row is dropped whenever a library row already exists for the
// same (profile_id, media_id, media_type) — never overwrites real
// status/rating/notes/favourite. A watchlist-only row becomes a new
// `planned` library row, reusing its own uuid (safe: by construction no
// library row exists yet for that key, so no PK collision).
//
// Deliberately NOT touching activity_log or its CHECK constraint:
// existing 'watchlist:add'/'watchlist:remove' rows keep reading fine
// forever, and library.rs's add/remove paths now write those same two
// strings going forward too (see HistoryAction::LibraryAdd/LibraryRemove
// in history.rs, which keep the old wire strings on purpose) — only the
// Rust identifier changed, not the wire format, so no activity_log
// schema change is needed at all.
export const migration: Migration = {
  version: 10,
  name: "merge watchlist_items into library_items",
  statements: [
    `INSERT INTO library_items (
      uuid, profile_id, media_id, media_type, title, poster_path, backdrop_path, year, rating,
      genres, status, favourite, user_rating, notes, tags, started_at, completed_at, rewatch_count,
      created_at, updated_at
    )
    SELECT
      w.uuid, w.profile_id, w.media_id, w.media_type, w.title, w.poster_path, w.backdrop_path, w.year, w.rating,
      '[]', 'planned', 0, NULL, NULL, '[]', NULL, NULL, 0,
      w.created_at, w.updated_at
    FROM watchlist_items w
    WHERE NOT EXISTS (
      SELECT 1 FROM library_items l
      WHERE l.profile_id = w.profile_id AND l.media_id = w.media_id AND l.media_type = w.media_type
    )`,
    "DROP TABLE watchlist_items",
  ],
};
