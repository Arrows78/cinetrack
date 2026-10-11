use sqlx::SqlitePool;
use tauri::State;

use super::models::UserProfile;
use super::service::ProfileService;
use crate::diagnostics::timed;
use crate::error::ApiError;
use crate::preferences::PreferencesCache;

#[tauri::command]
pub async fn list_profiles(pool: State<'_, SqlitePool>) -> Result<Vec<UserProfile>, ApiError> {
    timed("list_profiles", async {
        ProfileService::new(pool.inner()).list().await
    })
    .await
}

#[tauri::command]
pub async fn create_profile(
    name: String,
    avatar: Option<String>,
    supabase_user_id: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<UserProfile, ApiError> {
    timed("create_profile", async {
        ProfileService::new(pool.inner())
            .create(&name, avatar, supabase_user_id)
            .await
    })
    .await
}

#[tauri::command]
pub async fn find_profile_by_supabase_user_id(
    supabase_user_id: String,
    pool: State<'_, SqlitePool>,
) -> Result<Option<UserProfile>, ApiError> {
    timed("find_profile_by_supabase_user_id", async {
        ProfileService::new(pool.inner())
            .find_by_supabase_user_id(&supabase_user_id)
            .await
    })
    .await
}

#[tauri::command]
pub async fn link_profile_to_supabase_user(
    profile_id: String,
    supabase_user_id: String,
    pool: State<'_, SqlitePool>,
) -> Result<UserProfile, ApiError> {
    timed("link_profile_to_supabase_user", async {
        ProfileService::new(pool.inner())
            .link_to_supabase_user(&profile_id, &supabase_user_id)
            .await
    })
    .await
}

#[tauri::command]
pub async fn resolve_profile_for_supabase_user(
    supabase_user_id: String,
    pool: State<'_, SqlitePool>,
) -> Result<Option<UserProfile>, ApiError> {
    timed("resolve_profile_for_supabase_user", async {
        ProfileService::new(pool.inner())
            .resolve_for_supabase_user(&supabase_user_id)
            .await
    })
    .await
}

#[tauri::command]
pub async fn update_profile(
    profile_id: String,
    name: String,
    avatar: Option<String>,
    current_pin: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<UserProfile, ApiError> {
    timed("update_profile", async {
        ProfileService::new(pool.inner())
            .update(&profile_id, &name, avatar, current_pin.as_deref())
            .await
    })
    .await
}

#[tauri::command]
pub async fn remove_profile(
    profile_id: String,
    current_pin: Option<String>,
    pool: State<'_, SqlitePool>,
    cache: State<'_, PreferencesCache>,
) -> Result<(), ApiError> {
    timed("remove_profile", async {
        ProfileService::new(pool.inner())
            .remove(&profile_id, current_pin.as_deref())
            .await?;
        // The removal may have reset `activeProfileId` straight in the table
        // (see `remove_impl`), behind the cache's back.
        crate::preferences::refresh(cache.inner());
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn set_profile_pin(
    profile_id: String,
    pin: String,
    current_pin: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<UserProfile, ApiError> {
    timed("set_profile_pin", async {
        ProfileService::new(pool.inner())
            .set_pin(&profile_id, &pin, current_pin.as_deref())
            .await
    })
    .await
}

#[tauri::command]
pub async fn clear_profile_pin(
    profile_id: String,
    current_pin: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<UserProfile, ApiError> {
    timed("clear_profile_pin", async {
        ProfileService::new(pool.inner())
            .clear_pin(&profile_id, current_pin.as_deref())
            .await
    })
    .await
}

#[tauri::command]
pub async fn verify_profile_pin(
    profile_id: String,
    pin: String,
    pool: State<'_, SqlitePool>,
) -> Result<bool, ApiError> {
    timed("verify_profile_pin", async {
        ProfileService::new(pool.inner())
            .verify_pin(&profile_id, &pin)
            .await
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::preferences::PreferencesCache;
    use sqlx::sqlite::SqlitePoolOptions;
    use tauri::Manager;

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
    async fn list_profiles_command_returns_the_default_profile() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();
        let profiles = list_profiles(state).await.unwrap();
        assert!(profiles.iter().any(|p| p.id == "default"));
    }

    #[tokio::test]
    async fn create_profile_command_creates_a_new_profile() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();
        let created = create_profile("Alex".to_string(), None, None, state)
            .await
            .unwrap();
        assert_eq!(created.name, "Alex");
    }

    #[tokio::test]
    async fn find_profile_by_supabase_user_id_command_returns_none_when_unclaimed() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();
        let found = find_profile_by_supabase_user_id("user_2abc".to_string(), state)
            .await
            .unwrap();
        assert!(found.is_none());
    }

    #[tokio::test]
    async fn link_profile_to_supabase_user_command_links_the_profile() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();
        let linked =
            link_profile_to_supabase_user("default".to_string(), "user_2abc".to_string(), state)
                .await
                .unwrap();
        assert_eq!(linked.supabase_user_id.as_deref(), Some("user_2abc"));
    }

    #[tokio::test]
    async fn resolve_profile_for_supabase_user_command_claims_the_default_profile() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();
        let resolved = resolve_profile_for_supabase_user("user_2abc".to_string(), state)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(resolved.id, "default");
    }

    #[tokio::test]
    async fn update_profile_command_renames_and_sets_avatar() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();
        let created = create_profile("Alex".to_string(), None, None, state.clone())
            .await
            .unwrap();
        let updated = update_profile(
            created.id,
            "Alexandra".to_string(),
            Some("cat".to_string()),
            None,
            state,
        )
        .await
        .unwrap();
        assert_eq!(updated.name, "Alexandra");
        assert_eq!(updated.avatar.as_deref(), Some("cat"));
    }

    #[tokio::test]
    async fn remove_profile_command_refuses_to_remove_the_default_profile() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        app.manage(PreferencesCache::default());
        let state: State<'_, SqlitePool> = app.state();
        let cache: State<'_, PreferencesCache> = app.state();
        assert!(
            remove_profile("default".to_string(), None, state, cache)
                .await
                .is_err()
        );
    }

    /// Removing the active profile resets `activeProfileId` straight in the
    /// table. The in-memory preferences cache must not keep serving the
    /// deleted profile as the active one: every read until the frontend
    /// happened to call `set_active_profile` again would see a profile that
    /// no longer exists.
    #[tokio::test]
    async fn removing_the_active_profile_does_not_leave_it_in_the_preferences_cache() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        app.manage(PreferencesCache::default());
        let pool_state: State<'_, SqlitePool> = app.state();
        let cache: State<'_, PreferencesCache> = app.state();

        let alex = create_profile("Alex".to_string(), None, None, pool_state.clone())
            .await
            .unwrap();
        crate::preferences::set_active_profile(
            alex.id.clone(),
            None,
            None,
            pool_state.clone(),
            cache.clone(),
        )
        .await
        .unwrap();
        // Primed with Alex as the active profile.
        let before = crate::preferences::get_preferences(pool_state.clone(), cache.clone())
            .await
            .unwrap();
        assert_eq!(before.active_profile_id, alex.id);

        remove_profile(alex.id.clone(), None, pool_state.clone(), cache.clone())
            .await
            .unwrap();

        let after = crate::preferences::get_preferences(pool_state, cache)
            .await
            .unwrap();
        assert_eq!(after.active_profile_id, "default");
    }

    #[tokio::test]
    async fn pin_commands_set_verify_and_clear_a_profile_lock() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();
        let created = create_profile("Alex".to_string(), None, None, state.clone())
            .await
            .unwrap();

        let with_pin = set_profile_pin(created.id.clone(), "4242".to_string(), None, state.clone())
            .await
            .unwrap();
        assert!(with_pin.has_pin);

        assert!(
            verify_profile_pin(created.id.clone(), "4242".to_string(), state.clone())
                .await
                .unwrap()
        );
        assert!(
            !verify_profile_pin(created.id.clone(), "0000".to_string(), state.clone())
                .await
                .unwrap()
        );

        let cleared =
            clear_profile_pin(created.id.clone(), Some("4242".to_string()), state.clone())
                .await
                .unwrap();
        assert!(!cleared.has_pin);
    }

    #[tokio::test]
    async fn set_profile_pin_command_rejects_a_malformed_pin() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();
        let created = create_profile("Alex".to_string(), None, None, state.clone())
            .await
            .unwrap();
        assert!(
            set_profile_pin(created.id, "12".to_string(), None, state)
                .await
                .is_err()
        );
    }
}
