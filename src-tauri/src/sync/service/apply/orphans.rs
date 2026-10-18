//! List items that reach a device before (or while) their list is absent.

use sqlx::{Sqlite, Transaction};

use crate::database::now_iso;
use crate::error::ApiError;

use super::super::keys::orphan_key_prefix;
use super::upsert_entity;

/// A list item can reach a device before its list does, or while the list is
/// deleted (someone added to a list another device just removed, and the list
/// may well come back). The change can't be stored — the item needs its
/// parent — but the cursor moves past it, so it is parked here, in
/// `sync_metadata`, until its list shows up.
pub(super) async fn stash_orphaned_item(
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

pub(super) async fn forget_orphaned_item(
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
pub(super) async fn apply_orphaned_items(
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
