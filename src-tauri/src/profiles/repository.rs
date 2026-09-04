use sqlx::SqlitePool;

use super::models::{ProfileRow, UserProfile};
use crate::database::{new_uuid, now_iso};
use crate::error::ApiError;

pub(super) async fn list_impl(pool: &SqlitePool) -> Result<Vec<UserProfile>, ApiError> {
    let now = now_iso(pool).await?;
    sqlx::query(
        "INSERT OR IGNORE INTO profiles (uuid, name, avatar, created_at, updated_at) VALUES ('default', 'Default', NULL, $1, $1)",
    )
    .bind(&now)
    .execute(pool)
    .await
    .map_err(ApiError::from)?;

    let rows: Vec<ProfileRow> = sqlx::query_as(
        "SELECT * FROM profiles ORDER BY CASE WHEN uuid = 'default' THEN 0 ELSE 1 END, created_at ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;
    Ok(rows.into_iter().map(Into::into).collect())
}

pub(super) async fn create_impl(
    pool: &SqlitePool,
    name: &str,
    avatar: Option<String>,
    supabase_user_id: Option<String>,
) -> Result<UserProfile, ApiError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(ApiError::bad_request("Profile name is required."));
    }
    let profile = UserProfile {
        id: new_uuid(),
        name: trimmed.to_string(),
        avatar,
        created_at: now_iso(pool).await?,
        supabase_user_id,
    };

    sqlx::query(
        "INSERT INTO profiles (uuid, name, avatar, created_at, updated_at, supabase_user_id) VALUES ($1, $2, $3, $4, $4, $5)",
    )
    .bind(&profile.id)
    .bind(&profile.name)
    .bind(&profile.avatar)
    .bind(&profile.created_at)
    .bind(&profile.supabase_user_id)
    .execute(pool)
    .await
    .map_err(ApiError::from)?;

    Ok(profile)
}

