-- cinetrack:version 21
-- cinetrack:name sync activity log and episode ratings
-- Capture History (`activity_log`) the same way as the other profile-scoped
-- tables, and include `episode_progress.rating` in the outbox payload so a
-- 1-5 episode rating leaves this device.
-- cinetrack:statement
DROP TRIGGER IF EXISTS sync_episode_progress_insert
-- cinetrack:statement
DROP TRIGGER IF EXISTS sync_episode_progress_update
-- cinetrack:statement
DROP TRIGGER IF EXISTS sync_episode_progress_delete
-- cinetrack:statement
CREATE TRIGGER sync_episode_progress_insert AFTER INSERT ON episode_progress
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.profile_id,'episode_progress',NEW.uuid,'upsert',json_object('uuid',NEW.uuid,'seriesId',NEW.series_id,'episodeId',NEW.episode_id,'seasonNumber',NEW.season_number,'episodeNumber',NEW.episode_number,'watched',NEW.watched,'watchedAt',NEW.watched_at,'rating',NEW.rating,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='episode_progress' AND entity_id=NEW.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_episode_progress_update AFTER UPDATE ON episode_progress
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.profile_id,'episode_progress',NEW.uuid,'upsert',json_object('uuid',NEW.uuid,'seriesId',NEW.series_id,'episodeId',NEW.episode_id,'seasonNumber',NEW.season_number,'episodeNumber',NEW.episode_number,'watched',NEW.watched,'watchedAt',NEW.watched_at,'rating',NEW.rating,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='episode_progress' AND entity_id=NEW.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
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
-- cinetrack:statement
CREATE TRIGGER sync_activity_log_insert AFTER INSERT ON activity_log
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.profile_id,'activity_log',NEW.uuid,'upsert',json_object('uuid',NEW.uuid,'mediaId',NEW.media_id,'mediaType',NEW.media_type,'title',NEW.title,'action',NEW.action,'seasonNumber',NEW.season_number,'episodeNumber',NEW.episode_number,'episodeTitle',NEW.episode_title,'metadata',NEW.metadata,'timestamp',NEW.timestamp,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='activity_log' AND entity_id=NEW.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_activity_log_update AFTER UPDATE ON activity_log
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.profile_id,'activity_log',NEW.uuid,'upsert',json_object('uuid',NEW.uuid,'mediaId',NEW.media_id,'mediaType',NEW.media_type,'title',NEW.title,'action',NEW.action,'seasonNumber',NEW.season_number,'episodeNumber',NEW.episode_number,'episodeTitle',NEW.episode_title,'metadata',NEW.metadata,'timestamp',NEW.timestamp,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=NEW.profile_id AND entity_type='activity_log' AND entity_id=NEW.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='upsert',payload=excluded.payload,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
-- cinetrack:statement
CREATE TRIGGER sync_activity_log_delete AFTER DELETE ON activity_log
WHEN (SELECT suppress_outbox FROM sync_control WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at)
  VALUES(lower(hex(randomblob(16))),OLD.profile_id,'activity_log',OLD.uuid,'delete',NULL,COALESCE((SELECT remote_version FROM sync_entity_state WHERE profile_id=OLD.profile_id AND entity_type='activity_log' AND entity_id=OLD.uuid),0),strftime('%Y-%m-%dT%H:%M:%f','now')||'Z')
  ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET mutation_id=excluded.mutation_id,operation='delete',payload=NULL,base_version=excluded.base_version,created_at=excluded.created_at,attempt_count=0,last_error=NULL;
END
