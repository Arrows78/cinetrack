//! Applying documents pulled from the cloud to the local database.

use sqlx::{Sqlite, SqlitePool, Transaction};

use crate::database::now_iso;
use crate::error::ApiError;
use crate::models::MediaType;

use super::super::models::RemoteSyncChange;
use super::super::registry::{Scope, descriptor, media_type_of, validate_entity_type};
use super::keys::{cursor_key, orphan_key_prefix};

mod merge;
mod orphans;

use merge::{find_duplicate_by_business_key, merge_duplicate_business_key};
use orphans::{apply_orphaned_items, forget_orphaned_item, stash_orphaned_item};

async fn delete_entity(
    tx: &mut Transaction<'_, Sqlite>,
    profile_id: &str,
    entity_type: &str,
    entity_id: &str,
) -> Result<(), ApiError> {
    let sql = descriptor(entity_type)
        .and_then(|entity| entity.delete_sql())
        .ok_or_else(|| ApiError::bad_request("Unsupported sync entity type"))?;
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
    sqlx::query(sqlx::AssertSqlSafe(sql))
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
pub(super) async fn run_upsert(
    tx: &mut Transaction<'_, Sqlite>,
    profile_id: &str,
    entity_type: &str,
    data: &serde_json::Value,
) -> Result<bool, ApiError> {
    let payload = serde_json::to_string(data)
        .map_err(|error| ApiError::bad_request(format!("Invalid remote payload: {error}")))?;
    let entity = descriptor(entity_type)
        .ok_or_else(|| ApiError::bad_request("Unsupported sync entity type"))?;

    // `preferences` has no profile_id column at all (it's a single global
    // key/value table, not a per-profile one — see its own migration) and
    // its natural identity is `key` itself, never a generated uuid, so it
    // takes a one-bind-param statement of its own rather than the generic
    // (payload, profile_id) execute path every other entity type shares
    // below.
    if entity.scope == Scope::Account {
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
        sqlx::query(entity.upsert_sql)
            .bind(&payload)
            .execute(&mut **tx)
            .await
            .map_err(ApiError::from)?;
        return Ok(true);
    }

    // The statement's conflict target is the business key where there is one:
    // see the note on `ENTITY_REGISTRY`.
    let result = sqlx::query(entity.upsert_sql)
        .bind(payload)
        .bind(profile_id)
        .execute(&mut **tx)
        .await
        .map_err(ApiError::from)?;
    Ok(result.rows_affected() > 0)
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
        return merge_duplicate_business_key(tx, profile_id, entity_type, keyed, local_uuid, data)
            .await;
    }
    run_upsert(tx, profile_id, entity_type, data).await
}