/// Crate-visible so other domains can resolve a profile without duplicating
/// this query — `preferences::set_active_profile` reads `supabase_user_id`
/// off the result rather than running its own `SELECT ... FROM profiles`.
pub(crate) async fn get_by_id_impl(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<Option<UserProfile>, ApiError> {
    let row: Option<ProfileRow> = sqlx::query_as("SELECT * FROM profiles WHERE uuid = $1")
        .bind(profile_id)
        .fetch_optional(pool)
        .await
        .map_err(ApiError::from)?;
    Ok(row.map(Into::into))
}

pub(super) async fn find_by_supabase_user_id_impl(
    pool: &SqlitePool,
    supabase_user_id: &str,
) -> Result<Option<UserProfile>, ApiError> {
    let row: Option<ProfileRow> =
        sqlx::query_as("SELECT * FROM profiles WHERE supabase_user_id = $1 LIMIT 1")
            .bind(supabase_user_id)
            .fetch_optional(pool)
            .await
            .map_err(ApiError::from)?;
    Ok(row.map(Into::into))
}

pub(super) async fn link_to_supabase_user_impl(
    pool: &SqlitePool,
    profile_id: &str,
    supabase_user_id: &str,
) -> Result<UserProfile, ApiError> {
    let updated_at = now_iso(pool).await?;
    sqlx::query("UPDATE profiles SET supabase_user_id = $1, updated_at = $2 WHERE uuid = $3")
        .bind(supabase_user_id)
        .bind(&updated_at)
        .bind(profile_id)
        .execute(pool)
        .await
        .map_err(ApiError::from)?;

    get_by_id_impl(pool, profile_id)
        .await?
        .ok_or_else(|| ApiError::not_found("Profile not found."))
}

/// Resolves which local profile a signed-in Supabase account should land on:
/// the profile it's already linked to, or — only the very first time, for
/// whichever account signs in first — the 'default' profile that predates
/// Supabase auth entirely, auto-claimed so pre-existing local data isn't
/// orphaned by this feature. Returns None when neither applies, meaning the
/// caller must offer to create a brand new profile.
pub(super) async fn resolve_for_supabase_user_impl(
    pool: &SqlitePool,
    supabase_user_id: &str,
) -> Result<Option<UserProfile>, ApiError> {
    if let Some(existing) = find_by_supabase_user_id_impl(pool, supabase_user_id).await? {
        return Ok(Some(existing));
    }

    let profiles = list_impl(pool).await?;
    let default_profile = profiles.into_iter().find(|profile| profile.id == "default");
    if let Some(default_profile) = default_profile
        && default_profile.supabase_user_id.is_none()
    {
        return Ok(Some(
            link_to_supabase_user_impl(pool, "default", supabase_user_id).await?,
        ));
    }

    Ok(None)
}

pub(super) async fn remove_impl(pool: &SqlitePool, profile_id: &str) -> Result<(), ApiError> {
    if profile_id == "default" {
        return Err(ApiError::bad_request(
            "The default profile cannot be deleted.",
        ));
    }

    let mut tx = pool.begin().await.map_err(ApiError::from)?;

    // The cascade below fires every table's AFTER DELETE sync trigger (see
    // migrations/018-add-sync-outbox.sql), which would otherwise try to
    // queue an outbox row referencing the very profile row being deleted —
    // failing the FK the outbox row itself declares against `profiles`.
    // Suppressing capture here mirrors how inbound remote changes are
    // applied (sync::service::apply_remote_changes): removing a local
    // profile is not itself a mutation to push back to the cloud.
    sqlx::query("UPDATE sync_control SET suppress_outbox = 1 WHERE id = 1")
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;

    // No manual per-table cleanup needed here: every table in
    // `database::PROFILE_SCOPED_TABLES` declares
    // `profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE`
    // (see migrations.rs), the pool is opened with `.foreign_keys(true)`
    // (see database::init_pool), and `custom_list_items` cascades a second
    // level down through `custom_lists`'s own FK — SQLite cascades multiple
    // levels in one statement. Deleting the profile row alone is enough;
    // `removing_a_profile_clears_its_scoped_data` below asserts this holds
    // for every one of those tables, `custom_list_items` included.
    sqlx::query("DELETE FROM profiles WHERE uuid = $1")
        .bind(profile_id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;

    sqlx::query("UPDATE sync_control SET suppress_outbox = 0 WHERE id = 1")
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;

    tx.commit().await.map_err(ApiError::from)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn migrated_pool() -> SqlitePool {
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

    #[tokio::test]
    async fn always_includes_the_default_profile() {
        let pool = migrated_pool().await;
        let profiles = list_impl(&pool).await.unwrap();
        assert!(profiles.iter().any(|p| p.id == "default"));
    }

    #[tokio::test]
    async fn creates_additional_profiles() {
        let pool = migrated_pool().await;
        let created = create_impl(&pool, "Alex", None, None).await.unwrap();
        let profiles = list_impl(&pool).await.unwrap();
        assert!(
            profiles
                .iter()
                .any(|p| p.id == created.id && p.name == "Alex")
        );
    }

    #[tokio::test]
    async fn refuses_to_remove_the_default_profile() {
        let pool = migrated_pool().await;
        assert!(remove_impl(&pool, "default").await.is_err());
    }

    #[tokio::test]
    async fn rejects_a_whitespace_only_profile_name() {
        let pool = migrated_pool().await;
        assert!(create_impl(&pool, "   ", None, None).await.is_err());
    }

    #[tokio::test]
    async fn get_by_id_impl_returns_none_for_an_unknown_profile() {
        let pool = migrated_pool().await;
        assert!(get_by_id_impl(&pool, "ghost").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn removing_a_profile_clears_its_scoped_data() {
        let pool = migrated_pool().await;
        let created = create_impl(&pool, "Alex", None, None).await.unwrap();

        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, created_at, updated_at)
             VALUES ('l1', $1, 1, 'movie', 'Test', 'now', 'now')",
        )
        .bind(&created.id)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO seen_movies (uuid, profile_id, movie_id, title, watched_at, created_at, updated_at)
             VALUES ('s1', $1, 1, 'Test', 'now', 'now', 'now')",
        )
        .bind(&created.id)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO episode_progress (uuid, profile_id, series_id, episode_id, season_number, episode_number, created_at, updated_at)
             VALUES ('e1', $1, 1, 1, 1, 1, 'now', 'now')",
        )
        .bind(&created.id)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO tracked_series (uuid, profile_id, series_id, title, created_at, updated_at)
             VALUES ('t1', $1, 1, 'Test', 'now', 'now')",
        )
        .bind(&created.id)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, created_at)
             VALUES ('v1', $1, 1, 'movie', 'Test', 'watched', 'now', 'now')",
        )
        .bind(&created.id)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO activity_log (uuid, profile_id, media_id, media_type, title, action, timestamp, created_at, updated_at)
             VALUES ('a1', $1, 1, 'movie', 'Test', 'movie:watched', 'now', 'now', 'now')",
        )
        .bind(&created.id)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO availability_alerts (uuid, profile_id, media_id, media_type, title, region, provider_ids, created_at, updated_at)
             VALUES ('al1', $1, 1, 'movie', 'Test', 'FR', '[]', 'now', 'now')",
        )
        .bind(&created.id)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO custom_lists (uuid, profile_id, name, created_at, updated_at)
             VALUES ('cl1', $1, 'My List', 'now', 'now')",
        )
        .bind(&created.id)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO smart_lists (uuid, profile_id, name, rules, created_at, updated_at)
             VALUES ('sl1', $1, 'My Smart List', '{}', 'now', 'now')",
        )
        .bind(&created.id)
        .execute(&pool)
        .await
        .unwrap();
        // custom_list_items cascades transitively via custom_lists, not profile_id directly.
        sqlx::query(
            "INSERT INTO custom_list_items (uuid, list_id, media_id, media_type, title, position, added_at, updated_at)
             VALUES ('cli1', 'cl1', 1, 'movie', 'Test', 0, 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();

        remove_impl(&pool, &created.id).await.unwrap();

        let profiles = list_impl(&pool).await.unwrap();
        assert!(!profiles.iter().any(|p| p.id == created.id));

        for table in crate::database::PROFILE_SCOPED_TABLES {
            let remaining: (i64,) = sqlx::query_as(sqlx::AssertSqlSafe(format!(
                "SELECT COUNT(*) FROM {table} WHERE profile_id = $1"
            )))
            .bind(&created.id)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(
                remaining.0, 0,
                "{table} should have cascaded on profile deletion"
            );
        }

        let remaining_list_items: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM custom_list_items")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(
            remaining_list_items.0, 0,
            "custom_list_items should cascade transitively via custom_lists"
        );
    }

    #[tokio::test]
    async fn auto_claims_the_unclaimed_default_profile_for_the_first_account() {
        let pool = migrated_pool().await;
        let resolved = resolve_for_supabase_user_impl(&pool, "user-1")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(resolved.id, "default");
        assert_eq!(resolved.supabase_user_id.as_deref(), Some("user-1"));
    }

    #[tokio::test]
    async fn returns_the_already_linked_profile_on_subsequent_resolutions() {
        let pool = migrated_pool().await;
        resolve_for_supabase_user_impl(&pool, "user-1")
            .await
            .unwrap();
        let second = resolve_for_supabase_user_impl(&pool, "user-1")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(second.id, "default");
    }

    #[tokio::test]
    async fn returns_none_for_a_second_account_once_default_is_claimed() {
        let pool = migrated_pool().await;
        resolve_for_supabase_user_impl(&pool, "user-1")
            .await
            .unwrap();
        assert!(
            resolve_for_supabase_user_impl(&pool, "user-2")
                .await
                .unwrap()
                .is_none()
        );
    }

    #[tokio::test]
    async fn the_unique_index_rejects_linking_a_second_profile_to_an_already_claimed_account() {
        let pool = migrated_pool().await;
        resolve_for_supabase_user_impl(&pool, "user-1")
            .await
            .unwrap();
        let second = create_impl(&pool, "Camille", None, Some("user-2".to_string()))
            .await
            .unwrap();

        let result = link_to_supabase_user_impl(&pool, &second.id, "user-1").await;
        assert!(result.is_err());
    }
}
