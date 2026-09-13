use sqlx::{Sqlite, SqlitePool, Transaction};

use crate::database::{current_profile_id, new_uuid, now_iso};
use crate::error::ApiError;
use crate::preferences::ACCOUNT_SCOPE_PREFERENCE_KEYS;

use super::models::{
    RemoteSyncChange, SyncConflict, SyncMutationAck, SyncOutboxMutation, SyncStatus,
    validate_entity_type,
};

const DEVICE_ID_KEY: &str = "deviceId";

// Shared between rebase_conflicts (which writes it) and status (which counts
// rows matching it) — see CLAUDE.md's "No hand-duplicated literal lists".
const CONFLICT_MARKER: &str = "optimistic conflict; rebased";

fn cursor_key(profile_id: &str) -> String {
    format!("cursor:{profile_id}")
}

fn bootstrap_key(profile_id: &str) -> String {
    format!("bootstrap:{profile_id}")
}

fn last_synced_key(profile_id: &str) -> String {
    format!("lastSyncedAt:{profile_id}")
}

pub async fn device_id(pool: &SqlitePool) -> Result<String, ApiError> {
    if let Some((value,)) =
        sqlx::query_as::<_, (String,)>("SELECT value FROM sync_metadata WHERE key = ?1")
            .bind(DEVICE_ID_KEY)
            .fetch_optional(pool)
            .await
            .map_err(ApiError::from)?
    {
        return Ok(value);
    }

    let value = new_uuid();
    let now = now_iso(pool).await?;
    sqlx::query(
        "INSERT INTO sync_metadata(key, value, updated_at) VALUES (?1, ?2, ?3) \
         ON CONFLICT(key) DO NOTHING",
    )
    .bind(DEVICE_ID_KEY)
    .bind(&value)
    .bind(now)
    .execute(pool)
    .await
    .map_err(ApiError::from)?;

    let (stored,): (String,) = sqlx::query_as("SELECT value FROM sync_metadata WHERE key = ?1")
        .bind(DEVICE_ID_KEY)
        .fetch_one(pool)
        .await
        .map_err(ApiError::from)?;
    Ok(stored)
}

pub async fn prepare(pool: &SqlitePool) -> Result<(), ApiError> {
    let profile_id = current_profile_id(pool).await?;
    let key = bootstrap_key(&profile_id);
    let already_done: Option<(String,)> =
        sqlx::query_as("SELECT value FROM sync_metadata WHERE key = ?1")
            .bind(&key)
            .fetch_optional(pool)
            .await
            .map_err(ApiError::from)?;
    if already_done.is_some() {
        return Ok(());
    }

    // No-op updates intentionally fire migration 018's AFTER UPDATE triggers,
    // turning all pre-sync data into a first outbox snapshot without changing
    // user-visible timestamps or touching every historical service method.
    let mut tx = pool.begin().await.map_err(ApiError::from)?;
    for table in [
        "library_items",
        "seen_movies",
        "episode_progress",
        "tracked_series",
        "custom_lists",
        "smart_lists",
        "availability_alerts",
        "dismissed_recommendations",
    ] {
        let query = format!("UPDATE {table} SET uuid = uuid WHERE profile_id = ?1");
        sqlx::query(sqlx::AssertSqlSafe(query))
            .bind(&profile_id)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from)?;
    }
    // viewing_events has no UPDATE capture because it is append-like.
    // Insert its legacy rows directly into the outbox with the exact payload
    // shape used by its INSERT trigger.
    sqlx::query(
        "INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at) \
         SELECT lower(hex(randomblob(16))),profile_id,'viewing_event',uuid,'upsert', \
           json_object('uuid',uuid,'mediaId',media_id,'mediaType',media_type,'title',title,'eventType',event_type,'watchedAt',watched_at,'durationMinutes',duration_minutes,'episodeId',episode_id,'seasonNumber',season_number,'episodeNumber',episode_number,'note',note,'createdAt',created_at), \
           COALESCE((SELECT remote_version FROM sync_entity_state s WHERE s.profile_id=viewing_events.profile_id AND s.entity_type='viewing_event' AND s.entity_id=viewing_events.uuid),0), \
           strftime('%Y-%m-%dT%H:%M:%f','now')||'Z' \
         FROM viewing_events WHERE profile_id=?1 \
         ON CONFLICT(profile_id,entity_type,entity_id) DO NOTHING",
    )
    .bind(&profile_id)
    .execute(&mut *tx)
    .await
    .map_err(ApiError::from)?;

    // Child rows scope through their parent list.
    sqlx::query(
        "UPDATE custom_list_items SET uuid = uuid WHERE list_id IN \
         (SELECT uuid FROM custom_lists WHERE profile_id = ?1)",
    )
    .bind(&profile_id)
    .execute(&mut *tx)
    .await
    .map_err(ApiError::from)?;

    // saved_filters currently has create/delete but no edit path in the UI;
    // seed existing rows directly.
    sqlx::query(
        "INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at) \
         SELECT lower(hex(randomblob(16))),profile_id,'saved_filter',uuid,'upsert', \
           json_object('uuid',uuid,'page',page,'name',name,'filters',filters,'createdAt',created_at,'updatedAt',updated_at), \
           COALESCE((SELECT remote_version FROM sync_entity_state s WHERE s.profile_id=saved_filters.profile_id AND s.entity_type='saved_filter' AND s.entity_id=saved_filters.uuid),0), \
           strftime('%Y-%m-%dT%H:%M:%f','now')||'Z' \
         FROM saved_filters WHERE profile_id=?1 \
         ON CONFLICT(profile_id,entity_type,entity_id) DO NOTHING",
    )
    .bind(&profile_id)
    .execute(&mut *tx)
    .await
    .map_err(ApiError::from)?;

    // Preferences have no profile_id column of their own (see
    // upsert_entity's account_preferences arm) and no per-row identity
    // beyond `key` — scope this bootstrap read to the account-scope keys
    // only, via the same list `write_preference` gates new writes on, so a
    // device-only setting (theme, backupDirectory, activeProfileId, ...)
    // never leaves this install just because sync happened to be turned on.
    let account_preference_keys = ACCOUNT_SCOPE_PREFERENCE_KEYS
        .iter()
        .map(|key| format!("'{key}'"))
        .collect::<Vec<_>>()
        .join(",");
    let account_preferences_query = format!(
        "INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at) \
         SELECT lower(hex(randomblob(16))),?1,'account_preferences',key,'upsert', \
           json_object('key',key,'value',value,'updatedAt',updated_at), \
           COALESCE((SELECT remote_version FROM sync_entity_state s WHERE s.profile_id=?1 AND s.entity_type='account_preferences' AND s.entity_id=preferences.key),0), \
           strftime('%Y-%m-%dT%H:%M:%f','now')||'Z' \
         FROM preferences WHERE key IN ({account_preference_keys}) \
         ON CONFLICT(profile_id,entity_type,entity_id) DO NOTHING"
    );
    sqlx::query(sqlx::AssertSqlSafe(account_preferences_query))
        .bind(&profile_id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;

    let now = now_iso(&mut *tx).await?;
    sqlx::query("INSERT INTO sync_metadata(key,value,updated_at) VALUES (?1,'1',?2)")
        .bind(key)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;
    tx.commit().await.map_err(ApiError::from)
}

