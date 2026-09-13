-- cinetrack:version 20
-- cinetrack:name add dismissed recommendations
-- cinetrack:statement
CREATE TABLE dismissed_recommendations (
  uuid TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
  media_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
  title TEXT NOT NULL,
  poster_path TEXT,
  dismissed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
-- cinetrack:statement
CREATE UNIQUE INDEX idx_dismissed_recommendations_unique ON dismissed_recommendations(profile_id, media_id, media_type)
-- cinetrack:statement
CREATE INDEX idx_dismissed_recommendations_profile ON dismissed_recommendations(profile_id, created_at DESC)
-- cinetrack:statement
CREATE TRIGGER sync_dismissed_recommendations_insert AFTER INSERT ON dismissed_recommendations
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.profile_id,'dismissed_recommendation',NEW.uuid,'upsert',json_object('uuid',NEW.uuid,'mediaId',NEW.media_id,'mediaType',NEW.media_type,'title',NEW.title,'posterPath',NEW.poster_path,'dismissedAt',NEW.dismissed_at,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='dismissed_recommendation' AND entity_id=NEW.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_dismissed_recommendations_update AFTER UPDATE ON dismissed_recommendations
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.profile_id,'dismissed_recommendation',NEW.uuid,'upsert',json_object('uuid',NEW.uuid,'mediaId',NEW.media_id,'mediaType',NEW.media_type,'title',NEW.title,'posterPath',NEW.poster_path,'dismissedAt',NEW.dismissed_at,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='dismissed_recommendation' AND entity_id=NEW.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_dismissed_recommendations_delete AFTER DELETE ON dismissed_recommendations
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),OLD.profile_id,'dismissed_recommendation',OLD.uuid,'delete',NULL,COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=OLD.profile_id AND entity_type='dismissed_recommendation' AND entity_id=OLD.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='delete',payload=NULL,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
