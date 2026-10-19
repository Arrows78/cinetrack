//! Two rows under two uuids for the same business key: which one survives.

use sqlx::{Sqlite, Transaction};

use crate::database::{new_uuid, now_iso};
use crate::error::ApiError;

use super::super::super::registry::{EntityDescriptor, descriptor};
use super::run_upsert;

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
pub(super) async fn merge_duplicate_business_key(
    tx: &mut Transaction<'_, Sqlite>,
    profile_id: &str,
    entity_type: &str,
    keyed: &EntityDescriptor,
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
pub(super) async fn find_duplicate_by_business_key(
    tx: &mut Transaction<'_, Sqlite>,
    profile_id: &str,
    entity_type: &str,
    data: &serde_json::Value,
) -> Result<Option<(&'static EntityDescriptor, String)>, ApiError> {
    let Some(keyed) = descriptor(entity_type).filter(|entity| !entity.business_key.is_empty())
    else {
        return Ok(None);
    };
    let payload = serde_json::to_string(data)
        .map_err(|error| ApiError::bad_request(format!("Invalid remote payload: {error}")))?;
    let conditions = keyed
        .business_key
        .iter()
        .map(|(column, field)| format!("t.{column} = json_extract(?1,'$.{field}')"))
        .collect::<Vec<_>>()
        .join(" AND ");
    let lookup = format!(
        "SELECT t.uuid FROM {} t WHERE {} AND {conditions}",
        keyed.table,
        keyed.scope_sql()
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
