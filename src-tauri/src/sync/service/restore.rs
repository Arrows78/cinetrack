//! What a backup restore tells the cloud.
//!
//! A restore empties every profile's rows, outbox and per-document state and
//! forgets the pull cursor, so the next sync pulls everything again. Without
//! this, a document the restored data no longer holds (a title deleted since
//! the backup was taken) is pulled straight back as a new row.
//!
//! The restore snapshots which documents the cloud is known to hold before it
//! purges (`snapshot_synced_documents`) and, once the backup is inserted,
//! queues a delete for each of them that no restored row still stands for
//! (`queue_deletes_for_missing_documents`). The push runs before the pull in
//! a sync round, so the deletes reach the cloud first. A restored row stands
//! for a document when it has the document's uuid or, for the entity types
//! that are keyed by title, the same business key under a new uuid (the
//! restore gives those a fresh uuid, and the pull merges them back by key).

use sqlx::SqliteConnection;

use super::super::registry::{ENTITY_REGISTRY, EntityDescriptor, Scope};
use crate::error::ApiError;

const SNAPSHOT: &str = "restore_synced_documents";

/// `json_array(t.col, ...)` over a descriptor's business key; `None` when
/// the uuid is the only identity.
fn key_sql(entity: &EntityDescriptor, alias: &str) -> Option<String> {
    if entity.business_key.is_empty() {
        return None;
    }
    let columns = entity
        .business_key
        .iter()
        .map(|(column, _)| format!("{alias}.{column}"))
        .collect::<Vec<_>>()
        .join(", ");
    Some(format!("json_array({columns})"))
}

fn in_profile_sql(entity: &EntityDescriptor) -> &'static str {
    match entity.scope {
        Scope::ParentList => {
            "t.list_id IN (SELECT uuid FROM custom_lists WHERE profile_id = d.profile_id)"
        }
        Scope::Profile | Scope::Account => "t.profile_id = d.profile_id",
    }
}

/// Records, before a restore purges anything, the live documents the cloud is
/// known to hold for every profile except `withheld_json` (a JSON array of
/// profile uuids a restore leaves alone).
pub(crate) async fn snapshot_synced_documents(
    conn: &mut SqliteConnection,
    withheld_json: &str,
) -> Result<(), ApiError> {
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "CREATE TEMP TABLE IF NOT EXISTS {SNAPSHOT} (
           profile_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
           remote_version INTEGER NOT NULL, business_key TEXT)"
    )))
    .execute(&mut *conn)
    .await
    .map_err(ApiError::from)?;
    sqlx::query(sqlx::AssertSqlSafe(format!("DELETE FROM {SNAPSHOT}")))
        .execute(&mut *conn)
        .await
        .map_err(ApiError::from)?;

    for entity in ENTITY_REGISTRY.iter().filter(|e| e.scope != Scope::Account) {
        let key = key_sql(entity, "t").unwrap_or_else(|| "NULL".to_string());
        // Table and column names come from the static registry, never from input.
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "INSERT INTO {SNAPSHOT}
             SELECT s.profile_id, s.entity_type, s.entity_id, s.remote_version, {key}
             FROM sync_entity_state s LEFT JOIN {table} t ON t.uuid = s.entity_id
             WHERE s.entity_type = ?1 AND s.deleted = 0 AND s.remote_version > 0
               AND s.profile_id NOT IN (SELECT value FROM json_each(?2))",
            table = entity.table
        )))
        .bind(entity.entity_type)
        .bind(withheld_json)
        .execute(&mut *conn)
        .await
        .map_err(ApiError::from)?;
    }
    Ok(())
}

/// Queues a delete for every snapshotted document no restored row stands for,
/// then drops the snapshot. Documents of a profile the restore removed are
/// left alone, like when a profile is deleted by hand.
pub(crate) async fn queue_deletes_for_missing_documents(
    conn: &mut SqliteConnection,
) -> Result<(), ApiError> {
    for entity in ENTITY_REGISTRY.iter().filter(|e| e.scope != Scope::Account) {
        let same_key = key_sql(entity, "t")
            .map(|key| format!(" OR (d.business_key IS NOT NULL AND {key} = d.business_key)"))
            .unwrap_or_default();
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "INSERT INTO sync_outbox(mutation_id, profile_id, entity_type, entity_id, operation, payload, base_version, created_at)
             SELECT lower(hex(randomblob(16))), d.profile_id, d.entity_type, d.entity_id, 'delete', NULL,
                    d.remote_version, strftime('%Y-%m-%dT%H:%M:%f', 'now') || 'Z'
             FROM {SNAPSHOT} d
             WHERE d.entity_type = ?1
               AND EXISTS (SELECT 1 FROM profiles p WHERE p.uuid = d.profile_id)
               AND NOT EXISTS (
                 SELECT 1 FROM {table} t
                 WHERE {in_profile} AND (t.uuid = d.entity_id{same_key}))
             ON CONFLICT(profile_id, entity_type, entity_id) DO UPDATE SET
               mutation_id = excluded.mutation_id, operation = 'delete', payload = NULL,
               base_version = excluded.base_version, created_at = excluded.created_at,
               attempt_count = 0, last_error = NULL",
            table = entity.table,
            in_profile = in_profile_sql(entity),
        )))
        .bind(entity.entity_type)
        .execute(&mut *conn)
        .await
        .map_err(ApiError::from)?;
    }
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "DROP TABLE IF EXISTS {SNAPSHOT}"
    )))
    .execute(&mut *conn)
    .await
    .map_err(ApiError::from)?;
    Ok(())
}
