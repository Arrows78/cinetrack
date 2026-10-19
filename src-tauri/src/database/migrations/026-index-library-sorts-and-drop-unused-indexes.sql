-- cinetrack:version 26
-- cinetrack:name index library sorts and drop unused indexes
-- Two library page sorts ("date added", "date completed") had no index, so
-- every page read the whole profile and sorted it. They get one each, with the
-- same `media_id, media_type` tie-break as the other sorts so the keyset
-- cursor stays an index range.
-- cinetrack:statement
CREATE INDEX idx_library_profile_created ON library_items(profile_id, created_at DESC, media_id DESC, media_type DESC)
-- cinetrack:statement
CREATE INDEX idx_library_profile_completed_cursor ON library_items(profile_id, COALESCE(completed_at, '') DESC, media_id DESC, media_type DESC)
-- A status filter followed by the page order (`updated_at DESC, media_id DESC,
-- media_type DESC`) could only use the status index for the filter and sorted,
-- or walked the whole `updated_at` index and discarded the other statuses.
-- Extending it with the tie-break columns makes the filter and the order one
-- index range (a status read, a rare status, "planned for too long", the
-- recommendation seed). The counts per status still read it as a covering
-- index.
-- cinetrack:statement
DROP INDEX IF EXISTS idx_library_profile_status
-- cinetrack:statement
CREATE INDEX idx_library_profile_status ON library_items(profile_id, status, updated_at DESC, media_id DESC, media_type DESC)
-- Indexes no query reads. Every one of them is also written on every insert and
-- update of its table, which is most of what an import or a long viewing
-- session costs.
--   - the `media_id` / `episode_id` / `series_id` / `movie_id` indexes: every
--     read of these tables names the profile (or the list) first, and is served
--     by that table's unique key;
--   - `idx_viewing_events_profile_media_episode_date`: replaced by the log-order
--     index of migration 25 when the current-state reads stopped ordering by date;
--   - `idx_seen_movies_profile_watched`: nothing lists seen movies by date any
--     more (the statistics read the viewing log);
--   - `idx_tracked_series_profile_updated`: the tracked-series list orders its
--     rows after counting each series' episodes, so it sorts whatever the
--     index would have ordered;
--   - `idx_availability_alerts_enabled`: nothing filters alerts on `enabled`;
--   - `idx_sync_entity_state_profile`: the same columns, in the same order, as
--     the table's primary key.
-- cinetrack:statement
DROP INDEX IF EXISTS idx_library_media_id
-- cinetrack:statement
DROP INDEX IF EXISTS idx_tracked_series_series_id
-- cinetrack:statement
DROP INDEX IF EXISTS idx_episode_progress_episode_id
-- cinetrack:statement
DROP INDEX IF EXISTS idx_custom_list_items_media_id
-- cinetrack:statement
DROP INDEX IF EXISTS idx_viewing_events_media_id
-- cinetrack:statement
DROP INDEX IF EXISTS idx_viewing_events_profile_media_episode_date
-- cinetrack:statement
DROP INDEX IF EXISTS idx_activity_log_media_id
-- cinetrack:statement
DROP INDEX IF EXISTS idx_seen_movies_movie_id
-- cinetrack:statement
DROP INDEX IF EXISTS idx_seen_movies_profile_watched
-- cinetrack:statement
DROP INDEX IF EXISTS idx_tracked_series_profile_updated
-- cinetrack:statement
DROP INDEX IF EXISTS idx_availability_alerts_enabled
-- cinetrack:statement
DROP INDEX IF EXISTS idx_sync_entity_state_profile
