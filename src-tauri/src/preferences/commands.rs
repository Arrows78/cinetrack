use serde_json::Value;
use sqlx::SqlitePool;
use tauri::State;

use super::models::UserPreferences;
use super::repository::PreferencesCache;
use super::service::{PreferencesService, refresh};
use crate::diagnostics::timed;
use crate::error::ApiError;

#[tauri::command]
pub async fn get_preferences(
    pool: State<'_, SqlitePool>,
    cache: State<'_, PreferencesCache>,
) -> Result<UserPreferences, ApiError> {
    timed("get_preferences", async {
        PreferencesService::new(pool.inner(), cache.inner())
            .get()
            .await
    })
    .await
}

#[tauri::command]
pub async fn update_preference(
    key: String,
    value: Value,
    pool: State<'_, SqlitePool>,
    cache: State<'_, PreferencesCache>,
) -> Result<UserPreferences, ApiError> {
    timed("update_preference", async {
        PreferencesService::new(pool.inner(), cache.inner())
            .update(key, value)
            .await
    })
    .await
}

#[tauri::command]
pub async fn set_active_profile(
    profile_id: String,
    supabase_user_id: Option<String>,
    pool: State<'_, SqlitePool>,
    cache: State<'_, PreferencesCache>,
) -> Result<UserPreferences, ApiError> {
    timed("set_active_profile", async {
        PreferencesService::new(pool.inner(), cache.inner())
            .set_active_profile(&profile_id, supabase_user_id.as_deref())
            .await
    })
    .await
}