/// Applies one remote change (and records its remote version) inside the
/// caller's savepoint. A local pending edit of the same entity is preserved
/// and only rebased.
async fn apply_one_remote_change(
    tx: &mut Transaction<'_, Sqlite>,
    profile_id: &str,
    change: &RemoteSyncChange,
) -> Result<(), ApiError> {
    let pending: Option<(String,)> = sqlx::query_as(
        "SELECT operation FROM sync_outbox WHERE profile_id=?1 AND entity_type=?2 AND entity_id=?3",
    )
    .bind(profile_id)
    .bind(&change.entity_type)
    .bind(&change.entity_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(ApiError::from)?;

    // Recorded before the change is applied: re-capturing a row under a
    // canonical uuid (see merge_duplicate_business_key) bases its
    // mutation on this version.
    let now = now_iso(&mut **tx).await?;
    sqlx::query(
        "INSERT INTO sync_entity_state(profile_id,entity_type,entity_id,remote_version,deleted,updated_at) \
         VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(profile_id,entity_type,entity_id) DO UPDATE SET \
         remote_version=excluded.remote_version,deleted=excluded.deleted,updated_at=excluded.updated_at",
    ).bind(profile_id).bind(&change.entity_type).bind(&change.entity_id).bind(change.version)
     .bind(if change.operation == "delete" { 1_i64 } else { 0_i64 }).bind(now)
     .execute(&mut **tx).await.map_err(ApiError::from)?;

    if pending.is_none() {
        match change.operation.as_str() {
            "delete" => {
                delete_entity(tx, profile_id, &change.entity_type, &change.entity_id).await?;
                if change.entity_type == "custom_list_item" {
                    forget_orphaned_item(tx, profile_id, &change.entity_id).await?;
                }
            }
            "upsert" => {
                let data = change
                    .data
                    .as_ref()
                    .ok_or_else(|| ApiError::bad_request("Remote upsert has no payload"))?;
                // A viewing event with an unreadable date would make every
                // statistic fail: it is skipped (and logged) like any other
                // document that cannot be applied. A readable one is stored
                // in canonical form, as SQL orders these dates as strings.
                let normalized;
                let data = if change.entity_type == "viewing_event" {
                    let canonical = crate::database::canonical_instant(
                        data.get("watchedAt")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or_default(),
                    )?;
                    let mut copy = data.clone();
                    if let Some(object) = copy.as_object_mut() {
                        object.insert(
                            "watchedAt".to_string(),
                            serde_json::Value::String(canonical),
                        );
                    }
                    normalized = copy;
                    &normalized
                } else {
                    data
                };
                let written = upsert_entity(tx, profile_id, &change.entity_type, data).await?;
                if change.entity_type == "custom_list_item" {
                    if written {
                        forget_orphaned_item(tx, profile_id, &change.entity_id).await?;
                    } else {
                        stash_orphaned_item(tx, profile_id, &change.entity_id, data).await?;
                    }
                }
            }
            _ => return Err(ApiError::bad_request("Unsupported remote sync operation")),
        }
    } else {
        // Preserve the local pending edit, but rebase it onto the version
        // we just observed so its next push resolves the concurrent edit.
        sqlx::query("UPDATE sync_outbox SET base_version=?1 WHERE profile_id=?2 AND entity_type=?3 AND entity_id=?4")
            .bind(change.version).bind(profile_id).bind(&change.entity_type).bind(&change.entity_id)
            .execute(&mut **tx).await.map_err(ApiError::from)?;
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
                find_duplicate_by_business_key(tx, profile_id, &change.entity_type, data).await?
        {
            merge_duplicate_business_key(
                tx,
                profile_id,
                &change.entity_type,
                keyed,
                local_uuid,
                data,
            )
            .await?;
        }
    }
    Ok(())
}

/// The title (movie or series) a change to viewing data is about, so its
/// library status can be reconsidered once the batch is applied. Read before
/// the change is applied: a delete carries no payload, and the row it removes
/// is the only place the title can still be found.
async fn title_of_change(
    tx: &mut Transaction<'_, Sqlite>,
    profile_id: &str,
    change: &RemoteSyncChange,
) -> Result<Option<(i64, MediaType)>, ApiError> {
    let Some(entity) = descriptor(&change.entity_type) else {
        return Ok(None);
    };
    if change.operation == "delete" {
        let Some(sql) = entity.title.select_sql(entity.table) else {
            return Ok(None);
        };
        let row: Option<(i64, String)> = sqlx::query_as(sqlx::AssertSqlSafe(sql))
            .bind(profile_id)
            .bind(&change.entity_id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(ApiError::from)?;
        return Ok(row.and_then(|(id, media_type)| media_type_of(&media_type).map(|t| (id, t))));
    }
    Ok(change
        .data
        .as_ref()
        .and_then(|data| entity.title.title_in_payload(data)))
}

/// Applies `changes` to the active profile (see `apply_remote_changes_for`
/// for callers that already know which profile the run belongs to). The
/// command always names the profile, so only the tests use this.
#[cfg(test)]
pub async fn apply_remote_changes(
    pool: &SqlitePool,
    changes: &[RemoteSyncChange],
) -> Result<(), ApiError> {
    let profile_id = crate::database::current_profile_id(pool).await?;
    apply_remote_changes_for(pool, &profile_id, changes).await
}

/// Applies `changes` to `profile_id`, the profile the sync run was started
/// for. The active profile and the cursor are read inside the write
/// transaction: read beforehand, a profile switch (or an overlapping apply)
/// between the check and the write would land the changes on the wrong
/// profile or write the cursor backwards.
pub async fn apply_remote_changes_for(
    pool: &SqlitePool,
    profile_id: &str,
    changes: &[RemoteSyncChange],
) -> Result<(), ApiError> {
    if changes.is_empty() {
        return Ok(());
    }
    let mut ordered = changes.to_vec();
    ordered.sort_by_key(|change| change.sequence);
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(ApiError::from)?;
    let active: Option<(String,)> =
        sqlx::query_as("SELECT value FROM preferences WHERE key = 'activeProfileId'")
            .fetch_optional(&mut *tx)
            .await
            .map_err(ApiError::from)?;
    let active = active
        .and_then(|(value,)| serde_json::from_str::<String>(&value).ok())
        .unwrap_or_else(|| crate::database::DEFAULT_PROFILE_ID.to_string());
    if active != profile_id {
        return Err(ApiError::conflict(
            "The active profile changed during the sync run.",
        ));
    }
    let profile_id = profile_id.to_string();
    let stored_cursor: Option<(String,)> =
        sqlx::query_as("SELECT value FROM sync_metadata WHERE key=?1")
            .bind(cursor_key(&profile_id))
            .fetch_optional(&mut *tx)
            .await
            .map_err(ApiError::from)?;
    let initial_cursor: i64 = stored_cursor
        .and_then(|(value,)| value.parse().ok())
        .unwrap_or(0);
    sqlx::query("UPDATE sync_control SET suppress_outbox=1 WHERE id=1")
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;

    let mut max_sequence = initial_cursor;
    // Titles whose viewing data this batch touches: their library status is
    // reconsidered at the end (see below).
    let mut touched_titles: std::collections::BTreeSet<(i64, i64)> =
        std::collections::BTreeSet::new();
    for change in &ordered {
        if change.sequence <= max_sequence {
            continue;
        }
        if let Some((id, media_type)) = title_of_change(&mut tx, &profile_id, change).await? {
            touched_titles.insert((id, if media_type == MediaType::Movie { 0 } else { 1 }));
        }
        // A change of a type this build doesn't know (written by a newer
        // app version) can't be applied, but it must still move the cursor:
        // otherwise a page made only of such changes is fetched again
        // forever and never lets the changes behind it through.
        if !validate_entity_type(&change.entity_type) {
            max_sequence = change.sequence;
            continue;
        }
        // Each change is applied inside its own savepoint: one document that
        // cannot be applied (invalid payload, a NOT NULL value missing, an
        // unsupported operation) is logged and skipped instead of failing
        // the whole pull, and the cursor still moves past it so the next
        // pull does not fetch it again forever.
        let mut savepoint = sqlx::Acquire::begin(&mut tx)
            .await
            .map_err(ApiError::from)?;
        match apply_one_remote_change(&mut savepoint, &profile_id, change).await {
            Ok(()) => savepoint.commit().await.map_err(ApiError::from)?,
            Err(error) => {
                savepoint.rollback().await.map_err(ApiError::from)?;
                eprintln!(
                    "sync: skipped remote change {} {} #{} (sequence {}): {}",
                    change.operation,
                    change.entity_type,
                    change.entity_id,
                    change.sequence,
                    error.message
                );
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

    // The batch may have brought watched episodes (or a seen movie, or new
    // totals) from another device without the library status that goes with
    // them, or two devices may have moved the status differently. Every
    // touched title's status is reconsidered from the progress now stored
    // here; a status that changes as a result is queued for the cloud (the
    // outbox is on again), and the other device reaches the same value from
    // the same facts, so the devices converge rather than ping-pong. A status
    // the viewer chose by hand is not touched, except for the same forward
    // moves watching itself makes. See library/status.rs.
    if !touched_titles.is_empty() {
        let now = now_iso(&mut *tx).await?;
        for (id, kind) in touched_titles {
            let media_type = if kind == 0 {
                MediaType::Movie
            } else {
                MediaType::Series
            };
            // The viewing log arrives in the cloud's order, not the order it
            // was logged in here: settle which event is the latest of each
            // title against the progress tables first (progress/event_order.rs).
            crate::progress::align_event_order_with_progress(&mut tx, &profile_id, id, media_type)
                .await?;
            crate::library::reconcile_title_impl(
                &mut tx,
                &profile_id,
                id,
                media_type,
                crate::library::StatusTrigger::Refreshed,
                &now,
            )
            .await?;
        }
    }
    tx.commit().await.map_err(ApiError::from)
}
