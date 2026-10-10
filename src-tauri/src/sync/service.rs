use sqlx::{Sqlite, SqlitePool, Transaction};

use crate::database::{current_profile_id, new_uuid, now_iso};
use crate::error::ApiError;
use crate::preferences::ACCOUNT_SCOPE_PREFERENCE_KEYS;

use super::models::{
    RemoteSyncChange, SyncConflict, SyncConflictDetail, SyncMutationAck, SyncOutboxMutation,
    SyncStatus, validate_entity_type,
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

fn bootstrap_v2_key(profile_id: &str) -> String {
    format!("bootstrap:v2:{profile_id}")
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

/// The cloud account is one person: only the local profile linked to the
/// signed-in account (`profiles.supabase_user_id` = the Clerk `sub`) may sync
/// against it. The frontend gate that switches the active profile after
/// sign-in is a UI concern and can lag behind (or be bypassed): without this
/// check a sync starting while another profile is still active would upload
/// that profile's library into the signed-in account and pull the account's
/// data into it. Returns the profile the whole run is bound to.
pub async fn prepare_for_account(
    pool: &SqlitePool,
    supabase_user_id: &str,
) -> Result<String, ApiError> {
    if supabase_user_id.trim().is_empty() {
        return Err(ApiError::bad_request("A signed-in account is required."));
    }
    let profile_id = current_profile_id(pool).await?;
    let linked = crate::profiles::get_by_id_impl(pool, &profile_id)
        .await?
        .and_then(|profile| profile.supabase_user_id);
    if linked.as_deref() != Some(supabase_user_id) {
        return Err(ApiError::forbidden(
            "Cloud sync only runs on the profile linked to the signed-in account.",
        ));
    }
    prepare(pool).await?;
    Ok(profile_id)
}

/// Every step of a sync run after `prepare_for_account` names the profile it
/// started with. Switching profile mid-run must stop the run rather than
/// acknowledge, rebase or apply one profile's mutations against another's
/// outbox, cursor and rows.
pub async fn assert_run_profile(pool: &SqlitePool, expected: &str) -> Result<(), ApiError> {
    if current_profile_id(pool).await? != expected {
        return Err(ApiError::forbidden(
            "The active profile changed during the sync run.",
        ));
    }
    Ok(())
}

async fn prepare(pool: &SqlitePool) -> Result<(), ApiError> {
    let profile_id = current_profile_id(pool).await?;
    let key = bootstrap_key(&profile_id);
    let already_done: Option<(String,)> =
        sqlx::query_as("SELECT value FROM sync_metadata WHERE key = ?1")
            .bind(&key)
            .fetch_optional(pool)
            .await
            .map_err(ApiError::from)?;
    if already_done.is_some() {
        return seed_activity_log_and_episode_ratings(pool, &profile_id).await;
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
        "activity_log",
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
    tx.commit().await.map_err(ApiError::from)?;
    seed_activity_log_and_episode_ratings(pool, &profile_id).await
}

/// Profiles that already ran the v1 bootstrap before activity_log / episode
/// ratings were part of the protocol still need a one-shot outbox seed.
/// Fresh installs run this immediately after v1; the no-op UPDATEs just
/// refresh the same outbox rows.
async fn seed_activity_log_and_episode_ratings(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<(), ApiError> {
    let key = bootstrap_v2_key(profile_id);
    let already_done: Option<(String,)> =
        sqlx::query_as("SELECT value FROM sync_metadata WHERE key = ?1")
            .bind(&key)
            .fetch_optional(pool)
            .await
            .map_err(ApiError::from)?;
    if already_done.is_some() {
        return Ok(());
    }

    let mut tx = pool.begin().await.map_err(ApiError::from)?;
    for table in ["activity_log", "episode_progress"] {
        let query = format!("UPDATE {table} SET uuid = uuid WHERE profile_id = ?1");
        sqlx::query(sqlx::AssertSqlSafe(query))
            .bind(profile_id)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from)?;
    }
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
         ORDER BY \
           CASE WHEN entity_type='custom_list' AND operation='upsert' THEN 0 \
                WHEN entity_type='custom_list_item' THEN 2 ELSE 1 END ASC, \
           created_at ASC, mutation_id ASC LIMIT ?2",
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

/// (mutation_id, entity_type, entity_id, created_at)
type ConflictRow = (String, String, String, String);

pub async fn list_conflicts(
    pool: &SqlitePool,
    limit: i64,
) -> Result<Vec<SyncConflictDetail>, ApiError> {
    let profile_id = current_profile_id(pool).await?;
    let limit = limit.clamp(1, 200);
    let rows: Vec<ConflictRow> = sqlx::query_as(
        "SELECT mutation_id,entity_type,entity_id,created_at \
         FROM sync_outbox WHERE profile_id=?1 AND last_error=?2 \
         ORDER BY created_at DESC LIMIT ?3",
    )
    .bind(&profile_id)
    .bind(CONFLICT_MARKER)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    Ok(rows
        .into_iter()
        .map(|row| SyncConflictDetail {
            mutation_id: row.0,
            entity_type: row.1,
            entity_id: row.2,
            created_at: row.3,
        })
        .collect())
}

pub async fn ack_mutations(pool: &SqlitePool, acks: &[SyncMutationAck]) -> Result<(), ApiError> {
    let profile_id = current_profile_id(pool).await?;
    let mut tx = pool.begin().await.map_err(ApiError::from)?;
    for ack in acks {
        if !validate_entity_type(&ack.entity_type) || ack.version <= 0 {
            continue;
        }
        // What was acknowledged decides whether the document is now live or
        // deleted on the server; the outbox row still carries that.
        let acknowledged: Option<(String,)> = sqlx::query_as(
            "SELECT operation FROM sync_outbox WHERE profile_id=?1 AND mutation_id=?2",
        )
        .bind(&profile_id)
        .bind(&ack.mutation_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(ApiError::from)?;
        let deleted = acknowledged.is_some_and(|(operation,)| operation == "delete");
        let now = now_iso(&mut *tx).await?;
        sqlx::query(
            "INSERT INTO sync_entity_state(profile_id,entity_type,entity_id,remote_version,deleted,updated_at) \
             VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET \
             remote_version=excluded.remote_version,deleted=excluded.deleted,updated_at=excluded.updated_at",
        ).bind(&profile_id).bind(&ack.entity_type).bind(&ack.entity_id).bind(ack.version).bind(i64::from(deleted)).bind(now)
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
        "activity_log" => "DELETE FROM activity_log WHERE profile_id=?1 AND uuid=?2",
        "custom_list_item" => {
            "DELETE FROM custom_list_items WHERE uuid=?2 AND list_id IN (SELECT uuid FROM custom_lists WHERE profile_id=?1)"
        }
        _ => return Err(ApiError::bad_request("Unsupported sync entity type")),
    };
    if entity_type == "custom_list" {
        // Deleting the list cascades to its items locally, but their
        // documents stay live on the server (the deleting device removes the
        // items it knew about first; one added concurrently elsewhere, or
        // one this device never saw deleted, is still there). If the list
        // comes back — a device with an unpushed edit to it pushes it again —
        // those items must come back with it, exactly as on a device that
        // only ever received them while the list was gone: park them.
        let now = now_iso(&mut **tx).await?;
        sqlx::query(
            "INSERT INTO sync_metadata(key,value,updated_at) \
             SELECT ?3||uuid, \
               json_object('uuid',uuid,'listId',list_id,'mediaId',media_id,'mediaType',media_type,'title',title,'posterPath',poster_path,'position',position,'addedAt',added_at,'updatedAt',updated_at), \
               ?4 \
             FROM custom_list_items \
             WHERE list_id=?2 AND list_id IN (SELECT uuid FROM custom_lists WHERE profile_id=?1) \
               AND NOT EXISTS (SELECT 1 FROM sync_outbox o WHERE o.profile_id=?1 AND o.entity_type='custom_list_item' AND o.entity_id=custom_list_items.uuid AND o.operation='delete') \
             ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
        )
        .bind(profile_id)
        .bind(entity_id)
        .bind(orphan_key_prefix(profile_id))
        .bind(now)
        .execute(&mut **tx)
        .await
        .map_err(ApiError::from)?;
    }
    sqlx::query(sql)
        .bind(profile_id)
        .bind(entity_id)
        .execute(&mut **tx)
        .await
        .map_err(ApiError::from)?;
    Ok(())
}

/// Runs the type-specific INSERT ... ON CONFLICT for one remote upsert.
/// Returns whether a row was written: `false` means the change was valid
/// but has nowhere to land (a list item whose list hasn't arrived yet) or
/// was rejected as outside the account-scope preference contract.
async fn run_upsert(
    tx: &mut Transaction<'_, Sqlite>,
    profile_id: &str,
    entity_type: &str,
    data: &serde_json::Value,
) -> Result<bool, ApiError> {
    let payload = serde_json::to_string(data)
        .map_err(|error| ApiError::bad_request(format!("Invalid remote payload: {error}")))?;

    // `preferences` has no profile_id column at all (it's a single global
    // key/value table, not a per-profile one — see its own migration) and
    // its natural identity is `key` itself, never a generated uuid, so it
    // takes a one-bind-param statement of its own rather than the generic
    // (payload, profile_id) execute path every other entity type shares
    // below.
    if entity_type == "account_preferences" {
        // The cloud document is untrusted input for this install: only the
        // keys the account-scope contract names may be written (a stray
        // `activeProfileId` or `backupDirectory` must never land here), and
        // the value must be one the preferences layer itself would accept —
        // an unparsable value would otherwise make every later preferences
        // read fail.
        let key = data.get("key").and_then(serde_json::Value::as_str);
        let value = data.get("value").and_then(serde_json::Value::as_str);
        let accepted = matches!(
            (key, value),
            (Some(key), Some(value)) if crate::preferences::account_preference_accepts(key, value)
        );
        if !accepted {
            return Ok(false);
        }
        sqlx::query(
            "INSERT INTO preferences(key,value,updated_at) \
             VALUES(json_extract(?1,'$.key'),json_extract(?1,'$.value'),json_extract(?1,'$.updatedAt')) \
             ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
        )
        .bind(&payload)
        .execute(&mut **tx)
        .await
        .map_err(ApiError::from)?;
        return Ok(true);
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
            r#"INSERT INTO episode_progress(uuid,profile_id,series_id,episode_id,season_number,episode_number,watched,watched_at,rating,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.seriesId'),json_extract(?1,'$.episodeId'),json_extract(?1,'$.seasonNumber'),json_extract(?1,'$.episodeNumber'),coalesce(json_extract(?1,'$.watched'),1),json_extract(?1,'$.watchedAt'),json_extract(?1,'$.rating'),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(profile_id,series_id,episode_id) DO UPDATE SET season_number=excluded.season_number,episode_number=excluded.episode_number,watched=excluded.watched,watched_at=excluded.watched_at,rating=excluded.rating,updated_at=excluded.updated_at"#
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
          ON CONFLICT(list_id,media_id,media_type) DO UPDATE SET title=excluded.title,poster_path=excluded.poster_path,position=excluded.position,updated_at=excluded.updated_at"#
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
          ON CONFLICT(profile_id,media_id,media_type) DO UPDATE SET title=excluded.title,region=excluded.region,provider_ids=excluded.provider_ids,enabled=excluded.enabled,updated_at=excluded.updated_at"#
        }
        "dismissed_recommendation" => {
            r#"INSERT INTO dismissed_recommendations(uuid,profile_id,media_id,media_type,title,poster_path,dismissed_at,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.mediaId'),json_extract(?1,'$.mediaType'),json_extract(?1,'$.title'),json_extract(?1,'$.posterPath'),json_extract(?1,'$.dismissedAt'),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(profile_id,media_id,media_type) DO UPDATE SET title=excluded.title,poster_path=excluded.poster_path,dismissed_at=excluded.dismissed_at,updated_at=excluded.updated_at"#
        }
        "activity_log" => {
            r#"INSERT INTO activity_log(uuid,profile_id,media_id,media_type,title,action,season_number,episode_number,episode_title,metadata,timestamp,created_at,updated_at)
          VALUES(json_extract(?1,'$.uuid'),?2,json_extract(?1,'$.mediaId'),json_extract(?1,'$.mediaType'),json_extract(?1,'$.title'),json_extract(?1,'$.action'),json_extract(?1,'$.seasonNumber'),json_extract(?1,'$.episodeNumber'),json_extract(?1,'$.episodeTitle'),json_extract(?1,'$.metadata'),json_extract(?1,'$.timestamp'),json_extract(?1,'$.createdAt'),json_extract(?1,'$.updatedAt'))
          ON CONFLICT(uuid) DO UPDATE SET media_id=excluded.media_id,media_type=excluded.media_type,title=excluded.title,action=excluded.action,season_number=excluded.season_number,episode_number=excluded.episode_number,episode_title=excluded.episode_title,metadata=excluded.metadata,timestamp=excluded.timestamp,updated_at=excluded.updated_at"#
        }
        _ => return Err(ApiError::bad_request("Unsupported sync entity type")),
    };
    let result = sqlx::query(sql)
        .bind(payload)
        .bind(profile_id)
        .execute(&mut **tx)
        .await
        .map_err(ApiError::from)?;
    Ok(result.rows_affected() > 0)
}

/// How a synced entity type with a UNIQUE business key finds "the same
/// real-world thing" under a different uuid.
struct KeyedEntity {
    table: &'static str,
    /// Extra join/filter so a row only counts when it belongs to the active
    /// profile (list items scope through their parent list).
    scope: &'static str,
    /// (column, JSON field) pairs forming the business key.
    key: &'static [(&'static str, &'static str)],
}

fn keyed_entity(entity_type: &str) -> Option<KeyedEntity> {
    const PROFILE: &str = "t.profile_id = ?2";
    const MEDIA: &[(&str, &str)] = &[("media_id", "mediaId"), ("media_type", "mediaType")];
    Some(match entity_type {
        "library_item" => KeyedEntity {
            table: "library_items",
            scope: PROFILE,
            key: MEDIA,
        },
        "dismissed_recommendation" => KeyedEntity {
            table: "dismissed_recommendations",
            scope: PROFILE,
            key: MEDIA,
        },
        "availability_alert" => KeyedEntity {
            table: "availability_alerts",
            scope: PROFILE,
            key: MEDIA,
        },
        "seen_movie" => KeyedEntity {
            table: "seen_movies",
            scope: PROFILE,
            key: &[("movie_id", "movieId")],
        },
        "episode_progress" => KeyedEntity {
            table: "episode_progress",
            scope: PROFILE,
            key: &[("series_id", "seriesId"), ("episode_id", "episodeId")],
        },
        "tracked_series" => KeyedEntity {
            table: "tracked_series",
            scope: PROFILE,
            key: &[("series_id", "seriesId")],
        },
        "custom_list_item" => KeyedEntity {
            table: "custom_list_items",
            scope: "t.list_id IN (SELECT uuid FROM custom_lists WHERE profile_id = ?2)",
            key: &[
                ("list_id", "listId"),
                ("media_id", "mediaId"),
                ("media_type", "mediaType"),
            ],
        },
        _ => return None,
    })
}

async fn set_outbox_capture(
    tx: &mut Transaction<'_, Sqlite>,
    capture: bool,
) -> Result<(), ApiError> {
    sqlx::query("UPDATE sync_control SET suppress_outbox=?1 WHERE id=1")
        .bind(if capture { 0_i64 } else { 1_i64 })
        .execute(&mut **tx)
        .await
        .map_err(ApiError::from)?;
    Ok(())
}

/// Two installs that each created the same title before ever syncing hold
/// two rows with two uuids, and the server ends up with two documents for
/// it (and the same happens when a title is deleted and added back, which
/// creates a new uuid). Every device must settle on the same single row
/// whatever order the documents reach it in, so the rule is the one used for
/// every other entity, applied to the business key: documents are replayed
/// in server order and the last one wins.
///
/// - **values**: a document for a key the device already holds under another
///   uuid overwrites that row's fields. A local edit that hasn't been pushed
///   yet is never overwritten: it keeps its value, and since it is pushed
///   after the document just received, it is also the last one every other
///   device applies;
/// - **identity**: the row takes the uuid of that document (the last one
///   wins here too, so a later delete of the superseded uuid can't remove
///   the row), and the uuid it had before is retired: its server document
///   is deleted by a queued mutation, and any unpushed edit is re-captured
///   under the new uuid.
async fn merge_duplicate_business_key(
    tx: &mut Transaction<'_, Sqlite>,
    profile_id: &str,
    entity_type: &str,
    keyed: &KeyedEntity,
    local_uuid: String,
    data: &serde_json::Value,
) -> Result<bool, ApiError> {
    let remote_uuid = data
        .get("uuid")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();

    let pending: Option<(String,)> = sqlx::query_as(
        "SELECT operation FROM sync_outbox WHERE profile_id=?1 AND entity_type=?2 AND entity_id=?3",
    )
    .bind(profile_id)
    .bind(entity_type)
    .bind(&local_uuid)
    .fetch_optional(&mut **tx)
    .await
    .map_err(ApiError::from)?;
    let had_pending = pending.is_some();

    if !had_pending {
        // Conflict target is the business key, so this updates the existing
        // row's fields and leaves its uuid alone.
        run_upsert(tx, profile_id, entity_type, data).await?;
    }

    let table = keyed.table;
    let old_state: Option<(i64,)> = sqlx::query_as(
        "SELECT remote_version FROM sync_entity_state WHERE profile_id=?1 AND entity_type=?2 AND entity_id=?3",
    )
    .bind(profile_id)
    .bind(entity_type)
    .bind(&local_uuid)
    .fetch_optional(&mut **tx)
    .await
    .map_err(ApiError::from)?;

    // The old uuid's pending mutation (an unpushed edit) and any pending
    // delete of the new uuid (an earlier retirement, or the user's own
    // delete of a title that's been added back since) are both superseded.
    sqlx::query(
        "DELETE FROM sync_outbox WHERE profile_id=?1 AND entity_type=?2 AND entity_id IN (?3,?4)",
    )
    .bind(profile_id)
    .bind(entity_type)
    .bind(&local_uuid)
    .bind(remote_uuid)
    .execute(&mut **tx)
    .await
    .map_err(ApiError::from)?;

    let rename = format!("UPDATE {table} SET uuid=?1 WHERE uuid=?2");
    sqlx::query(sqlx::AssertSqlSafe(rename))
        .bind(remote_uuid)
        .bind(&local_uuid)
        .execute(&mut **tx)
        .await
        .map_err(ApiError::from)?;

    if had_pending {
        // The unpushed local edit now belongs to the new document:
        // re-capture the row (a no-op update fires the normal trigger, which
        // bases it on the version just observed for the new uuid).
        set_outbox_capture(tx, true).await?;
        let recapture = format!("UPDATE {table} SET uuid=uuid WHERE uuid=?1");
        let result = sqlx::query(sqlx::AssertSqlSafe(recapture))
            .bind(remote_uuid)
            .execute(&mut **tx)
            .await
            .map_err(ApiError::from);
        set_outbox_capture(tx, false).await?;
        result?;
    }

    if let Some((version,)) = old_state
        && version > 0
    {
        // The old uuid has a document on the server: retire it.
        let now = now_iso(&mut **tx).await?;
        sqlx::query(
            "INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at) \
             VALUES(?1,?2,?3,?4,'delete',NULL,?5,?6)",
        )
        .bind(new_uuid())
        .bind(profile_id)
        .bind(entity_type)
        .bind(&local_uuid)
        .bind(version)
        .bind(now)
        .execute(&mut **tx)
        .await
        .map_err(ApiError::from)?;
    }
    Ok(true)
}

/// The local row, if any, that already stands for the same real-world thing
/// as this remote document under a *different* uuid.
async fn find_duplicate_by_business_key(
    tx: &mut Transaction<'_, Sqlite>,
    profile_id: &str,
    entity_type: &str,
    data: &serde_json::Value,
) -> Result<Option<(KeyedEntity, String)>, ApiError> {
    let Some(keyed) = keyed_entity(entity_type) else {
        return Ok(None);
    };
    let payload = serde_json::to_string(data)
        .map_err(|error| ApiError::bad_request(format!("Invalid remote payload: {error}")))?;
    let conditions = keyed
        .key
        .iter()
        .map(|(column, field)| format!("t.{column} = json_extract(?1,'$.{field}')"))
        .collect::<Vec<_>>()
        .join(" AND ");
    let lookup = format!(
        "SELECT t.uuid FROM {} t WHERE {} AND {conditions}",
        keyed.table, keyed.scope
    );
    let existing: Option<(String,)> = sqlx::query_as(sqlx::AssertSqlSafe(lookup))
        .bind(&payload)
        .bind(profile_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(ApiError::from)?;
    let remote_uuid = data.get("uuid").and_then(serde_json::Value::as_str);
    Ok(existing
        .filter(|(local_uuid,)| remote_uuid != Some(local_uuid.as_str()))
        .map(|(local_uuid,)| (keyed, local_uuid)))
}

async fn upsert_entity(
    tx: &mut Transaction<'_, Sqlite>,
    profile_id: &str,
    entity_type: &str,
    data: &serde_json::Value,
) -> Result<bool, ApiError> {
    if let Some((keyed, local_uuid)) =
        find_duplicate_by_business_key(tx, profile_id, entity_type, data).await?
    {
        return merge_duplicate_business_key(tx, profile_id, entity_type, &keyed, local_uuid, data)
            .await;
    }
    run_upsert(tx, profile_id, entity_type, data).await
}

fn orphan_key_prefix(profile_id: &str) -> String {
    format!("orphan:{profile_id}:")
}

/// A list item can reach a device before its list does, or while the list is
/// deleted (someone added to a list another device just removed, and the list
/// may well come back). The change can't be stored — the item needs its
/// parent — but the cursor moves past it, so it is parked here, in
/// `sync_metadata`, until its list shows up.
async fn stash_orphaned_item(
    tx: &mut Transaction<'_, Sqlite>,
    profile_id: &str,
    entity_id: &str,
    data: &serde_json::Value,
) -> Result<(), ApiError> {
    let now = now_iso(&mut **tx).await?;
    sqlx::query(
        "INSERT INTO sync_metadata(key,value,updated_at) VALUES(?1,?2,?3) \
         ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
    )
    .bind(format!("{}{entity_id}", orphan_key_prefix(profile_id)))
    .bind(data.to_string())
    .bind(now)
    .execute(&mut **tx)
    .await
    .map_err(ApiError::from)?;
    Ok(())
}

async fn forget_orphaned_item(
    tx: &mut Transaction<'_, Sqlite>,
    profile_id: &str,
    entity_id: &str,
) -> Result<(), ApiError> {
    sqlx::query("DELETE FROM sync_metadata WHERE key=?1")
        .bind(format!("{}{entity_id}", orphan_key_prefix(profile_id)))
        .execute(&mut **tx)
        .await
        .map_err(ApiError::from)?;
    Ok(())
}

/// Replays the parked list items whose list now exists locally.
async fn apply_orphaned_items(
    tx: &mut Transaction<'_, Sqlite>,
    profile_id: &str,
) -> Result<(), ApiError> {
    let prefix = orphan_key_prefix(profile_id);
    let parked: Vec<(String, String)> =
        sqlx::query_as("SELECT key,value FROM sync_metadata WHERE substr(key,1,length(?1))=?1")
            .bind(&prefix)
            .fetch_all(&mut **tx)
            .await
            .map_err(ApiError::from)?;
    for (key, raw) in parked {
        let Ok(data) = serde_json::from_str::<serde_json::Value>(&raw) else {
            continue;
        };
        let entity_id = key[prefix.len()..].to_string();
        let pending: Option<(String,)> = sqlx::query_as(
            "SELECT operation FROM sync_outbox WHERE profile_id=?1 AND entity_type='custom_list_item' AND entity_id=?2",
        )
        .bind(profile_id)
        .bind(&entity_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(ApiError::from)?;
        if pending.is_some() {
            forget_orphaned_item(tx, profile_id, &entity_id).await?;
            continue;
        }
        if upsert_entity(tx, profile_id, "custom_list_item", &data).await? {
            forget_orphaned_item(tx, profile_id, &entity_id).await?;
        }
    }
    Ok(())
}

/// Drops the per-profile sync bookkeeping (cursor, bootstrap markers, last
/// sync time, parked list items) of a profile that is being deleted. The
/// outbox and entity-state rows go with the profile through their foreign
/// keys; these `sync_metadata` keys have no such link and would otherwise
/// outlive it.
pub(crate) async fn forget_profile(
    tx: &mut Transaction<'_, Sqlite>,
    profile_id: &str,
) -> Result<(), ApiError> {
    let prefix = orphan_key_prefix(profile_id);
    sqlx::query(
        "DELETE FROM sync_metadata WHERE key IN (?1,?2,?3,?4) OR substr(key,1,length(?5))=?5",
    )
    .bind(cursor_key(profile_id))
    .bind(bootstrap_key(profile_id))
    .bind(bootstrap_v2_key(profile_id))
    .bind(last_synced_key(profile_id))
    .bind(prefix)
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
        if change.sequence <= max_sequence {
            continue;
        }
        // A change of a type this build doesn't know (written by a newer
        // app version) can't be applied, but it must still move the cursor:
        // otherwise a page made only of such changes is fetched again
        // forever and never lets the changes behind it through.
        if !validate_entity_type(&change.entity_type) {
            max_sequence = change.sequence;
            continue;
        }
        let pending: Option<(String,)> = sqlx::query_as(
            "SELECT operation FROM sync_outbox WHERE profile_id=?1 AND entity_type=?2 AND entity_id=?3",
        ).bind(&profile_id).bind(&change.entity_type).bind(&change.entity_id)
         .fetch_optional(&mut *tx).await.map_err(ApiError::from)?;

        // Recorded before the change is applied: re-capturing a row under a
        // canonical uuid (see merge_duplicate_business_key) bases its
        // mutation on this version.
        let now = now_iso(&mut *tx).await?;
        sqlx::query(
            "INSERT INTO sync_entity_state(profile_id,entity_type,entity_id,remote_version,deleted,updated_at) \
             VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET \
             remote_version=excluded.remote_version,deleted=excluded.deleted,updated_at=excluded.updated_at",
        ).bind(&profile_id).bind(&change.entity_type).bind(&change.entity_id).bind(change.version)
         .bind(if change.operation == "delete" { 1_i64 } else { 0_i64 }).bind(now)
         .execute(&mut *tx).await.map_err(ApiError::from)?;

        if pending.is_none() {
            match change.operation.as_str() {
                "delete" => {
                    delete_entity(&mut tx, &profile_id, &change.entity_type, &change.entity_id)
                        .await?;
                    if change.entity_type == "custom_list_item" {
                        forget_orphaned_item(&mut tx, &profile_id, &change.entity_id).await?;
                    }
                }
                "upsert" => {
                    let data = change
                        .data
                        .as_ref()
                        .ok_or_else(|| ApiError::bad_request("Remote upsert has no payload"))?;
                    let written =
                        upsert_entity(&mut tx, &profile_id, &change.entity_type, data).await?;
                    if change.entity_type == "custom_list_item" {
                        if written {
                            forget_orphaned_item(&mut tx, &profile_id, &change.entity_id).await?;
                        } else {
                            stash_orphaned_item(&mut tx, &profile_id, &change.entity_id, data)
                                .await?;
                        }
                    }
                }
                _ => return Err(ApiError::bad_request("Unsupported remote sync operation")),
            }
        } else {
            // Preserve the local pending edit, but rebase it onto the version
            // we just observed so its next push resolves the concurrent edit.
            sqlx::query("UPDATE sync_outbox SET base_version=?1 WHERE profile_id=?2 AND entity_type=?3 AND entity_id=?4")
                .bind(change.version).bind(&profile_id).bind(&change.entity_type).bind(&change.entity_id)
                .execute(&mut *tx).await.map_err(ApiError::from)?;
            // A pending *delete* of this uuid may only be the retirement of
            // a duplicate (see merge_duplicate_business_key), in which case
            // the document still carries the latest value for a row that
            // lives on under the canonical uuid. Never recreates a row the
            // user deleted: only an existing duplicate is merged into.
            if pending
                .as_ref()
                .is_some_and(|(operation,)| operation == "delete")
                && change.operation == "upsert"
                && let Some(data) = change.data.as_ref()
                && let Some((keyed, local_uuid)) =
                    find_duplicate_by_business_key(&mut tx, &profile_id, &change.entity_type, data)
                        .await?
            {
                merge_duplicate_business_key(
                    &mut tx,
                    &profile_id,
                    &change.entity_type,
                    &keyed,
                    local_uuid,
                    data,
                )
                .await?;
            }
        }
        max_sequence = max_sequence.max(change.sequence);
    }

    apply_orphaned_items(&mut tx, &profile_id).await?;

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
        // The local row is already in sync (nothing waiting to be pushed).
        sqlx::query("DELETE FROM sync_outbox")
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
            uuid, "remote-1",
            "the row takes the uuid of the latest document, so a later delete of it reaches this row"
        );
        assert_eq!(
            status, "completed",
            "the remote field values are still applied"
        );
        assert_eq!(
            outbox_count(&pool).await,
            0,
            "adopting a remote uuid is not a local change to push back"
        );
    }

    async fn outbox_count(pool: &SqlitePool) -> i64 {
        sqlx::query_scalar("SELECT COUNT(*) FROM sync_outbox")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    /// A local edit that hasn't been pushed yet is never overwritten by a
    /// document for the same title carried under another uuid: it keeps its
    /// value, moves onto the remote uuid, and goes out as the next version
    /// of that document.
    #[tokio::test]
    async fn a_pending_local_edit_survives_a_remote_document_with_another_uuid() {
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
            3,
            library_item_payload("remote-1", "completed"),
        );
        apply_remote_changes(&pool, &[change]).await.unwrap();

        let (uuid, status) = library_item_row(&pool).await;
        assert_eq!(status, "planned", "the unpushed local edit wins");
        assert_eq!(uuid, "remote-1");
        let pending = list_outbox(&pool, 10).await.unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].entity_id, "remote-1");
        assert_eq!(
            pending[0].base_version, 3,
            "rebased on the version just observed, so the push is accepted"
        );
        assert_eq!(pending[0].operation, "upsert");
    }

    /// The remote device that added a title again after deleting it publishes
    /// "delete old uuid" and "upsert new uuid" — in an order the server picks.
    /// Whichever comes first, the title must still be there afterwards.
    #[tokio::test]
    async fn a_title_deleted_and_added_back_elsewhere_survives_in_either_order() {
        for new_document_first in [true, false] {
            let pool = pool().await;
            let old = RemoteSyncChange {
                sequence: 1,
                entity_type: "library_item".to_string(),
                entity_id: "old".to_string(),
                operation: "upsert".to_string(),
                version: 1,
                data: Some(library_item_payload("old", "planned")),
            };
            apply_remote_changes(&pool, &[old]).await.unwrap();

            let deleted = RemoteSyncChange {
                sequence: if new_document_first { 3 } else { 2 },
                entity_type: "library_item".to_string(),
                entity_id: "old".to_string(),
                operation: "delete".to_string(),
                version: 2,
                data: None,
            };
            let added_back = upsert_change(
                "new",
                if new_document_first { 2 } else { 3 },
                1,
                library_item_payload("new", "watching"),
            );
            apply_remote_changes(&pool, &[deleted, added_back])
                .await
                .unwrap();

            assert_eq!(
                library_item_count(&pool).await,
                1,
                "new_document_first={new_document_first}"
            );
            let (uuid, status) = library_item_row(&pool).await;
            assert_eq!((uuid.as_str(), status.as_str()), ("new", "watching"));
        }
    }

    /// availability_alerts has UNIQUE(profile_id, media_id, media_type) like
    /// the four entities the engine already merged by business key, but was
    /// applied by uuid: the same alert created on two devices made the
    /// remote upsert violate that constraint, which aborted the apply and
    /// left the cursor stuck on it forever.
    #[tokio::test]
    async fn the_same_availability_alert_created_on_two_devices_does_not_block_the_pull() {
        let pool = pool().await;
        sqlx::query(
            "INSERT INTO availability_alerts(uuid,profile_id,media_id,media_type,title,region,provider_ids,enabled,created_at,updated_at) \
             VALUES('local-alert','default',42,'movie','T','FR','[]',1,'t','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("DELETE FROM sync_outbox")
            .execute(&pool)
            .await
            .unwrap();

        let change = RemoteSyncChange {
            sequence: 1,
            entity_type: "availability_alert".to_string(),
            entity_id: "remote-alert".to_string(),
            operation: "upsert".to_string(),
            version: 1,
            data: Some(serde_json::json!({
                "uuid": "remote-alert", "mediaId": 42, "mediaType": "movie", "title": "T",
                "region": "BE", "providerIds": "[8]", "enabled": 0,
                "createdAt": "2026-01-01T00:00:00.000Z", "updatedAt": "2026-01-02T00:00:00.000Z",
            })),
        };
        apply_remote_changes(&pool, &[change]).await.unwrap();

        let rows: Vec<(String, String, i64)> = sqlx::query_as(
            "SELECT uuid, region, enabled FROM availability_alerts WHERE media_id=42",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(
            rows,
            vec![("remote-alert".to_string(), "BE".to_string(), 0)]
        );
        assert_eq!(cursor(&pool).await.unwrap(), 1);
    }

    /// Same constraint on custom_list_items: UNIQUE(list_id, media_id,
    /// media_type), while the apply conflicted on the item's uuid.
    #[tokio::test]
    async fn the_same_title_added_to_a_list_on_two_devices_does_not_block_the_pull() {
        let pool = pool().await;
        sqlx::query(
            "INSERT INTO custom_lists(uuid,profile_id,name,created_at,updated_at) VALUES('list-1','default','L','t','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO custom_list_items(uuid,list_id,media_id,media_type,title,position,added_at,updated_at) \
             VALUES('local-item','list-1',42,'movie','T',0,'t','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("DELETE FROM sync_outbox")
            .execute(&pool)
            .await
            .unwrap();

        let change = RemoteSyncChange {
            sequence: 1,
            entity_type: "custom_list_item".to_string(),
            entity_id: "remote-item".to_string(),
            operation: "upsert".to_string(),
            version: 1,
            data: Some(serde_json::json!({
                "uuid": "remote-item", "listId": "list-1", "mediaId": 42, "mediaType": "movie",
                "title": "T", "position": 3,
                "addedAt": "2026-01-01T00:00:00.000Z", "updatedAt": "2026-01-02T00:00:00.000Z",
            })),
        };
        apply_remote_changes(&pool, &[change]).await.unwrap();

        let rows: Vec<(String, i64)> =
            sqlx::query_as("SELECT uuid, position FROM custom_list_items WHERE list_id='list-1'")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(rows, vec![("remote-item".to_string(), 3)]);
        assert_eq!(cursor(&pool).await.unwrap(), 1);
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
    async fn applies_a_remote_activity_log_upsert_and_delete() {
        let pool = pool().await;
        let change = RemoteSyncChange {
            sequence: 1,
            entity_type: "activity_log".to_string(),
            entity_id: "hist-1".to_string(),
            operation: "upsert".to_string(),
            version: 1,
            data: Some(serde_json::json!({
                "uuid": "hist-1",
                "mediaId": 9,
                "mediaType": "movie",
                "title": "Remote Title",
                "action": "movie:watched",
                "timestamp": "2026-01-01T00:00:00.000Z",
                "createdAt": "2026-01-01T00:00:00.000Z",
                "updatedAt": "2026-01-01T00:00:00.000Z",
            })),
        };
        apply_remote_changes(&pool, &[change]).await.unwrap();

        let (title, action): (String, String) = sqlx::query_as(
            "SELECT title, action FROM activity_log WHERE profile_id='default' AND uuid='hist-1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(title, "Remote Title");
        assert_eq!(action, "movie:watched");

        let delete_change = RemoteSyncChange {
            sequence: 2,
            entity_type: "activity_log".to_string(),
            entity_id: "hist-1".to_string(),
            operation: "delete".to_string(),
            version: 2,
            data: None,
        };
        apply_remote_changes(&pool, &[delete_change]).await.unwrap();

        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM activity_log WHERE uuid='hist-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count.0, 0);
    }

    #[tokio::test]
    async fn applies_a_remote_episode_progress_rating() {
        let pool = pool().await;
        let change = RemoteSyncChange {
            sequence: 1,
            entity_type: "episode_progress".to_string(),
            entity_id: "ep-1".to_string(),
            operation: "upsert".to_string(),
            version: 1,
            data: Some(serde_json::json!({
                "uuid": "ep-1",
                "seriesId": 10,
                "episodeId": 20,
                "seasonNumber": 1,
                "episodeNumber": 2,
                "watched": 1,
                "rating": 4,
                "createdAt": "2026-01-01T00:00:00.000Z",
                "updatedAt": "2026-01-01T00:00:00.000Z",
            })),
        };
        apply_remote_changes(&pool, &[change]).await.unwrap();

        let (rating,): (i64,) = sqlx::query_as(
            "SELECT rating FROM episode_progress WHERE profile_id='default' AND uuid='ep-1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(rating, 4);
    }

    #[tokio::test]
    async fn episode_progress_outbox_payload_includes_rating() {
        let pool = pool().await;
        sqlx::query(
            "INSERT INTO episode_progress (uuid, profile_id, series_id, episode_id, season_number, episode_number, watched, rating, created_at, updated_at) \
             VALUES ('ep-1','default',10,20,1,2,1,5,'t','t')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let (payload,): (String,) = sqlx::query_as(
            "SELECT payload FROM sync_outbox WHERE entity_type='episode_progress' AND entity_id='ep-1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        let value: serde_json::Value = serde_json::from_str(&payload).unwrap();
        assert_eq!(value["rating"], 5);
    }

    #[tokio::test]
    async fn prepare_v2_seeds_activity_log_after_v1_already_ran() {
        let pool = pool().await;
        sqlx::query("UPDATE sync_control SET suppress_outbox=1 WHERE id=1")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO activity_log (uuid, profile_id, media_id, media_type, title, action, timestamp, created_at, updated_at) \
             VALUES ('hist-legacy','default',1,'movie','Legacy','movie:watched','t','t','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("UPDATE sync_control SET suppress_outbox=0 WHERE id=1")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO sync_metadata(key,value,updated_at) VALUES ('bootstrap:default','1','t')",
        )
        .execute(&pool)
        .await
        .unwrap();

        prepare(&pool).await.unwrap();

        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM sync_outbox WHERE entity_type='activity_log' AND entity_id='hist-legacy'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 1);
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
        // Both rows share the same millisecond-granularity created_at, so
        // list_outbox's tie-break (a random mutation_id) can return them in
        // either order — look each one up by its actual entity_id instead of
        // assuming an index reflects insertion order.
        let local_1 = pending
            .iter()
            .find(|row| row.entity_id == "local-1")
            .unwrap();
        let local_2 = pending
            .iter()
            .find(|row| row.entity_id == "local-2")
            .unwrap();

        // One mutation gets rebased as a conflict; the other is marked
        // failed by some other generic error, never a conflict.
        rebase_conflicts(
            &pool,
            &[SyncConflict {
                mutation_id: local_1.mutation_id.clone(),
                entity_type: "library_item".to_string(),
                entity_id: "local-1".to_string(),
                server_version: 7,
            }],
        )
        .await
        .unwrap();
        sqlx::query("UPDATE sync_outbox SET last_error='network timeout' WHERE mutation_id=?1")
            .bind(&local_2.mutation_id)
            .execute(&pool)
            .await
            .unwrap();

        let status = status(&pool).await.unwrap();
        assert_eq!(status.failed_count, 2, "both rows carry a last_error");
        assert_eq!(
            status.conflict_count, 1,
            "only the rebased row is a conflict, not the generic failure"
        );

        let conflicts = list_conflicts(&pool, 10).await.unwrap();
        assert_eq!(conflicts.len(), 1, "only the rebased row is listed");
        assert_eq!(conflicts[0].entity_type, "library_item");
        assert_eq!(conflicts[0].entity_id, "local-1");
        assert_eq!(conflicts[0].mutation_id, local_1.mutation_id);
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
