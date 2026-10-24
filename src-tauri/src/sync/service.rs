//! Cloud sync use cases, as one facade over its parts:
//!
//! - `keys`: the `sync_metadata` keys of a profile's bookkeeping;
//! - `bootstrap`: who may sync, and the first outbox snapshot;
//! - `outbox`: what waits to be pushed, acknowledgements and conflicts;
//! - `apply` (`merge`, `orphans`): replaying pulled documents locally.
//!
//! Which entity types exist, and how each is stored, lives in `registry`.

use sqlx::{Sqlite, SqlitePool, Transaction};

use crate::database::{current_profile_id, new_uuid, now_iso};
use crate::error::ApiError;

mod apply;
pub(super) mod bootstrap;
mod keys;
mod outbox;

#[cfg(test)]
pub use apply::apply_remote_changes;
pub use apply::apply_remote_changes_for;
pub use bootstrap::{assert_run_profile, prepare_for_account};
pub use outbox::{ack_mutations, list_conflicts, list_outbox, rebase_conflicts, status};

#[cfg(test)]
use bootstrap::prepare;
use keys::{
    DEVICE_ID_KEY, bootstrap_key, bootstrap_v2_key, cursor_key, last_synced_key, orphan_key_prefix,
};

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

pub async fn cursor(pool: &SqlitePool) -> Result<i64, ApiError> {
    let profile_id = current_profile_id(pool).await?;
    let value: Option<(String,)> = sqlx::query_as("SELECT value FROM sync_metadata WHERE key=?1")
        .bind(cursor_key(&profile_id))
        .fetch_optional(pool)
        .await
        .map_err(ApiError::from)?;
    Ok(value.and_then(|(v,)| v.parse().ok()).unwrap_or(0))
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

#[cfg(test)]
mod tests;
