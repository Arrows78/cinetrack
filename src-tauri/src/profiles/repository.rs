use sqlx::SqlitePool;

use super::models::{ProfileRow, UserProfile};
use super::pin::{check_pin, hash_new_pin};
use crate::database::{current_profile_id, new_uuid, now_iso};
use crate::error::ApiError;

/// Same bound as a custom list's name (`lists::custom`).
pub(super) const MAX_PROFILE_NAME_LENGTH: usize = 100;
/// Avatars are a preset key or a short path; this only keeps a free-form
/// string from growing without limit.
pub(super) const MAX_AVATAR_LENGTH: usize = 200;
/// More than a household needs; stops a runaway caller from filling the
/// profile switcher (and the sync bookkeeping kept per profile).
pub(super) const MAX_PROFILES: i64 = 20;

fn validated_name(name: &str) -> Result<&str, ApiError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(ApiError::bad_request("Profile name is required."));
    }
    if trimmed.chars().count() > MAX_PROFILE_NAME_LENGTH {
        return Err(ApiError::bad_request(format!(
            "The profile name cannot exceed {MAX_PROFILE_NAME_LENGTH} characters."
        )));
    }
    Ok(trimmed)
}

/// An empty avatar means none. Otherwise it is stored as given, as long as it
/// is short and printable.
fn validated_avatar(avatar: Option<String>) -> Result<Option<String>, ApiError> {
    let Some(avatar) = avatar else {
        return Ok(None);
    };
    let trimmed = avatar.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.chars().count() > MAX_AVATAR_LENGTH {
        return Err(ApiError::bad_request(format!(
            "The avatar cannot exceed {MAX_AVATAR_LENGTH} characters."
        )));
    }
    if trimmed.chars().any(char::is_control) {
        return Err(ApiError::bad_request(
            "The avatar contains invalid characters.",
        ));
    }
    Ok(Some(trimmed.to_string()))
}

/// The column is UNIQUE (one account, one local profile): say so instead of
/// surfacing the raw constraint failure.
fn account_conflict(error: sqlx::Error) -> ApiError {
    if let sqlx::Error::Database(db_error) = &error
        && db_error.is_unique_violation()
    {
        return ApiError::conflict("This account is already linked to another profile.");
    }
    ApiError::from(error)
}

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
    let name = validated_name(name)?;
    let avatar = validated_avatar(avatar)?;
    let profile = UserProfile {
        id: new_uuid(),
        name: name.to_string(),
        avatar,
        created_at: now_iso(pool).await?,
        supabase_user_id,
        has_pin: false,
    };

    // The cap is checked by the INSERT itself so two concurrent creations
    // cannot both slip under it.
    let inserted = sqlx::query(
        "INSERT INTO profiles (uuid, name, avatar, created_at, updated_at, supabase_user_id)
         SELECT $1, $2, $3, $4, $4, $5 WHERE (SELECT COUNT(*) FROM profiles) < $6",
    )
    .bind(&profile.id)
    .bind(&profile.name)
    .bind(&profile.avatar)
    .bind(&profile.created_at)
    .bind(&profile.supabase_user_id)
    .bind(MAX_PROFILES)
    .execute(pool)
    .await
    .map_err(account_conflict)?;
    if inserted.rows_affected() == 0 {
        return Err(ApiError::bad_request(format!(
            "No more than {MAX_PROFILES} profiles can be created."
        )));
    }

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

/// `supabase_user_id` is the linked identity provider account id — a
/// Clerk `sub` ("user_xxx") since the Clerk migration, not necessarily a
/// Supabase Auth uuid. See models.rs's doc comment on the field for why
/// the name itself wasn't changed.
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