pub async fn cursor(pool: &SqlitePool) -> Result<i64, ApiError> {
    let profile_id = current_profile_id(pool).await?;
    let value: Option<(String,)> = sqlx::query_as("SELECT value FROM sync_metadata WHERE key=?1")
        .bind(cursor_key(&profile_id))
        .fetch_optional(pool)
        .await
        .map_err(ApiError::from)?;
    Ok(value.and_then(|(v,)| v.parse().ok()).unwrap_or(0))
}

pub async fn status(pool: &SqlitePool) -> Result<SyncStatus, ApiError> {
    let profile_id = current_profile_id(pool).await?;
    let pending_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sync_outbox WHERE profile_id=?1")
            .bind(&profile_id)
            .fetch_one(pool)
            .await
            .map_err(ApiError::from)?;
    let failed_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sync_outbox WHERE profile_id=?1 AND last_error IS NOT NULL",
    )
    .bind(&profile_id)
    .fetch_one(pool)
    .await
    .map_err(ApiError::from)?;
    let conflict_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sync_outbox WHERE profile_id=?1 AND last_error=?2",
    )
    .bind(&profile_id)
    .bind(CONFLICT_MARKER)
    .fetch_one(pool)
    .await
    .map_err(ApiError::from)?;
    let last_synced_at: Option<(String,)> =
        sqlx::query_as("SELECT value FROM sync_metadata WHERE key=?1")
            .bind(last_synced_key(&profile_id))
            .fetch_optional(pool)
            .await
            .map_err(ApiError::from)?;
    Ok(SyncStatus {
        device_id: device_id(pool).await?,
        cursor: cursor(pool).await?,
        pending_count,
        failed_count,
        conflict_count,
        last_synced_at: last_synced_at.map(|(value,)| value),
    })
}

/// Records that a sync round just completed successfully — called from the
/// TS orchestrator (sync-service.ts's execute()) after a push+pull round,
/// regardless of whether it moved any rows, so "last synced" reflects the
/// last successful check-in rather than only the last one with changes.
pub async fn mark_synced(pool: &SqlitePool) -> Result<(), ApiError> {
    let profile_id = current_profile_id(pool).await?;
    let now = now_iso(pool).await?;
    sqlx::query(
        "INSERT INTO sync_metadata(key,value,updated_at) VALUES(?1,?2,?3) \
         ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
    )
    .bind(last_synced_key(&profile_id))
    .bind(&now)
    .bind(now)
    .execute(pool)
    .await
    .map_err(ApiError::from)?;
    Ok(())
}

