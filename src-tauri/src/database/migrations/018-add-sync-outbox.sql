-- cinetrack:version 18
-- cinetrack:name add cloud sync outbox and change capture
--
-- The outbox is populated by SQLite triggers. Because triggers run inside
-- the caller's transaction, a business mutation and its sync mutation can
-- never commit independently. `sync_control.suppress_outbox` is enabled only
-- while applying trusted changes downloaded from Supabase.

-- cinetrack:statement
CREATE TABLE sync_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  suppress_outbox INTEGER NOT NULL DEFAULT 0 CHECK (suppress_outbox IN (0,1))
)
-- cinetrack:statement
INSERT OR IGNORE INTO sync_control (id, suppress_outbox) VALUES (1, 0)
-- cinetrack:statement
CREATE TABLE sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
-- cinetrack:statement
CREATE TABLE sync_entity_state (
  profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  remote_version INTEGER NOT NULL DEFAULT 0 CHECK (remote_version >= 0),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, entity_type, entity_id)
)
-- cinetrack:statement
CREATE TABLE sync_outbox (
  mutation_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert','delete')),
  payload TEXT,
  base_version INTEGER NOT NULL DEFAULT 0 CHECK (base_version >= 0),
  created_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  UNIQUE (profile_id, entity_type, entity_id)
)
-- cinetrack:statement
CREATE INDEX idx_sync_outbox_profile_created ON sync_outbox(profile_id, created_at, mutation_id)
-- cinetrack:statement
CREATE INDEX idx_sync_entity_state_profile ON sync_entity_state(profile_id, entity_type, entity_id)

-- ---------------------------------------------------------------------------
-- library_items
-- ---------------------------------------------------------------------------
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
CREATE TRIGGER sync_library_items_delete AFTER DELETE ON library_items
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id, profile_id, entity_type, entity_id, operation, payload, base_version, created_at)
  VALUES (
    lower(hex(randomblob(16))), OLD.profile_id, 'library_item', OLD.uuid, 'delete', NULL,
    COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=OLD.profile_id AND entity_type='library_item' AND entity_id=OLD.uuid), 0),
    strftime('%Y-%m-%dT%H:%M:%f', 'now') || 'Z'
  ) ON CONFLICT(profile_id, entity_type, entity_id) DO UPDATE SET
    mutation_id=excluded.mutation_id, operation='delete', payload=NULL,
    base_version=excluded.base_version, created_at=excluded.created_at, attempt_count=0, last_error=NULL;
END

-- ---------------------------------------------------------------------------
-- seen_movies
-- ---------------------------------------------------------------------------
-- cinetrack:statement
CREATE TRIGGER sync_seen_movies_insert AFTER INSERT ON seen_movies
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id, profile_id, entity_type, entity_id, operation, payload, base_version, created_at)
  VALUES (lower(hex(randomblob(16))), NEW.profile_id, 'seen_movie', NEW.uuid, 'upsert',
    json_object('uuid',NEW.uuid,'movieId',NEW.movie_id,'title',NEW.title,'posterPath',NEW.poster_path,'backdropPath',NEW.backdrop_path,'watchedAt',NEW.watched_at,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),
    COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='seen_movie' AND entity_id=NEW.uuid),0), strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_seen_movies_update AFTER UPDATE ON seen_movies
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id, profile_id, entity_type, entity_id, operation, payload, base_version, created_at)
  VALUES (lower(hex(randomblob(16))), NEW.profile_id, 'seen_movie', NEW.uuid, 'upsert',
    json_object('uuid',NEW.uuid,'movieId',NEW.movie_id,'title',NEW.title,'posterPath',NEW.poster_path,'backdropPath',NEW.backdrop_path,'watchedAt',NEW.watched_at,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),
    COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='seen_movie' AND entity_id=NEW.uuid),0), strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_seen_movies_delete AFTER DELETE ON seen_movies
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id, profile_id, entity_type, entity_id, operation, payload, base_version, created_at)
  VALUES (lower(hex(randomblob(16))), OLD.profile_id, 'seen_movie', OLD.uuid, 'delete', NULL,
    COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=OLD.profile_id AND entity_type='seen_movie' AND entity_id=OLD.uuid),0), strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='delete',payload=NULL,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END