/// Links a profile to an account. The checks and the update share one
/// transaction, so two callers racing for the same profile or account cannot
/// both pass the checks; the UNIQUE index is still the last word and its
/// failure is reported as a conflict, not as raw SQL. The caller is expected
/// to have passed the profile's PIN lock first (see `authorize_pin_protected_access`).
pub(super) async fn link_to_supabase_user_impl(
    pool: &SqlitePool,
    profile_id: &str,
    supabase_user_id: &str,
) -> Result<UserProfile, ApiError> {
    if supabase_user_id.trim().is_empty() {
        return Err(ApiError::bad_request("An account id is required."));
    }
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(ApiError::from)?;

    let linked: Option<(Option<String>,)> =
        sqlx::query_as("SELECT supabase_user_id FROM profiles WHERE uuid = $1")
            .bind(profile_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(ApiError::from)?;
    let Some((linked,)) = linked else {
        return Err(ApiError::not_found("Profile not found."));
    };
    match linked.as_deref() {
        // Already linked to this account: nothing to do (idempotent).
        Some(linked) if linked == supabase_user_id => {
            drop(tx);
            return get_by_id_impl(pool, profile_id)
                .await?
                .ok_or_else(|| ApiError::not_found("Profile not found."));
        }
        // A profile belongs to one account for good; re-pointing it would
        // hand that person's library to whoever signs in next.
        Some(_) => {
            return Err(ApiError::forbidden(
                "This profile is already linked to another account.",
            ));
        }
        None => {}
    }

    let updated_at = now_iso(&mut *tx).await?;
    let updated = sqlx::query(
        "UPDATE profiles SET supabase_user_id = $1, updated_at = $2
         WHERE uuid = $3 AND supabase_user_id IS NULL",
    )
    .bind(supabase_user_id)
    .bind(&updated_at)
    .bind(profile_id)
    .execute(&mut *tx)
    .await
    .map_err(account_conflict)?;
    if updated.rows_affected() == 0 {
        return Err(ApiError::conflict(
            "This profile was linked to an account in the meantime.",
        ));
    }
    tx.commit().await.map_err(ApiError::from)?;

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
    // A PIN-protected default is not claimed on sight: the claim hands over
    // everything it holds, so it goes through `link_profile_to_supabase_user`,
    // which asks for the PIN.
    if let Some(default_profile) = default_profile
        && default_profile.supabase_user_id.is_none()
        && !default_profile.has_pin
    {
        return Ok(Some(
            link_to_supabase_user_impl(pool, "default", supabase_user_id).await?,
        ));
    }

    Ok(None)
}

pub(super) async fn update_impl(
    pool: &SqlitePool,
    profile_id: &str,
    name: &str,
    avatar: Option<String>,
) -> Result<UserProfile, ApiError> {
    let trimmed = validated_name(name)?;
    let avatar = validated_avatar(avatar)?;
    let updated_at = now_iso(pool).await?;
    sqlx::query("UPDATE profiles SET name = $1, avatar = $2, updated_at = $3 WHERE uuid = $4")
        .bind(trimmed)
        .bind(&avatar)
        .bind(&updated_at)
        .bind(profile_id)
        .execute(pool)
        .await
        .map_err(ApiError::from)?;

    get_by_id_impl(pool, profile_id)
        .await?
        .ok_or_else(|| ApiError::not_found("Profile not found."))
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

    // The active profile must never end up pointing at a row that no longer
    // exists: every write for it would then fail its profile foreign key. The
    // caller used to reset it in a second step after this one, which a failure
    // or a quit in between left undone. Same transaction, so both or neither.
    let removed_as_json =
        serde_json::to_string(profile_id).map_err(|error| ApiError::internal(error.to_string()))?;
    let now = now_iso(&mut *tx).await?;
    sqlx::query(
        "UPDATE preferences SET value = '\"default\"', updated_at = $1
         WHERE key = 'activeProfileId' AND value = $2",
    )
    .bind(&now)
    .bind(&removed_as_json)
    .execute(&mut *tx)
    .await
    .map_err(ApiError::from)?;
    // The cursor and bootstrap markers live in `sync_metadata`, keyed by the
    // profile id with no foreign key to cascade through.
    crate::sync::forget_profile(&mut tx, profile_id).await?;

    sqlx::query("UPDATE sync_control SET suppress_outbox = 0 WHERE id = 1")
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;

    tx.commit().await.map_err(ApiError::from)?;
    Ok(())
}

/// A 4-6 digit PIN is the shape every OS-level "screen lock PIN" convention
/// already uses — long enough to not be a coin-flip guess, short enough to
/// type one-handed switching profiles.
fn validate_pin_shape(pin: &str) -> Result<(), ApiError> {
    if pin.len() < 4 || pin.len() > 6 || !pin.chars().all(|character| character.is_ascii_digit()) {
        return Err(ApiError::bad_request("PIN must be 4 to 6 digits."));
    }
    Ok(())
}

pub(super) async fn set_pin_impl(
    pool: &SqlitePool,
    profile_id: &str,
    pin: &str,
) -> Result<UserProfile, ApiError> {
    validate_pin_shape(pin)?;
    let (hash, salt) = hash_new_pin(pin)?;
    let updated_at = now_iso(pool).await?;
    sqlx::query(
        "UPDATE profiles SET pin_hash = $1, pin_salt = $2, pin_failed_attempts = 0,
           pin_locked_until = NULL, updated_at = $3 WHERE uuid = $4",
    )
    .bind(&hash)
    .bind(&salt)
    .bind(&updated_at)
    .bind(profile_id)
    .execute(pool)
    .await
    .map_err(ApiError::from)?;

    get_by_id_impl(pool, profile_id)
        .await?
        .ok_or_else(|| ApiError::not_found("Profile not found."))
}

pub(super) async fn clear_pin_impl(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<UserProfile, ApiError> {
    let updated_at = now_iso(pool).await?;
    sqlx::query(
        "UPDATE profiles SET pin_hash = NULL, pin_salt = NULL, pin_failed_attempts = 0,
           pin_locked_until = NULL, updated_at = $1 WHERE uuid = $2",
    )
    .bind(&updated_at)
    .bind(profile_id)
    .execute(pool)
    .await
    .map_err(ApiError::from)?;

    get_by_id_impl(pool, profile_id)
        .await?
        .ok_or_else(|| ApiError::not_found("Profile not found."))
}

/// Whether `pin` is the profile's PIN — counted against its attempt limit
/// (see `pin::check_pin`); a locked profile answers with a 429 error.
pub(super) async fn verify_pin_impl(
    pool: &SqlitePool,
    profile_id: &str,
    pin: &str,
) -> Result<bool, ApiError> {
    // No profile, or no PIN set on it: nothing to verify against, so
    // treat it as "not protected" rather than an error (fails closed as
    // `false`).
    check_pin(pool, profile_id, pin).await
}

/// The PIN lock, enforced here rather than only by the UI's PIN prompt: any
/// `invoke()` is reachable from the webview whatever is on screen. Acting
/// on a PIN-protected profile (switching into it, editing or removing it,
/// changing its PIN) needs that PIN, unless it's already the active
/// profile — someone already got past the lock to get there.
pub(crate) async fn authorize_pin_protected_access(
    pool: &SqlitePool,
    profile_id: &str,
    pin: Option<&str>,
) -> Result<(), ApiError> {
    let row: Option<(Option<String>,)> =
        sqlx::query_as("SELECT pin_hash FROM profiles WHERE uuid = $1")
            .bind(profile_id)
            .fetch_optional(pool)
            .await
            .map_err(ApiError::from)?;
    let Some((Some(_),)) = row else {
        return Ok(());
    };
    if current_profile_id(pool).await? == profile_id {
        return Ok(());
    }
    match pin {
        Some(pin) if verify_pin_impl(pool, profile_id, pin).await? => Ok(()),
        _ => Err(ApiError::forbidden("This profile is locked with a PIN.")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn migrated_pool() -> SqlitePool {
        crate::test_support::migrated_pool_with_connections(2).await
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
    async fn removing_the_active_profile_resets_the_active_profile_in_the_same_transaction() {
        let pool = migrated_pool().await;
        let alex = create_impl(&pool, "Alex", None, None).await.unwrap();
        let sam = create_impl(&pool, "Sam", None, None).await.unwrap();
        sqlx::query(
            "INSERT INTO preferences (key, value, updated_at) VALUES ('activeProfileId', $1, 'now')",
        )
        .bind(format!("\"{}\"", alex.id))
        .execute(&pool)
        .await
        .unwrap();

        // Removing someone else leaves the active profile alone.
        remove_impl(&pool, &sam.id).await.unwrap();
        assert_eq!(
            crate::database::current_profile_id(&pool).await.unwrap(),
            alex.id
        );

        remove_impl(&pool, &alex.id).await.unwrap();
        assert_eq!(
            crate::database::current_profile_id(&pool).await.unwrap(),
            "default"
        );
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
    async fn updates_a_profile_name_and_avatar() {
        let pool = migrated_pool().await;
        let created = create_impl(&pool, "Alex", None, None).await.unwrap();
        let updated = update_impl(&pool, &created.id, "Alexandra", Some("cat".to_string()))
            .await
            .unwrap();
        assert_eq!(updated.name, "Alexandra");
        assert_eq!(updated.avatar.as_deref(), Some("cat"));
    }

    #[tokio::test]
    async fn rejects_a_whitespace_only_rename() {
        let pool = migrated_pool().await;
        let created = create_impl(&pool, "Alex", None, None).await.unwrap();
        assert!(update_impl(&pool, &created.id, "   ", None).await.is_err());
    }

    #[tokio::test]
    async fn update_impl_returns_not_found_for_an_unknown_profile() {
        let pool = migrated_pool().await;
        assert!(update_impl(&pool, "ghost", "New Name", None).await.is_err());
    }

    #[tokio::test]
    async fn setting_a_pin_is_reflected_in_has_pin_but_never_leaks_the_hash() {
        let pool = migrated_pool().await;
        let created = create_impl(&pool, "Alex", None, None).await.unwrap();
        assert!(!created.has_pin);

        let updated = set_pin_impl(&pool, &created.id, "1234").await.unwrap();
        assert!(updated.has_pin);
    }

    #[tokio::test]
    async fn rejects_a_malformed_pin() {
        let pool = migrated_pool().await;
        let created = create_impl(&pool, "Alex", None, None).await.unwrap();
        assert!(set_pin_impl(&pool, &created.id, "12").await.is_err());
        assert!(set_pin_impl(&pool, &created.id, "12345678").await.is_err());
        assert!(set_pin_impl(&pool, &created.id, "12a4").await.is_err());
    }

    #[tokio::test]
    async fn verifies_a_correct_pin_and_rejects_a_wrong_one() {
        let pool = migrated_pool().await;
        let created = create_impl(&pool, "Alex", None, None).await.unwrap();
        set_pin_impl(&pool, &created.id, "1234").await.unwrap();

        assert!(verify_pin_impl(&pool, &created.id, "1234").await.unwrap());
        assert!(!verify_pin_impl(&pool, &created.id, "9999").await.unwrap());
    }

    #[tokio::test]
    async fn clearing_a_pin_removes_the_lock() {
        let pool = migrated_pool().await;
        let created = create_impl(&pool, "Alex", None, None).await.unwrap();
        set_pin_impl(&pool, &created.id, "1234").await.unwrap();

        let cleared = clear_pin_impl(&pool, &created.id).await.unwrap();
        assert!(!cleared.has_pin);
        assert!(!verify_pin_impl(&pool, &created.id, "1234").await.unwrap());
    }

    #[tokio::test]
    async fn verifying_a_profile_with_no_pin_set_fails_closed() {
        let pool = migrated_pool().await;
        let created = create_impl(&pool, "Alex", None, None).await.unwrap();
        assert!(!verify_pin_impl(&pool, &created.id, "1234").await.unwrap());
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

    /// Two profiles that follow exactly the same titles (same media ids, same
    /// names) must stay fully separate when one of them is deleted: the
    /// cascade removes every row of the deleted profile — in every scoped
    /// table, including the ones the test above never fills — and none of the
    /// other's.
    #[tokio::test]
    async fn removing_a_profile_leaves_a_profile_with_the_same_titles_untouched() {
        let pool = migrated_pool().await;
        let alex = create_impl(&pool, "Alex", None, None).await.unwrap();
        let sam = create_impl(&pool, "Sam", None, None).await.unwrap();

        for profile in [&alex.id, &sam.id] {
            let statements = [
                "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, created_at, updated_at)
                 VALUES ('library-' || $1, $1, 1, 'movie', 'Same', 'now', 'now')",
                "INSERT INTO seen_movies (uuid, profile_id, movie_id, title, watched_at, created_at, updated_at)
                 VALUES ('seen-' || $1, $1, 1, 'Same', 'now', 'now', 'now')",
                "INSERT INTO episode_progress (uuid, profile_id, series_id, episode_id, season_number, episode_number, created_at, updated_at)
                 VALUES ('episode-' || $1, $1, 1, 1, 1, 1, 'now', 'now')",
                "INSERT INTO tracked_series (uuid, profile_id, series_id, title, created_at, updated_at)
                 VALUES ('tracked-' || $1, $1, 1, 'Same', 'now', 'now')",
                "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, created_at)
                 VALUES ('event-' || $1, $1, 1, 'movie', 'Same', 'watched', 'now', 'now')",
                "INSERT INTO activity_log (uuid, profile_id, media_id, media_type, title, action, timestamp, created_at, updated_at)
                 VALUES ('activity-' || $1, $1, 1, 'movie', 'Same', 'movie:watched', 'now', 'now', 'now')",
                "INSERT INTO availability_alerts (uuid, profile_id, media_id, media_type, title, region, provider_ids, created_at, updated_at)
                 VALUES ('alert-' || $1, $1, 1, 'movie', 'Same', 'FR', '[]', 'now', 'now')",
                "INSERT INTO custom_lists (uuid, profile_id, name, created_at, updated_at)
                 VALUES ('list-' || $1, $1, 'Same list', 'now', 'now')",
                "INSERT INTO custom_list_items (uuid, list_id, media_id, media_type, title, position, added_at, updated_at)
                 VALUES ('item-' || $1, 'list-' || $1, 1, 'movie', 'Same', 0, 'now', 'now')",
                "INSERT INTO smart_lists (uuid, profile_id, name, rules, created_at, updated_at)
                 VALUES ('smart-' || $1, $1, 'Same', '{}', 'now', 'now')",
                "INSERT INTO saved_filters (uuid, profile_id, page, name, filters, created_at, updated_at)
                 VALUES ('filter-' || $1, $1, 'library', 'Same', '{}', 'now', 'now')",
                "INSERT INTO dismissed_recommendations (uuid, profile_id, media_id, media_type, title, dismissed_at, created_at, updated_at)
                 VALUES ('dismissed-' || $1, $1, 1, 'movie', 'Same', 'now', 'now', 'now')",
            ];
            for statement in statements {
                sqlx::query(statement)
                    .bind(profile)
                    .execute(&pool)
                    .await
                    .unwrap_or_else(|error| panic!("{statement}: {error}"));
            }
        }

        remove_impl(&pool, &alex.id).await.unwrap();

        for table in crate::database::PROFILE_SCOPED_TABLES {
            for (profile, expected, whose) in [(&alex.id, 0, "removed"), (&sam.id, 1, "other")] {
                let row: (i64,) = sqlx::query_as(sqlx::AssertSqlSafe(format!(
                    "SELECT COUNT(*) FROM {table} WHERE profile_id = $1"
                )))
                .bind(profile)
                .fetch_one(&pool)
                .await
                .unwrap();
                assert_eq!(row.0, expected, "{table}: the {whose} profile's rows");
            }
        }
        let items: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM custom_list_items WHERE list_id = $1")
                .bind(format!("list-{}", sam.id))
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(items.0, 1, "custom_list_items of the other profile's list");
    }

    #[tokio::test]
    async fn auto_claims_the_unclaimed_default_profile_for_the_first_account() {
        let pool = migrated_pool().await;
        let resolved = resolve_for_supabase_user_impl(&pool, "user_2abc")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(resolved.id, "default");
        assert_eq!(resolved.supabase_user_id.as_deref(), Some("user_2abc"));
    }

    #[tokio::test]
    async fn returns_the_already_linked_profile_on_subsequent_resolutions() {
        let pool = migrated_pool().await;
        resolve_for_supabase_user_impl(&pool, "user_2abc")
            .await
            .unwrap();
        let second = resolve_for_supabase_user_impl(&pool, "user_2abc")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(second.id, "default");
    }

    #[tokio::test]
    async fn returns_none_for_a_second_account_once_default_is_claimed() {
        let pool = migrated_pool().await;
        resolve_for_supabase_user_impl(&pool, "user_2abc")
            .await
            .unwrap();
        assert!(
            resolve_for_supabase_user_impl(&pool, "user_2def")
                .await
                .unwrap()
                .is_none()
        );
    }

    #[tokio::test]
    async fn the_unique_index_rejects_linking_a_second_profile_to_an_already_claimed_account() {
        let pool = migrated_pool().await;
        resolve_for_supabase_user_impl(&pool, "user_2abc")
            .await
            .unwrap();
        let second = create_impl(&pool, "Camille", None, Some("user_2def".to_string()))
            .await
            .unwrap();

        let result = link_to_supabase_user_impl(&pool, &second.id, "user_2abc").await;
        assert!(result.is_err());
    }

    /// Linking used to overwrite whatever account a profile already had, so
    /// anyone who could call the command could take over a profile (and its
    /// library) for a different account.
    #[tokio::test]
    async fn a_profile_linked_to_one_account_cannot_be_relinked_to_another() {
        let pool = migrated_pool().await;
        let linked = create_impl(&pool, "Alex", None, Some("user_a".to_string()))
            .await
            .unwrap();

        let error = link_to_supabase_user_impl(&pool, &linked.id, "user_b")
            .await
            .unwrap_err();
        assert_eq!(error.status, Some(403));
        let still = get_by_id_impl(&pool, &linked.id).await.unwrap().unwrap();
        assert_eq!(still.supabase_user_id.as_deref(), Some("user_a"));

        // Linking the same account again is a no-op, not an error.
        let again = link_to_supabase_user_impl(&pool, &linked.id, "user_a")
            .await
            .unwrap();
        assert_eq!(again.supabase_user_id.as_deref(), Some("user_a"));
    }

    #[tokio::test]
    async fn an_account_already_on_a_profile_gets_a_clean_error_when_linked_to_another() {
        let pool = migrated_pool().await;
        create_impl(&pool, "Alex", None, Some("user_a".to_string()))
            .await
            .unwrap();
        let other = create_impl(&pool, "Sam", None, None).await.unwrap();

        let error = link_to_supabase_user_impl(&pool, &other.id, "user_a")
            .await
            .unwrap_err();
        assert_eq!(error.status, Some(409));
        assert!(!error.message.contains("UNIQUE"), "{}", error.message);
        assert!(
            link_to_supabase_user_impl(&pool, &other.id, "  ")
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn creating_a_profile_for_an_account_that_has_one_is_a_clean_conflict() {
        let pool = migrated_pool().await;
        create_impl(&pool, "Alex", None, Some("user_a".to_string()))
            .await
            .unwrap();
        let error = create_impl(&pool, "Sam", None, Some("user_a".to_string()))
            .await
            .unwrap_err();
        assert_eq!(error.status, Some(409));
        assert!(!error.message.contains("UNIQUE"), "{}", error.message);
    }

    #[tokio::test]
    async fn a_profile_name_is_bounded() {
        let pool = migrated_pool().await;
        let at_limit = "a".repeat(MAX_PROFILE_NAME_LENGTH);
        create_impl(&pool, &at_limit, None, None).await.unwrap();

        let too_long = "a".repeat(MAX_PROFILE_NAME_LENGTH + 1);
        assert_eq!(
            create_impl(&pool, &too_long, None, None)
                .await
                .unwrap_err()
                .status,
            Some(400)
        );
        let created = create_impl(&pool, "Alex", None, None).await.unwrap();
        assert_eq!(
            update_impl(&pool, &created.id, &too_long, None)
                .await
                .unwrap_err()
                .status,
            Some(400)
        );
        // Counted in characters, not bytes.
        create_impl(&pool, &"é".repeat(MAX_PROFILE_NAME_LENGTH), None, None)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn an_avatar_is_trimmed_bounded_and_printable() {
        let pool = migrated_pool().await;
        let created = create_impl(&pool, "Alex", Some("  cat ".to_string()), None)
            .await
            .unwrap();
        assert_eq!(created.avatar.as_deref(), Some("cat"));

        let blank = create_impl(&pool, "Sam", Some("   ".to_string()), None)
            .await
            .unwrap();
        assert_eq!(blank.avatar, None);

        for bad in [
            "a".repeat(MAX_AVATAR_LENGTH + 1),
            "ca\nt".to_string(),
            "cat\u{0}".to_string(),
        ] {
            assert_eq!(
                create_impl(&pool, "Bad", Some(bad.clone()), None)
                    .await
                    .unwrap_err()
                    .status,
                Some(400)
            );
            assert_eq!(
                update_impl(&pool, &created.id, "Alex", Some(bad))
                    .await
                    .unwrap_err()
                    .status,
                Some(400)
            );
        }
        let stored = get_by_id_impl(&pool, &created.id).await.unwrap().unwrap();
        assert_eq!(stored.avatar.as_deref(), Some("cat"));
    }

    #[tokio::test]
    async fn the_number_of_profiles_is_capped() {
        let pool = migrated_pool().await;
        // The default profile counts.
        list_impl(&pool).await.unwrap();
        for index in 1..MAX_PROFILES {
            create_impl(&pool, &format!("Profile {index}"), None, None)
                .await
                .unwrap();
        }
        let error = create_impl(&pool, "One too many", None, None)
            .await
            .unwrap_err();
        assert_eq!(error.status, Some(400));
        assert!(error.message.contains("20"), "{}", error.message);
        assert_eq!(list_impl(&pool).await.unwrap().len() as i64, MAX_PROFILES);

        // Removing one makes room again.
        let first = list_impl(&pool).await.unwrap().remove(1);
        remove_impl(&pool, &first.id).await.unwrap();
        create_impl(&pool, "Back in", None, None).await.unwrap();
    }

    #[tokio::test]
    async fn linking_a_pin_protected_profile_needs_its_pin() {
        let pool = migrated_pool().await;
        let locked = create_impl(&pool, "Alex", None, None).await.unwrap();
        set_pin_impl(&pool, &locked.id, "4242").await.unwrap();
        let service = super::super::service::ProfileService::new(&pool);

        for pin in [None, Some("0000")] {
            let error = service
                .link_to_supabase_user(&locked.id, "user_a", pin)
                .await
                .unwrap_err();
            assert_eq!(error.status, Some(403));
        }
        let still = get_by_id_impl(&pool, &locked.id).await.unwrap().unwrap();
        assert!(still.supabase_user_id.is_none());

        let linked = service
            .link_to_supabase_user(&locked.id, "user_a", Some("4242"))
            .await
            .unwrap();
        assert_eq!(linked.supabase_user_id.as_deref(), Some("user_a"));
    }

    #[tokio::test]
    async fn a_pin_protected_default_profile_is_not_auto_claimed_by_the_first_account() {
        let pool = migrated_pool().await;
        list_impl(&pool).await.unwrap();
        set_pin_impl(&pool, "default", "4242").await.unwrap();

        assert!(
            resolve_for_supabase_user_impl(&pool, "user_a")
                .await
                .unwrap()
                .is_none()
        );
        let default = get_by_id_impl(&pool, "default").await.unwrap().unwrap();
        assert!(default.supabase_user_id.is_none());
    }

    #[tokio::test]
    async fn listing_profiles_to_the_webview_does_not_expose_the_account_id() {
        let pool = migrated_pool().await;
        create_impl(&pool, "Alex", None, Some("user_a".to_string()))
            .await
            .unwrap();
        let listed = super::super::service::ProfileService::new(&pool)
            .list()
            .await
            .unwrap();
        assert!(listed.iter().any(|profile| profile.name == "Alex"));
        assert!(
            listed
                .iter()
                .all(|profile| profile.supabase_user_id.is_none())
        );
        assert!(!serde_json::to_string(&listed).unwrap().contains("user_a"));
        // The lookup by account still sees the link.
        assert!(
            find_by_supabase_user_id_impl(&pool, "user_a")
                .await
                .unwrap()
                .is_some()
        );
    }

    #[tokio::test]
    async fn removing_a_profile_also_drops_its_sync_bookkeeping_and_outbox() {
        let pool = migrated_pool().await;
        let created = create_impl(&pool, "Alex", None, None).await.unwrap();
        let other = create_impl(&pool, "Sam", None, None).await.unwrap();
        for id in [&created.id, &other.id] {
            sqlx::query(
                "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, created_at, updated_at)
                 VALUES ($1, $2, 1, 'movie', 'T', 'now', 'now')",
            )
            .bind(format!("item-{id}"))
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();
            for key in [
                format!("cursor:{id}"),
                format!("bootstrap:{id}"),
                format!("bootstrap:v2:{id}"),
                format!("lastSyncedAt:{id}"),
                format!("orphan:{id}:item-x"),
            ] {
                sqlx::query("INSERT INTO sync_metadata(key,value,updated_at) VALUES($1,'1','now')")
                    .bind(key)
                    .execute(&pool)
                    .await
                    .unwrap();
            }
        }

        remove_impl(&pool, &created.id).await.unwrap();

        let left: Vec<(String,)> = sqlx::query_as("SELECT key FROM sync_metadata ORDER BY key")
            .fetch_all(&pool)
            .await
            .unwrap();
        assert!(
            left.iter().all(|(key,)| key.contains(&other.id)),
            "only the other profile's keys remain: {left:?}"
        );
        assert_eq!(left.len(), 5);
        let outbox: Vec<(String,)> = sqlx::query_as("SELECT DISTINCT profile_id FROM sync_outbox")
            .fetch_all(&pool)
            .await
            .unwrap();
        assert_eq!(outbox, vec![(other.id.clone(),)]);
    }

    #[tokio::test]
    async fn pin_locked_profiles_need_their_pin_unless_already_active() {
        let pool = migrated_pool().await;
        let locked = create_impl(&pool, "Alex", None, None).await.unwrap();
        let open = create_impl(&pool, "Sam", None, None).await.unwrap();
        set_pin_impl(&pool, &locked.id, "4242").await.unwrap();

        authorize_pin_protected_access(&pool, &open.id, None)
            .await
            .unwrap();
        for pin in [None, Some("0000")] {
            let error = authorize_pin_protected_access(&pool, &locked.id, pin)
                .await
                .unwrap_err();
            assert_eq!(error.status, Some(403));
        }
        authorize_pin_protected_access(&pool, &locked.id, Some("4242"))
            .await
            .unwrap();

        sqlx::query(
            "INSERT INTO preferences (key, value, updated_at) VALUES ('activeProfileId', $1, 'now')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .bind(serde_json::to_string(&locked.id).unwrap())
        .execute(&pool)
        .await
        .unwrap();
        authorize_pin_protected_access(&pool, &locked.id, None)
            .await
            .unwrap();
    }
}