/// (mutation_id, entity_type, entity_id, operation, payload, base_version, created_at, attempt_count)
type OutboxRow = (
    String,
    String,
    String,
    String,
    Option<String>,
    i64,
    String,
    i64,
);

pub async fn list_outbox(
    pool: &SqlitePool,
    limit: i64,
) -> Result<Vec<SyncOutboxMutation>, ApiError> {
    let profile_id = current_profile_id(pool).await?;
    let limit = limit.clamp(1, 200);
    let rows: Vec<OutboxRow> = sqlx::query_as(
        "SELECT mutation_id,entity_type,entity_id,operation,payload,base_version,created_at,attempt_count \
         FROM sync_outbox WHERE profile_id=?1 \
         ORDER BY created_at ASC, \
           CASE entity_type WHEN 'custom_list' THEN 0 WHEN 'custom_list_item' THEN 2 ELSE 1 END ASC, \
           mutation_id ASC LIMIT ?2",
    ).bind(profile_id).bind(limit).fetch_all(pool).await.map_err(ApiError::from)?;

    rows.into_iter()
        .map(|row| {
            let payload = row
                .4
                .map(|raw| serde_json::from_str(&raw))
                .transpose()
                .map_err(|error| ApiError::internal(format!("Invalid sync payload: {error}")))?;
            Ok(SyncOutboxMutation {
                mutation_id: row.0,
                entity_type: row.1,
                entity_id: row.2,
                operation: row.3,
                payload,
                base_version: row.5,
                created_at: row.6,
                attempt_count: row.7,
            })
        })
        .collect()
}

pub async fn ack_mutations(pool: &SqlitePool, acks: &[SyncMutationAck]) -> Result<(), ApiError> {
    let profile_id = current_profile_id(pool).await?;
    let mut tx = pool.begin().await.map_err(ApiError::from)?;
    for ack in acks {
        if !validate_entity_type(&ack.entity_type) || ack.version <= 0 {
            continue;
        }
        let now = now_iso(&mut *tx).await?;
        sqlx::query(
            "INSERT INTO sync_entity_state(profile_id,entity_type,entity_id,remote_version,deleted,updated_at) \
             VALUES(?1,?2,?3,?4,0,?5) ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET \
             remote_version=excluded.remote_version,deleted=0,updated_at=excluded.updated_at",
        ).bind(&profile_id).bind(&ack.entity_type).bind(&ack.entity_id).bind(ack.version).bind(now)
         .execute(&mut *tx).await.map_err(ApiError::from)?;

        sqlx::query("DELETE FROM sync_outbox WHERE profile_id=?1 AND mutation_id=?2")
            .bind(&profile_id)
            .bind(&ack.mutation_id)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from)?;
        // If a newer local change replaced the in-flight mutation id, rebase
        // it onto the just-acknowledged cloud version instead of deleting it.
        sqlx::query(
            "UPDATE sync_outbox SET base_version=?1 WHERE profile_id=?2 AND entity_type=?3 AND entity_id=?4",
        ).bind(ack.version).bind(&profile_id).bind(&ack.entity_type).bind(&ack.entity_id)
         .execute(&mut *tx).await.map_err(ApiError::from)?;
    }
    tx.commit().await.map_err(ApiError::from)
}

