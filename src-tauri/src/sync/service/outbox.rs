//! The local outbox: what is waiting to be pushed, its acknowledgement, and
//! the conflicts the server reported back.

use sqlx::SqlitePool;

use crate::database::{current_profile_id, now_iso};
use crate::error::ApiError;

use super::super::models::{
    SyncConflict, SyncConflictDetail, SyncMutationAck, SyncOutboxMutation, SyncStatus,
};
use super::super::registry::validate_entity_type;
use super::keys::last_synced_key;
use super::{cursor, device_id};

// Shared between rebase_conflicts (which writes it) and status (which counts
// rows matching it) — see CLAUDE.md's "No hand-duplicated literal lists".
const CONFLICT_MARKER: &str = "optimistic conflict; rebased";

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
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(ApiError::from)?;
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
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(ApiError::from)?;
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
