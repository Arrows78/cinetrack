use sqlx::{Sqlite, SqlitePool, Transaction};

use crate::database::{current_profile_id, new_uuid, now_iso};
use crate::error::ApiError;

use super::models::{
    RemoteSyncChange, SyncConflict, SyncMutationAck, SyncOutboxMutation, SyncStatus,
    validate_entity_type,
};

const DEVICE_ID_KEY: &str = "deviceId";

fn cursor_key(profile_id: &str) -> String {
    format!("cursor:{profile_id}")
}

fn bootstrap_key(profile_id: &str) -> String {
    format!("bootstrap:{profile_id}")
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
    Ok(SyncStatus {
        device_id: device_id(pool).await?,
        cursor: cursor(pool).await?,
        pending_count,
        failed_count,
    })
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
            "UPDATE sync_outbox SET base_version=?1,attempt_count=attempt_count+1,last_error='optimistic conflict; rebased' \
             WHERE profile_id=?2 AND mutation_id=?3 AND entity_type=?4 AND entity_id=?5",
        ).bind(conflict.server_version).bind(&profile_id).bind(&conflict.mutation_id)
         .bind(&conflict.entity_type).bind(&conflict.entity_id)
         .execute(&mut *tx).await.map_err(ApiError::from)?;
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
    let sql = match entity_type {
        "library_item" => {
            r#"INSERT INTO library_items(uuid,profile_id,media_id,media_type,title,poster_path,backdrop_path,year,rating,genres,status,favourite,user_rating,notes,tags,started_at,completed_at,rewatch_count,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.mediaId'),json_extract(?1,'$.mediaType'),json_extract(?1,'$.title'),json_extract(?1,'$.posterPath'),json_extract(?1,'$.backdropPath'),json_extract(?1,'$.year'),json_extract(?1,'$.rating'),coalesce(json_extract(?1,'$.genres'),'[]'),json_extract(?1,'$.status'),coalesce(json_extract(?1,'$.favourite'),0),json_extract(?1,'$.userRating'),json_extract(?1,'$.notes'),coalesce(json_extract(?1,'$.tags'),'[]'),json_extract(?1,'$.startedAt'),json_extract(?1,'$.completedAt'),coalesce(json_extract(?1,'$.rewatchCount'),0),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(uuid) DO UPDATE SET media_id=excluded.media_id,media_type=excluded.media_type,title=excluded.title,poster_path=excluded.poster_path,backdrop_path=excluded.backdrop_path,year=excluded.year,rating=excluded.rating,genres=excluded.genres,status=excluded.status,favourite=excluded.favourite,user_rating=excluded.user_rating,notes=excluded.notes,tags=excluded.tags,started_at=excluded.started_at,completed_at=excluded.completed_at,rewatch_count=excluded.rewatch_count,updated_at=excluded.updated_at"#
        }
        "seen_movie" => {
            r#"INSERT INTO seen_movies(uuid,profile_id,movie_id,title,poster_path,backdrop_path,watched_at,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.movieId'),json_extract(?1,'$.title'),json_extract(?1,'$.posterPath'),json_extract(?1,'$.backdropPath'),json_extract(?1,'$.watchedAt'),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(uuid) DO UPDATE SET movie_id=excluded.movie_id,title=excluded.title,poster_path=excluded.poster_path,backdrop_path=excluded.backdrop_path,watched_at=excluded.watched_at,updated_at=excluded.updated_at"#
        }
        "episode_progress" => {
            r#"INSERT INTO episode_progress(uuid,profile_id,series_id,episode_id,season_number,episode_number,watched,watched_at,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.seriesId'),json_extract(?1,'$.episodeId'),json_extract(?1,'$.seasonNumber'),json_extract(?1,'$.episodeNumber'),coalesce(json_extract(?1,'$.watched'),1),json_extract(?1,'$.watchedAt'),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(uuid) DO UPDATE SET series_id=excluded.series_id,episode_id=excluded.episode_id,season_number=excluded.season_number,episode_number=excluded.episode_number,watched=excluded.watched,watched_at=excluded.watched_at,updated_at=excluded.updated_at"#
        }
        "tracked_series" => {
            r#"INSERT INTO tracked_series(uuid,profile_id,series_id,title,poster_path,backdrop_path,total_episodes,created_at,updated_at,status)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.seriesId'),json_extract(?1,'$.title'),json_extract(?1,'$.posterPath'),json_extract(?1,'$.backdropPath'),coalesce(json_extract(?1,'$.totalEpisodes'),0),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'),json_extract(?1,'$.status'))
          ON CONFLICT(uuid) DO UPDATE SET series_id=excluded.series_id,title=excluded.title,poster_path=excluded.poster_path,backdrop_path=excluded.backdrop_path,total_episodes=excluded.total_episodes,status=excluded.status,updated_at=excluded.updated_at"#
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