-- ---------------------------------------------------------------------------
-- episode_progress
-- ---------------------------------------------------------------------------
-- cinetrack:statement
CREATE TRIGGER sync_episode_progress_insert AFTER INSERT ON episode_progress
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.profile_id,'episode_progress',NEW.uuid,'upsert',json_object('uuid',NEW.uuid,'seriesId',NEW.series_id,'episodeId',NEW.episode_id,'seasonNumber',NEW.season_number,'episodeNumber',NEW.episode_number,'watched',NEW.watched,'watchedAt',NEW.watched_at,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='episode_progress' AND entity_id=NEW.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_episode_progress_update AFTER UPDATE ON episode_progress
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.profile_id,'episode_progress',NEW.uuid,'upsert',json_object('uuid',NEW.uuid,'seriesId',NEW.series_id,'episodeId',NEW.episode_id,'seasonNumber',NEW.season_number,'episodeNumber',NEW.episode_number,'watched',NEW.watched,'watchedAt',NEW.watched_at,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='episode_progress' AND entity_id=NEW.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_episode_progress_delete AFTER DELETE ON episode_progress
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),OLD.profile_id,'episode_progress',OLD.uuid,'delete',NULL,COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=OLD.profile_id AND entity_type='episode_progress' AND entity_id=OLD.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='delete',payload=NULL,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END

-- ---------------------------------------------------------------------------
-- tracked_series
-- ---------------------------------------------------------------------------
-- cinetrack:statement
CREATE TRIGGER sync_tracked_series_insert AFTER INSERT ON tracked_series
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.profile_id,'tracked_series',NEW.uuid,'upsert',json_object('uuid',NEW.uuid,'seriesId',NEW.series_id,'title',NEW.title,'posterPath',NEW.poster_path,'backdropPath',NEW.backdrop_path,'totalEpisodes',NEW.total_episodes,'status',NEW.status,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='tracked_series' AND entity_id=NEW.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_tracked_series_update AFTER UPDATE ON tracked_series
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.profile_id,'tracked_series',NEW.uuid,'upsert',json_object('uuid',NEW.uuid,'seriesId',NEW.series_id,'title',NEW.title,'posterPath',NEW.poster_path,'backdropPath',NEW.backdrop_path,'totalEpisodes',NEW.total_episodes,'status',NEW.status,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='tracked_series' AND entity_id=NEW.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_tracked_series_delete AFTER DELETE ON tracked_series
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),OLD.profile_id,'tracked_series',OLD.uuid,'delete',NULL,COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=OLD.profile_id AND entity_type='tracked_series' AND entity_id=OLD.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='delete',payload=NULL,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END

-- ---------------------------------------------------------------------------
-- viewing_events (append-like, but delete is still represented for undo/import)
-- ---------------------------------------------------------------------------
-- cinetrack:statement
CREATE TRIGGER sync_viewing_events_insert AFTER INSERT ON viewing_events
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.profile_id,'viewing_event',NEW.uuid,'upsert',json_object('uuid',NEW.uuid,'mediaId',NEW.media_id,'mediaType',NEW.media_type,'title',NEW.title,'eventType',NEW.event_type,'watchedAt',NEW.watched_at,'durationMinutes',NEW.duration_minutes,'episodeId',NEW.episode_id,'seasonNumber',NEW.season_number,'episodeNumber',NEW.episode_number,'note',NEW.note,'createdAt',NEW.created_at),COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='viewing_event' AND entity_id=NEW.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_viewing_events_delete AFTER DELETE ON viewing_events
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),OLD.profile_id,'viewing_event',OLD.uuid,'delete',NULL,COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=OLD.profile_id AND entity_type='viewing_event' AND entity_id=OLD.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='delete',payload=NULL,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END

-- ---------------------------------------------------------------------------
-- custom_lists and custom_list_items
-- ---------------------------------------------------------------------------
-- cinetrack:statement
CREATE TRIGGER sync_custom_lists_insert AFTER INSERT ON custom_lists
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.profile_id,'custom_list',NEW.uuid,'upsert',json_object('uuid',NEW.uuid,'name',NEW.name,'description',NEW.description,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='custom_list' AND entity_id=NEW.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_custom_lists_update AFTER UPDATE ON custom_lists
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.profile_id,'custom_list',NEW.uuid,'upsert',json_object('uuid',NEW.uuid,'name',NEW.name,'description',NEW.description,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='custom_list' AND entity_id=NEW.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_custom_lists_delete BEFORE DELETE ON custom_lists
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),OLD.profile_id,'custom_list',OLD.uuid,'delete',NULL,COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=OLD.profile_id AND entity_type='custom_list' AND entity_id=OLD.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='delete',payload=NULL,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_custom_list_items_insert AFTER INSERT ON custom_list_items
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  SELECT lower(hex(randomblob(16))),l.profile_id,'custom_list_item',NEW.uuid,'upsert',json_object('uuid',NEW.uuid,'listId',NEW.list_id,'mediaId',NEW.media_id,'mediaType',NEW.media_type,'title',NEW.title,'posterPath',NEW.poster_path,'position',NEW.position,'addedAt',NEW.added_at,'updatedAt',NEW.updated_at),COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=l.profile_id AND entity_type='custom_list_item' AND entity_id=NEW.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z'
  FROM custom_lists l WHERE l.uuid=NEW.list_id
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_custom_list_items_update AFTER UPDATE ON custom_list_items
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  SELECT lower(hex(randomblob(16))),l.profile_id,'custom_list_item',NEW.uuid,'upsert',json_object('uuid',NEW.uuid,'listId',NEW.list_id,'mediaId',NEW.media_id,'mediaType',NEW.media_type,'title',NEW.title,'posterPath',NEW.poster_path,'position',NEW.position,'addedAt',NEW.added_at,'updatedAt',NEW.updated_at),COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=l.profile_id AND entity_type='custom_list_item' AND entity_id=NEW.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z'
  FROM custom_lists l WHERE l.uuid=NEW.list_id
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_custom_list_items_delete BEFORE DELETE ON custom_list_items
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  SELECT lower(hex(randomblob(16))),l.profile_id,'custom_list_item',OLD.uuid,'delete',NULL,COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=l.profile_id AND entity_type='custom_list_item' AND entity_id=OLD.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z'
  FROM custom_lists l WHERE l.uuid=OLD.list_id
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='delete',payload=NULL,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END

-- ---------------------------------------------------------------------------
-- smart_lists / saved_filters / availability_alerts
-- ---------------------------------------------------------------------------
-- cinetrack:statement
CREATE TRIGGER sync_smart_lists_insert AFTER INSERT ON smart_lists
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.profile_id,'smart_list',NEW.uuid,'upsert',json_object('uuid',NEW.uuid,'name',NEW.name,'rules',NEW.rules,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='smart_list' AND entity_id=NEW.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_smart_lists_update AFTER UPDATE ON smart_lists
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.profile_id,'smart_list',NEW.uuid,'upsert',json_object('uuid',NEW.uuid,'name',NEW.name,'rules',NEW.rules,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='smart_list' AND entity_id=NEW.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_smart_lists_delete AFTER DELETE ON smart_lists
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),OLD.profile_id,'smart_list',OLD.uuid,'delete',NULL,COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=OLD.profile_id AND entity_type='smart_list' AND entity_id=OLD.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='delete',payload=NULL,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_saved_filters_insert AFTER INSERT ON saved_filters
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.profile_id,'saved_filter',NEW.uuid,'upsert',json_object('uuid',NEW.uuid,'page',NEW.page,'name',NEW.name,'filters',NEW.filters,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='saved_filter' AND entity_id=NEW.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_saved_filters_delete AFTER DELETE ON saved_filters
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),OLD.profile_id,'saved_filter',OLD.uuid,'delete',NULL,COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=OLD.profile_id AND entity_type='saved_filter' AND entity_id=OLD.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='delete',payload=NULL,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_availability_alerts_insert AFTER INSERT ON availability_alerts
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.profile_id,'availability_alert',NEW.uuid,'upsert',json_object('uuid',NEW.uuid,'mediaId',NEW.media_id,'mediaType',NEW.media_type,'title',NEW.title,'region',NEW.region,'providerIds',NEW.provider_ids,'enabled',NEW.enabled,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='availability_alert' AND entity_id=NEW.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_availability_alerts_update AFTER UPDATE ON availability_alerts
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.profile_id,'availability_alert',NEW.uuid,'upsert',json_object('uuid',NEW.uuid,'mediaId',NEW.media_id,'mediaType',NEW.media_type,'title',NEW.title,'region',NEW.region,'providerIds',NEW.provider_ids,'enabled',NEW.enabled,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='availability_alert' AND entity_id=NEW.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_availability_alerts_delete AFTER DELETE ON availability_alerts
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),OLD.profile_id,'availability_alert',OLD.uuid,'delete',NULL,COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=OLD.profile_id AND entity_type='availability_alert' AND entity_id=OLD.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='delete',payload=NULL,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END

