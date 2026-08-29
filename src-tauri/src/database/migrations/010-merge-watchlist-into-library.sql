-- cinetrack:version 10
-- cinetrack:name merge watchlist_items into library_items
-- cinetrack:statement
INSERT INTO library_items (
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
)
-- cinetrack:statement
DROP TABLE watchlist_items
