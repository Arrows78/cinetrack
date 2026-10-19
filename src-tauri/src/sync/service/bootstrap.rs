//! First-sync bootstrap: turns the data a profile already holds into an
//! outbox snapshot, once per profile, and guards who may sync at all.

use sqlx::SqlitePool;

use crate::database::{current_profile_id, now_iso};
use crate::error::ApiError;
use crate::preferences::ACCOUNT_SCOPE_PREFERENCE_KEYS;

use super::super::registry::{ENTITY_REGISTRY, Scope, Seed};
use super::keys::{bootstrap_key, bootstrap_v2_key};

/// `viewing_events` has no UPDATE capture because it is append-like: its
/// legacy rows go straight into the outbox with the exact payload shape used
/// by its INSERT trigger (checked against it by the registry's parity test).
pub(in crate::sync) const VIEWING_EVENT_SEED_SQL: &str = "INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at) \
     SELECT lower(hex(randomblob(16))),profile_id,'viewing_event',uuid,'upsert', \
       json_object('uuid',uuid,'mediaId',media_id,'mediaType',media_type,'title',title,'eventType',event_type,'watchedAt',watched_at,'durationMinutes',duration_minutes,'episodeId',episode_id,'seasonNumber',season_number,'episodeNumber',episode_number,'note',note,'createdAt',created_at), \
       COALESCE((SELECT remote_version FROM sync_entity_state s WHERE s.profile_id=viewing_events.profile_id AND s.entity_type='viewing_event' AND s.entity_id=viewing_events.uuid),0), \
       strftime('%Y-%m-%dT%H:%M:%f','now')||'Z' \
     FROM viewing_events WHERE profile_id=?1 \
     ON CONFLICT(profile_id,entity_type,entity_id) DO NOTHING";

/// saved_filters currently has create/delete but no edit path in the UI;
/// existing rows are seeded directly.
pub(in crate::sync) const SAVED_FILTER_SEED_SQL: &str = "INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at) \
     SELECT lower(hex(randomblob(16))),profile_id,'saved_filter',uuid,'upsert', \
       json_object('uuid',uuid,'page',page,'name',name,'filters',filters,'createdAt',created_at,'updatedAt',updated_at), \
       COALESCE((SELECT remote_version FROM sync_entity_state s WHERE s.profile_id=saved_filters.profile_id AND s.entity_type='saved_filter' AND s.entity_id=saved_filters.uuid),0), \
       strftime('%Y-%m-%dT%H:%M:%f','now')||'Z' \
     FROM saved_filters WHERE profile_id=?1 \
     ON CONFLICT(profile_id,entity_type,entity_id) DO NOTHING";

/// Preferences have no profile_id column of their own (see the
/// `account_preferences` upsert) and no per-row identity beyond `key` — this
/// bootstrap read is scoped to the account-scope keys only, via the same list
/// `write_preference` gates new writes on, so a device-only setting (theme,
/// backupDirectory, activeProfileId, ...) never leaves this install just
/// because sync happened to be turned on.
pub(in crate::sync) fn account_preferences_seed_sql() -> String {
    let account_preference_keys = ACCOUNT_SCOPE_PREFERENCE_KEYS
        .iter()
        .map(|key| format!("'{key}'"))
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "INSERT INTO sync_outbox(mutation_id,profile_id,entity_type,entity_id,operation,payload,base_version,created_at) \
         SELECT lower(hex(randomblob(16))),?1,'account_preferences',key,'upsert', \
           json_object('key',key,'value',value,'updatedAt',updated_at), \
           COALESCE((SELECT remote_version FROM sync_entity_state s WHERE s.profile_id=?1 AND s.entity_type='account_preferences' AND s.entity_id=preferences.key),0), \
           strftime('%Y-%m-%dT%H:%M:%f','now')||'Z' \
         FROM preferences WHERE key IN ({account_preference_keys}) \
         ON CONFLICT(profile_id,entity_type,entity_id) DO NOTHING"
    )
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

pub(super) async fn prepare(pool: &SqlitePool) -> Result<(), ApiError> {
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
    for entity in ENTITY_REGISTRY
        .iter()
        .filter(|entity| entity.seed == Seed::NoopUpdate)
    {
        debug_assert_eq!(entity.scope, Scope::Profile);
        let query = format!(
            "UPDATE {} SET uuid = uuid WHERE profile_id = ?1",
            entity.table
        );
        sqlx::query(sqlx::AssertSqlSafe(query))
            .bind(&profile_id)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from)?;
    }
    sqlx::query(VIEWING_EVENT_SEED_SQL)
        .bind(&profile_id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;

    // Child rows scope through their parent list.
    for entity in ENTITY_REGISTRY
        .iter()
        .filter(|entity| entity.seed == Seed::ChildOfList)
    {
        let query = format!(
            "UPDATE {} SET uuid = uuid WHERE list_id IN \
             (SELECT uuid FROM custom_lists WHERE profile_id = ?1)",
            entity.table
        );
        sqlx::query(sqlx::AssertSqlSafe(query))
            .bind(&profile_id)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from)?;
    }

    sqlx::query(SAVED_FILTER_SEED_SQL)
        .bind(&profile_id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;

    sqlx::query(sqlx::AssertSqlSafe(account_preferences_seed_sql()))
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
