-- cinetrack:version 24
-- cinetrack:name add library status origin
-- Records who set a library entry's current status: 'manual' (the viewer, from
-- the editor or a quick add) or 'auto' (the viewing auto-sync, see
-- library::repository::auto_sync_status_impl). Only an 'auto' Completed series
-- may be reopened automatically when TMDB reports more episodes than watched
-- (progress::repository::refresh_tracked_series_status_impl): a Completed the
-- viewer chose by hand is never overridden by a refresh.
--
-- Backfill is deliberately conservative. Existing rows default to 'manual'
-- (never reopened); only a Completed series whose recorded progress already
-- covers every episode of its cached total is marked 'auto', since auto-sync is
-- the only thing that could have produced that state and reopening it once new
-- episodes appear can only be right. A Completed series with episodes missing
-- stays 'manual'.
--
-- The column travels in the sync payload, so the two library_items upsert
-- triggers are recreated to carry it (statements below). The backfill runs
-- with those triggers dropped so it does not queue a mutation per row.
-- cinetrack:statement
ALTER TABLE library_items ADD COLUMN status_origin TEXT NOT NULL DEFAULT 'manual' CHECK (status_origin IN ('manual','auto'))
-- cinetrack:statement
DROP TRIGGER sync_library_items_insert
-- cinetrack:statement
DROP TRIGGER sync_library_items_update
-- cinetrack:statement
UPDATE library_items SET status_origin = 'auto'
WHERE media_type = 'series' AND status = 'completed'
  AND (SELECT COUNT(*) FROM episode_progress ep
       WHERE ep.profile_id = library_items.profile_id AND ep.series_id = library_items.media_id
         AND ep.watched = 1 AND ep.season_number > 0) >= 1
  AND (SELECT COUNT(*) FROM episode_progress ep
       WHERE ep.profile_id = library_items.profile_id AND ep.series_id = library_items.media_id
         AND ep.watched = 1 AND ep.season_number > 0)
      >= COALESCE((SELECT ts.total_episodes FROM tracked_series ts
                   WHERE ts.profile_id = library_items.profile_id AND ts.series_id = library_items.media_id), 0)
-- cinetrack:statement
CREATE TRIGGER sync_library_items_insert AFTER INSERT ON library_items
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id, profile_id, entity_type, entity_id, operation, payload, base_version, created_at)
  VALUES (
    lower(hex(randomblob(16))), NEW.profile_id, 'library_item', NEW.uuid, 'upsert',
    json_object(
      'uuid', NEW.uuid, 'mediaId', NEW.media_id, 'mediaType', NEW.media_type,
      'title', NEW.title, 'posterPath', NEW.poster_path, 'backdropPath', NEW.backdrop_path,
      'year', NEW.year, 'rating', NEW.rating, 'genres', NEW.genres, 'status', NEW.status,
      'statusOrigin', NEW.status_origin,
      'favourite', NEW.favourite, 'userRating', NEW.user_rating, 'notes', NEW.notes,
      'tags', NEW.tags, 'startedAt', NEW.started_at, 'completedAt', NEW.completed_at,
      'rewatchCount', NEW.rewatch_count, 'createdAt', NEW.created_at, 'updatedAt', NEW.updated_at
    ),
    COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='library_item' AND entity_id=NEW.uuid), 0),
    strftime('%Y-%m-%dT%H:%M:%f', 'now') || 'Z'
  ) ON CONFLICT(profile_id, entity_type, entity_id) DO UPDATE SET
    mutation_id=excluded.mutation_id, operation=excluded.operation, payload=excluded.payload,
    base_version=excluded.base_version, created_at=excluded.created_at, attempt_count=0, last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_library_items_update AFTER UPDATE ON library_items
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id, profile_id, entity_type, entity_id, operation, payload, base_version, created_at)
  VALUES (
    lower(hex(randomblob(16))), NEW.profile_id, 'library_item', NEW.uuid, 'upsert',
    json_object(
      'uuid', NEW.uuid, 'mediaId', NEW.media_id, 'mediaType', NEW.media_type,
      'title', NEW.title, 'posterPath', NEW.poster_path, 'backdropPath', NEW.backdrop_path,
      'year', NEW.year, 'rating', NEW.rating, 'genres', NEW.genres, 'status', NEW.status,
      'statusOrigin', NEW.status_origin,
      'favourite', NEW.favourite, 'userRating', NEW.user_rating, 'notes', NEW.notes,
      'tags', NEW.tags, 'startedAt', NEW.started_at, 'completedAt', NEW.completed_at,
      'rewatchCount', NEW.rewatch_count, 'createdAt', NEW.created_at, 'updatedAt', NEW.updated_at
    ),
    COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='library_item' AND entity_id=NEW.uuid), 0),
    strftime('%Y-%m-%dT%H:%M:%f', 'now') || 'Z'
  ) ON CONFLICT(profile_id, entity_type, entity_id) DO UPDATE SET
    mutation_id=excluded.mutation_id, operation=excluded.operation, payload=excluded.payload,
    base_version=excluded.base_version, created_at=excluded.created_at, attempt_count=0, last_error=NULL;
END