pub async fn rebase_conflicts(
    pool: &SqlitePool,
    conflicts: &[SyncConflict],
) -> Result<(), ApiError> {
    let profile_id = current_profile_id(pool).await?;
    let mut tx = pool.begin().await.map_err(ApiError::from)?;
    for conflict in conflicts {
        if !validate_entity_type(&conflict.entity_type) || conflict.server_version < 0 {
            continue;
        }
        sqlx::query(
            "UPDATE sync_outbox SET base_version=?1,attempt_count=attempt_count+1,last_error=?2 \
             WHERE profile_id=?3 AND mutation_id=?4 AND entity_type=?5 AND entity_id=?6",
        )
        .bind(conflict.server_version)
        .bind(CONFLICT_MARKER)
        .bind(&profile_id)
        .bind(&conflict.mutation_id)
        .bind(&conflict.entity_type)
        .bind(&conflict.entity_id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;
    }
    tx.commit().await.map_err(ApiError::from)
}

async fn delete_entity(
    tx: &mut Transaction<'_, Sqlite>,
    profile_id: &str,
    entity_type: &str,
    entity_id: &str,
) -> Result<(), ApiError> {
    let sql = match entity_type {
        "library_item" => "DELETE FROM library_items WHERE profile_id=?1 AND uuid=?2",
        "seen_movie" => "DELETE FROM seen_movies WHERE profile_id=?1 AND uuid=?2",
        "episode_progress" => "DELETE FROM episode_progress WHERE profile_id=?1 AND uuid=?2",
        "tracked_series" => "DELETE FROM tracked_series WHERE profile_id=?1 AND uuid=?2",
        "viewing_event" => "DELETE FROM viewing_events WHERE profile_id=?1 AND uuid=?2",
        "custom_list" => "DELETE FROM custom_lists WHERE profile_id=?1 AND uuid=?2",
        "smart_list" => "DELETE FROM smart_lists WHERE profile_id=?1 AND uuid=?2",
        "saved_filter" => "DELETE FROM saved_filters WHERE profile_id=?1 AND uuid=?2",
        "availability_alert" => "DELETE FROM availability_alerts WHERE profile_id=?1 AND uuid=?2",
        "dismissed_recommendation" => {
            "DELETE FROM dismissed_recommendations WHERE profile_id=?1 AND uuid=?2"
        }
        "custom_list_item" => {
            "DELETE FROM custom_list_items WHERE uuid=?2 AND list_id IN (SELECT uuid FROM custom_lists WHERE profile_id=?1)"
        }
        _ => return Err(ApiError::bad_request("Unsupported sync entity type")),
    };
    sqlx::query(sql)
        .bind(profile_id)
        .bind(entity_id)
        .execute(&mut **tx)
        .await
        .map_err(ApiError::from)?;
    Ok(())
}

async fn upsert_entity(
    tx: &mut Transaction<'_, Sqlite>,
    profile_id: &str,
    entity_type: &str,
    data: &serde_json::Value,
) -> Result<(), ApiError> {
    let payload = serde_json::to_string(data)
        .map_err(|error| ApiError::bad_request(format!("Invalid remote payload: {error}")))?;

    // `preferences` has no profile_id column at all (it's a single global
    // key/value table, not a per-profile one — see its own migration) and
    // its natural identity is `key` itself, never a generated uuid, so it
    // takes a one-bind-param statement of its own rather than the generic
    // (payload, profile_id) execute path every other entity type shares
    // below.
    if entity_type == "account_preferences" {
        sqlx::query(
            "INSERT INTO preferences(key,value,updated_at) \
             VALUES(json_extract(?1,'$.key'),json_extract(?1,'$.value'),json_extract(?1,'$.updatedAt')) \
             ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
        )
        .bind(&payload)
        .execute(&mut **tx)
        .await
        .map_err(ApiError::from)?;
        return Ok(());
    }

    // library_item/seen_movie/episode_progress/tracked_series each have a
    // UNIQUE business-key constraint alongside their uuid primary key (see
    // 001-initial-schema.sql). The conflict target below is deliberately
    // that business key, not uuid: two devices that each added the same
    // title before ever syncing generate two different local uuids for it,
    // and a remote change for "the other device's uuid" must land on this
    // device's own existing row for the same (profile, media) pair instead
    // of attempting a second INSERT — which would violate the UNIQUE
    // constraint and abort the whole apply_remote_changes transaction.
    // Deliberately never assigns `uuid` in the DO UPDATE SET list, so the
    // pre-existing local row keeps its own identity; the two devices end up
    // agreeing on field values without agreeing on a single canonical uuid
    // for this entity server-side. Revisit only if that residual
    // per-device uuid split turns out to matter in practice.
    let sql = match entity_type {
        "library_item" => {
            r#"INSERT INTO library_items(uuid,profile_id,media_id,media_type,title,poster_path,backdrop_path,year,rating,genres,status,favourite,user_rating,notes,tags,started_at,completed_at,rewatch_count,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.mediaId'),json_extract(?1,'$.mediaType'),json_extract(?1,'$.title'),json_extract(?1,'$.posterPath'),json_extract(?1,'$.backdropPath'),json_extract(?1,'$.year'),json_extract(?1,'$.rating'),coalesce(json_extract(?1,'$.genres'),'[]'),json_extract(?1,'$.status'),coalesce(json_extract(?1,'$.favourite'),0),json_extract(?1,'$.userRating'),json_extract(?1,'$.notes'),coalesce(json_extract(?1,'$.tags'),'[]'),json_extract(?1,'$.startedAt'),json_extract(?1,'$.completedAt'),coalesce(json_extract(?1,'$.rewatchCount'),0),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(profile_id,media_id,media_type) DO UPDATE SET title=excluded.title,poster_path=excluded.poster_path,backdrop_path=excluded.backdrop_path,year=excluded.year,rating=excluded.rating,genres=excluded.genres,status=excluded.status,favourite=excluded.favourite,user_rating=excluded.user_rating,notes=excluded.notes,tags=excluded.tags,started_at=excluded.started_at,completed_at=excluded.completed_at,rewatch_count=excluded.rewatch_count,updated_at=excluded.updated_at"#
        }
        "seen_movie" => {
            r#"INSERT INTO seen_movies(uuid,profile_id,movie_id,title,poster_path,backdrop_path,watched_at,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.movieId'),json_extract(?1,'$.title'),json_extract(?1,'$.posterPath'),json_extract(?1,'$.backdropPath'),json_extract(?1,'$.watchedAt'),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(profile_id,movie_id) DO UPDATE SET title=excluded.title,poster_path=excluded.poster_path,backdrop_path=excluded.backdrop_path,watched_at=excluded.watched_at,updated_at=excluded.updated_at"#
        }
        "episode_progress" => {
            r#"INSERT INTO episode_progress(uuid,profile_id,series_id,episode_id,season_number,episode_number,watched,watched_at,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.seriesId'),json_extract(?1,'$.episodeId'),json_extract(?1,'$.seasonNumber'),json_extract(?1,'$.episodeNumber'),coalesce(json_extract(?1,'$.watched'),1),json_extract(?1,'$.watchedAt'),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(profile_id,series_id,episode_id) DO UPDATE SET season_number=excluded.season_number,episode_number=excluded.episode_number,watched=excluded.watched,watched_at=excluded.watched_at,updated_at=excluded.updated_at"#
        }
        "tracked_series" => {
            r#"INSERT INTO tracked_series(uuid,profile_id,series_id,title,poster_path,backdrop_path,total_episodes,created_at,updated_at,status)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.seriesId'),json_extract(?1,'$.title'),json_extract(?1,'$.posterPath'),json_extract(?1,'$.backdropPath'),coalesce(json_extract(?1,'$.totalEpisodes'),0),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'),json_extract(?1,'$.status'))
          ON CONFLICT(profile_id,series_id) DO UPDATE SET title=excluded.title,poster_path=excluded.poster_path,backdrop_path=excluded.backdrop_path,total_episodes=excluded.total_episodes,status=excluded.status,updated_at=excluded.updated_at"#
        }
        "viewing_event" => {
            r#"INSERT INTO viewing_events(uuid,profile_id,media_id,media_type,title,event_type,watched_at,duration_minutes,episode_id,season_number,episode_number,created_at,note)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.mediaId'),json_extract(?1,'$.mediaType'),json_extract(?1,'$.title'),json_extract(?1,'$.eventType'),json_extract(?1,'$.watchedAt'),json_extract(?1,'$.durationMinutes'),json_extract(?1,'$.episodeId'),json_extract(?1,'$.seasonNumber'),json_extract(?1,'$.episodeNumber'),json_extract(?1,'$.createdAt'),json_extract(?1,'$.note'))
          ON CONFLICT(uuid) DO UPDATE SET title=excluded.title,event_type=excluded.event_type,watched_at=excluded.watched_at,duration_minutes=excluded.duration_minutes,note=excluded.note"#
        }
        "custom_list" => {
            r#"INSERT INTO custom_lists(uuid,profile_id,name,description,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.name'),json_extract(?1,'$.description'),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(uuid) DO UPDATE SET name=excluded.name,description=excluded.description,updated_at=excluded.updated_at"#
        }
        "custom_list_item" => {
            r#"INSERT INTO custom_list_items(uuid,list_id,media_id,media_type,title,poster_path,position,added_at,updated_at)
          SELECT json_extract(?1,'$.uuid'),json_extract(?1,'$.listId'),json_extract(?1,'$.mediaId'),json_extract(?1,'$.mediaType'),json_extract(?1,'$.title'),json_extract(?1,'$.posterPath'),json_extract(?1,'$.position'),json_extract(?1,'$.addedAt'),json_extract(?1,'$.updatedAt')
          WHERE EXISTS (SELECT 1 FROM custom_lists WHERE uuid=json_extract(?1,'$.listId') AND profile_id=?2)
          ON CONFLICT(uuid) DO UPDATE SET list_id=excluded.list_id,media_id=excluded.media_id,media_type=excluded.media_type,title=excluded.title,poster_path=excluded.poster_path,position=excluded.position,updated_at=excluded.updated_at"#
        }
        "smart_list" => {
            r#"INSERT INTO smart_lists(uuid,profile_id,name,rules,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.name'),json_extract(?1,'$.rules'),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(uuid) DO UPDATE SET name=excluded.name,rules=excluded.rules,updated_at=excluded.updated_at"#
        }
        "saved_filter" => {
            r#"INSERT INTO saved_filters(uuid,profile_id,page,name,filters,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.page'),json_extract(?1,'$.name'),json_extract(?1,'$.filters'),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(uuid) DO UPDATE SET page=excluded.page,name=excluded.name,filters=excluded.filters,updated_at=excluded.updated_at"#
        }
        "availability_alert" => {
            r#"INSERT INTO availability_alerts(uuid,profile_id,media_id,media_type,title,region,provider_ids,enabled,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.mediaId'),json_extract(?1,'$.mediaType'),json_extract(?1,'$.title'),json_extract(?1,'$.region'),json_extract(?1,'$.providerIds'),coalesce(json_extract(?1,'$.enabled'),1),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(uuid) DO UPDATE SET media_id=excluded.media_id,media_type=excluded.media_type,title=excluded.title,region=excluded.region,provider_ids=excluded.provider_ids,enabled=excluded.enabled,updated_at=excluded.updated_at"#
        }
        "dismissed_recommendation" => {
            r#"INSERT INTO dismissed_recommendations(uuid,profile_id,media_id,media_type,title,poster_path,dismissed_at,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.mediaId'),json_extract(?1,'$.mediaType'),json_extract(?1,'$.title'),json_extract(?1,'$.posterPath'),json_extract(?1,'$.dismissedAt'),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(uuid) DO UPDATE SET media_id=excluded.media_id,media_type=excluded.media_type,title=excluded.title,poster_path=excluded.poster_path,dismissed_at=excluded.dismissed_at,updated_at=excluded.updated_at"#
        }
        _ => return Err(ApiError::bad_request("Unsupported sync entity type")),
    };
    sqlx::query(sql)
        .bind(payload)
        .bind(profile_id)
        .execute(&mut **tx)
        .await
        .map_err(ApiError::from)?;
    Ok(())
}

pub async fn apply_remote_changes(
    pool: &SqlitePool,
    changes: &[RemoteSyncChange],
) -> Result<(), ApiError> {
    if changes.is_empty() {
        return Ok(());
    }
    let profile_id = current_profile_id(pool).await?;
    let mut ordered = changes.to_vec();
    ordered.sort_by_key(|change| change.sequence);
    let initial_cursor = cursor(pool).await?;
    let mut tx = pool.begin().await.map_err(ApiError::from)?;
    sqlx::query("UPDATE sync_control SET suppress_outbox=1 WHERE id=1")
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;

    let mut max_sequence = initial_cursor;
    for change in &ordered {
        if change.sequence <= max_sequence || !validate_entity_type(&change.entity_type) {
            continue;
        }
        let pending: Option<(String,)> = sqlx::query_as(
            "SELECT mutation_id FROM sync_outbox WHERE profile_id=?1 AND entity_type=?2 AND entity_id=?3",
        ).bind(&profile_id).bind(&change.entity_type).bind(&change.entity_id)
         .fetch_optional(&mut *tx).await.map_err(ApiError::from)?;

        if pending.is_none() {
            match change.operation.as_str() {
                "delete" => {
                    delete_entity(&mut tx, &profile_id, &change.entity_type, &change.entity_id)
                        .await?
                }
                "upsert" => {
                    let data = change
                        .data
                        .as_ref()
                        .ok_or_else(|| ApiError::bad_request("Remote upsert has no payload"))?;
                    upsert_entity(&mut tx, &profile_id, &change.entity_type, data).await?;
                }
                _ => return Err(ApiError::bad_request("Unsupported remote sync operation")),
            }
        } else {
            // Preserve the local pending edit, but rebase it onto the version
            // we just observed so its next push resolves the concurrent edit.
            sqlx::query("UPDATE sync_outbox SET base_version=?1 WHERE profile_id=?2 AND entity_type=?3 AND entity_id=?4")
                .bind(change.version).bind(&profile_id).bind(&change.entity_type).bind(&change.entity_id)
                .execute(&mut *tx).await.map_err(ApiError::from)?;
        }

        let now = now_iso(&mut *tx).await?;
        sqlx::query(
            "INSERT INTO sync_entity_state(profile_id,entity_type,entity_id,remote_version,deleted,updated_at) \
             VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET \
             remote_version=excluded.remote_version,deleted=excluded.deleted,updated_at=excluded.updated_at",
        ).bind(&profile_id).bind(&change.entity_type).bind(&change.entity_id).bind(change.version)
         .bind(if change.operation == "delete" { 1_i64 } else { 0_i64 }).bind(now)
         .execute(&mut *tx).await.map_err(ApiError::from)?;
        max_sequence = max_sequence.max(change.sequence);
    }

    let now = now_iso(&mut *tx).await?;
    sqlx::query(
        "INSERT INTO sync_metadata(key,value,updated_at) VALUES(?1,?2,?3) \
         ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
    )
    .bind(cursor_key(&profile_id))
    .bind(max_sequence.to_string())
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(ApiError::from)?;
    sqlx::query("UPDATE sync_control SET suppress_outbox=0 WHERE id=1")
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;
    tx.commit().await.map_err(ApiError::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database::migrations::run_migrations(&pool)
            .await
            .unwrap();
        pool
    }

    fn upsert_change(
        entity_id: &str,
        sequence: i64,
        version: i64,
        data: serde_json::Value,
    ) -> RemoteSyncChange {
        RemoteSyncChange {
            sequence,
            entity_type: "library_item".to_string(),
            entity_id: entity_id.to_string(),
            operation: "upsert".to_string(),
            version,
            data: Some(data),
        }
    }

    fn library_item_payload(uuid: &str, status: &str) -> serde_json::Value {
        serde_json::json!({
            "uuid": uuid,
            "mediaId": 42,
            "mediaType": "movie",
            "title": "Remote Title",
            "status": status,
            "createdAt": "2026-01-01T00:00:00.000Z",
            "updatedAt": "2026-01-02T00:00:00.000Z",
        })
    }

    async fn library_item_row(pool: &SqlitePool) -> (String, String) {
        sqlx::query_as(
            "SELECT uuid, status FROM library_items WHERE profile_id='default' AND media_id=42 AND media_type='movie'",
        )
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn library_item_count(pool: &SqlitePool) -> i64 {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM library_items WHERE profile_id='default' AND media_id=42 AND media_type='movie'",
        )
        .fetch_one(pool)
        .await
        .unwrap();
        count
    }

    /// The core bug this module's `upsert_entity` conflict target fixes: two
    /// devices that each added the same title before ever syncing generate
    /// two different local uuids for it. A remote change carrying the OTHER
    /// device's uuid must merge into this device's own existing row for the
    /// same (profile, media) pair — never attempt a second INSERT, which
    /// would violate library_items' own UNIQUE(profile_id, media_id,
    /// media_type) constraint and abort the whole transaction.
    #[tokio::test]
    async fn a_remote_upsert_with_a_different_uuid_for_the_same_business_key_merges_into_the_existing_row()
     {
        let pool = pool().await;
        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at) \
             VALUES ('local-1','default',42,'movie','Local Title','planned','t','t')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let change = upsert_change(
            "remote-1",
            1,
            1,
            library_item_payload("remote-1", "completed"),
        );
        apply_remote_changes(&pool, &[change]).await.unwrap();

        assert_eq!(
            library_item_count(&pool).await,
            1,
            "no duplicate row for the same business key"
        );
        let (uuid, status) = library_item_row(&pool).await;
        assert_eq!(
            uuid, "local-1",
            "the pre-existing local uuid is preserved, not replaced by the remote one"
        );
        assert_eq!(
            status, "completed",
            "the remote field values are still applied"
        );
    }

    #[tokio::test]
    async fn a_remote_upsert_for_a_genuinely_new_entity_still_inserts_normally() {
        let pool = pool().await;

        let change = upsert_change(
            "remote-1",
            1,
            1,
            library_item_payload("remote-1", "completed"),
        );
        apply_remote_changes(&pool, &[change]).await.unwrap();

        assert_eq!(library_item_count(&pool).await, 1);
        let (uuid, _) = library_item_row(&pool).await;
        assert_eq!(uuid, "remote-1");
    }

    #[tokio::test]
    async fn apply_remote_changes_is_idempotent_for_an_already_applied_sequence() {
        let pool = pool().await;
        let change = upsert_change(
            "remote-1",
            1,
            1,
            library_item_payload("remote-1", "completed"),
        );
        apply_remote_changes(&pool, std::slice::from_ref(&change))
            .await
            .unwrap();

        // Re-applying the exact same sequence (e.g. a retried pull) must not
        // error and must not change anything a second time.
        apply_remote_changes(&pool, &[change]).await.unwrap();

        assert_eq!(library_item_count(&pool).await, 1);
        assert_eq!(cursor(&pool).await.unwrap(), 1);
    }

    #[tokio::test]
    async fn apply_remote_changes_does_not_repopulate_the_local_outbox() {
        let pool = pool().await;
        let change = upsert_change(
            "remote-1",
            1,
            1,
            library_item_payload("remote-1", "completed"),
        );

        apply_remote_changes(&pool, &[change]).await.unwrap();

        let outbox = list_outbox(&pool, 10).await.unwrap();
        assert!(
            outbox.is_empty(),
            "applying a trusted remote change must not re-queue it as if it were a local mutation"
        );
    }

    #[tokio::test]
    async fn ack_mutations_advances_entity_state_and_clears_the_outbox() {
        let pool = pool().await;
        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at) \
             VALUES ('local-1','default',42,'movie','Local Title','planned','t','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        let pending = list_outbox(&pool, 10).await.unwrap();
        assert_eq!(pending.len(), 1);

        ack_mutations(
            &pool,
            &[SyncMutationAck {
                mutation_id: pending[0].mutation_id.clone(),
                entity_type: "library_item".to_string(),
                entity_id: "local-1".to_string(),
                version: 1,
            }],
        )
        .await
        .unwrap();

        assert!(list_outbox(&pool, 10).await.unwrap().is_empty());
        let (remote_version,): (i64,) = sqlx::query_as(
            "SELECT remote_version FROM sync_entity_state WHERE profile_id='default' AND entity_type='library_item' AND entity_id='local-1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(remote_version, 1);
    }

    #[tokio::test]
    async fn rebase_conflicts_updates_base_version_without_dropping_the_pending_mutation() {
        let pool = pool().await;
        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at) \
             VALUES ('local-1','default',42,'movie','Local Title','planned','t','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        let pending = list_outbox(&pool, 10).await.unwrap();

        rebase_conflicts(
            &pool,
            &[SyncConflict {
                mutation_id: pending[0].mutation_id.clone(),
                entity_type: "library_item".to_string(),
                entity_id: "local-1".to_string(),
                server_version: 7,
            }],
        )
        .await
        .unwrap();

        let rebased = list_outbox(&pool, 10).await.unwrap();
        assert_eq!(
            rebased.len(),
            1,
            "a rebased mutation stays pending, ready for the next push round"
        );
        assert_eq!(rebased[0].base_version, 7);
    }

    #[tokio::test]
    async fn applies_a_remote_account_preference_change_by_key_not_by_a_generated_uuid() {
        let pool = pool().await;
        let change = RemoteSyncChange {
            sequence: 1,
            entity_type: "account_preferences".to_string(),
            entity_id: "language".to_string(),
            operation: "upsert".to_string(),
            version: 1,
            data: Some(serde_json::json!({
                "key": "language",
                "value": "\"fr\"",
                "updatedAt": "2026-01-02T00:00:00.000Z",
            })),
        };

        apply_remote_changes(&pool, &[change]).await.unwrap();

        let (value,): (String,) =
            sqlx::query_as("SELECT value FROM preferences WHERE key='language'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(
            value, "\"fr\"",
            "round-trips to the exact same quoted-string form preferences.value already uses"
        );
    }

    #[tokio::test]
    async fn prepare_seeds_only_account_scoped_preferences_into_the_outbox() {
        let pool = pool().await;
        sqlx::query(
            "INSERT INTO preferences (key, value, updated_at) VALUES ('language', '\"fr\"', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO preferences (key, value, updated_at) VALUES ('theme', '\"light\"', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();

        prepare(&pool).await.unwrap();

        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT entity_id FROM sync_outbox WHERE entity_type='account_preferences'",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(
            rows,
            vec![("language".to_string(),)],
            "theme is device-scoped and must not be bootstrapped"
        );
    }

    #[tokio::test]
    async fn applies_a_remote_dismissed_recommendation_upsert_and_delete() {
        let pool = pool().await;
        let change = RemoteSyncChange {
            sequence: 1,
            entity_type: "dismissed_recommendation".to_string(),
            entity_id: "dr-1".to_string(),
            operation: "upsert".to_string(),
            version: 1,
            data: Some(serde_json::json!({
                "uuid": "dr-1",
                "mediaId": 42,
                "mediaType": "movie",
                "title": "Remote Title",
                "posterPath": "/p.jpg",
                "dismissedAt": "2026-01-01T00:00:00.000Z",
                "createdAt": "2026-01-01T00:00:00.000Z",
                "updatedAt": "2026-01-01T00:00:00.000Z",
            })),
        };
        apply_remote_changes(&pool, &[change]).await.unwrap();

        let (media_id, title): (i64, String) = sqlx::query_as(
            "SELECT media_id, title FROM dismissed_recommendations WHERE profile_id='default' AND uuid='dr-1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(media_id, 42);
        assert_eq!(title, "Remote Title");

        let delete_change = RemoteSyncChange {
            sequence: 2,
            entity_type: "dismissed_recommendation".to_string(),
            entity_id: "dr-1".to_string(),
            operation: "delete".to_string(),
            version: 2,
            data: None,
        };
        apply_remote_changes(&pool, &[delete_change]).await.unwrap();

        let count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM dismissed_recommendations WHERE uuid='dr-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count.0, 0);
    }

    #[tokio::test]
    async fn status_counts_conflicts_separately_from_other_failures() {
        let pool = pool().await;
        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at) \
             VALUES ('local-1','default',42,'movie','Local Title','planned','t','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at) \
             VALUES ('local-2','default',43,'movie','Other Title','planned','t','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        let pending = list_outbox(&pool, 10).await.unwrap();
        assert_eq!(pending.len(), 2);

        // One mutation gets rebased as a conflict; the other is marked
        // failed by some other generic error, never a conflict.
        rebase_conflicts(
            &pool,
            &[SyncConflict {
                mutation_id: pending[0].mutation_id.clone(),
                entity_type: "library_item".to_string(),
                entity_id: "local-1".to_string(),
                server_version: 7,
            }],
        )
        .await
        .unwrap();
        sqlx::query("UPDATE sync_outbox SET last_error='network timeout' WHERE mutation_id=?1")
            .bind(&pending[1].mutation_id)
            .execute(&pool)
            .await
            .unwrap();

        let status = status(&pool).await.unwrap();
        assert_eq!(status.failed_count, 2, "both rows carry a last_error");
        assert_eq!(
            status.conflict_count, 1,
            "only the rebased row is a conflict, not the generic failure"
        );
    }

    #[tokio::test]
    async fn mark_synced_records_a_timestamp_that_status_then_reports() {
        let pool = pool().await;
        assert_eq!(status(&pool).await.unwrap().last_synced_at, None);

        mark_synced(&pool).await.unwrap();

        let after_first = status(&pool).await.unwrap().last_synced_at;
        assert!(after_first.is_some());

        // Calling it again updates the same key rather than erroring or
        // creating a second row.
        mark_synced(&pool).await.unwrap();
        let after_second = status(&pool).await.unwrap().last_synced_at;
        assert!(after_second.is_some());
    }
}