#[tauri::command]
pub fn refresh_preferences(cache: State<'_, PreferencesCache>) {
    refresh(cache.inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::preferences::models::LibraryViewMode;
    use crate::preferences::repository::get_preferences_cached;
    use sqlx::sqlite::SqlitePoolOptions;
    use tauri::Manager;

    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database::migrations::run_migrations(&pool)
            .await
            .unwrap();
        pool
    }

    #[tokio::test]
    async fn get_preferences_command_returns_the_defaults() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        app.manage(PreferencesCache::default());
        let pool_state: State<'_, SqlitePool> = app.state();
        let cache_state: State<'_, PreferencesCache> = app.state();

        let prefs = get_preferences(pool_state, cache_state).await.unwrap();
        assert_eq!(prefs.active_profile_id, "default");
    }

    #[tokio::test]
    async fn update_preference_command_rejects_active_profile_id() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        app.manage(PreferencesCache::default());
        let pool_state: State<'_, SqlitePool> = app.state();
        let cache_state: State<'_, PreferencesCache> = app.state();

        let result = update_preference(
            "activeProfileId".to_string(),
            Value::String("alex".to_string()),
            pool_state,
            cache_state,
        )
        .await;

        let err = result.unwrap_err();
        assert!(
            err.to_string()
                .contains("activeProfileId must be set via set_active_profile")
        );
    }

    #[tokio::test]
    async fn update_preference_command_writes_a_normal_key() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        app.manage(PreferencesCache::default());
        let pool_state: State<'_, SqlitePool> = app.state();
        let cache_state: State<'_, PreferencesCache> = app.state();

        let updated = update_preference(
            "libraryViewMode".to_string(),
            Value::String("list".to_string()),
            pool_state,
            cache_state,
        )
        .await
        .unwrap();

        assert!(matches!(updated.library_view_mode, LibraryViewMode::List));
    }

    #[tokio::test]
    async fn set_active_profile_command_switches_the_active_profile() {
        let pool = migrated_pool().await;
        sqlx::query("INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('alex', 'Alex', 'now', 'now')")
            .execute(&pool)
            .await
            .unwrap();
        let app = tauri::test::mock_app();
        app.manage(pool);
        app.manage(PreferencesCache::default());
        let pool_state: State<'_, SqlitePool> = app.state();
        let cache_state: State<'_, PreferencesCache> = app.state();

        let updated = set_active_profile("alex".to_string(), None, pool_state, cache_state)
            .await
            .unwrap();
        assert_eq!(updated.active_profile_id, "alex");
    }

    #[tokio::test]
    async fn set_active_profile_switches_freely_to_an_unclaimed_profile() {
        let pool = migrated_pool().await;
        sqlx::query("INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('alex', 'Alex', 'now', 'now')")
            .execute(&pool)
            .await
            .unwrap();
        let app = tauri::test::mock_app();
        app.manage(pool);
        app.manage(PreferencesCache::default());
        let pool_state: State<'_, SqlitePool> = app.state();
        let cache_state: State<'_, PreferencesCache> = app.state();

        let updated = set_active_profile("alex".to_string(), None, pool_state, cache_state)
            .await
            .unwrap();
        assert_eq!(updated.active_profile_id, "alex");
    }

    #[tokio::test]
    async fn set_active_profile_rejects_a_nonexistent_profile() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        app.manage(PreferencesCache::default());
        let pool_state: State<'_, SqlitePool> = app.state();
        let cache_state: State<'_, PreferencesCache> = app.state();

        assert!(
            set_active_profile("ghost".to_string(), None, pool_state, cache_state)
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn set_active_profile_rejects_a_claimed_profile_without_the_matching_supabase_user() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at, supabase_user_id)
             VALUES ('alex', 'Alex', 'now', 'now', 'user-1')",
        )
        .execute(&pool)
        .await
        .unwrap();
        let app = tauri::test::mock_app();
        app.manage(pool);
        app.manage(PreferencesCache::default());

        let pool_state: State<'_, SqlitePool> = app.state();
        let cache_state: State<'_, PreferencesCache> = app.state();
        assert!(
            set_active_profile("alex".to_string(), None, pool_state, cache_state)
                .await
                .is_err()
        );

        let pool_state: State<'_, SqlitePool> = app.state();
        let cache_state: State<'_, PreferencesCache> = app.state();
        assert!(
            set_active_profile(
                "alex".to_string(),
                Some("someone-else".to_string()),
                pool_state,
                cache_state
            )
            .await
            .is_err()
        );
    }

    #[tokio::test]
    async fn set_active_profile_allows_a_claimed_profile_with_the_matching_supabase_user() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at, supabase_user_id)
             VALUES ('alex', 'Alex', 'now', 'now', 'user-1')",
        )
        .execute(&pool)
        .await
        .unwrap();
        let app = tauri::test::mock_app();
        app.manage(pool);
        app.manage(PreferencesCache::default());
        let pool_state: State<'_, SqlitePool> = app.state();
        let cache_state: State<'_, PreferencesCache> = app.state();

        let updated = set_active_profile(
            "alex".to_string(),
            Some("user-1".to_string()),
            pool_state,
            cache_state,
        )
        .await
        .unwrap();
        assert_eq!(updated.active_profile_id, "alex");
    }

    #[tokio::test]
    async fn set_active_profile_always_allows_switching_to_default_even_if_claimed() {
        let pool = migrated_pool().await;
        sqlx::query("UPDATE profiles SET supabase_user_id = 'user-1' WHERE uuid = 'default'")
            .execute(&pool)
            .await
            .unwrap();
        let app = tauri::test::mock_app();
        app.manage(pool);
        app.manage(PreferencesCache::default());
        let pool_state: State<'_, SqlitePool> = app.state();
        let cache_state: State<'_, PreferencesCache> = app.state();

        let updated = set_active_profile("default".to_string(), None, pool_state, cache_state)
            .await
            .unwrap();
        assert_eq!(updated.active_profile_id, "default");
    }

    #[tokio::test]
    async fn refresh_preferences_command_clears_the_cache() {
        let pool = migrated_pool().await;
        let cache = PreferencesCache::default();
        get_preferences_cached(&pool, &cache).await.unwrap();
        assert!(cache.0.lock().unwrap().is_some());

        let app = tauri::test::mock_app();
        app.manage(cache);
        let cache_state: State<'_, PreferencesCache> = app.state();

        refresh_preferences(cache_state);
        assert!(app.state::<PreferencesCache>().0.lock().unwrap().is_none());
    }
}
