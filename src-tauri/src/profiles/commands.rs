use sqlx::SqlitePool;
use tauri::State;

use super::models::UserProfile;
use super::service::ProfileService;
use crate::error::ApiError;

#[tauri::command]
pub async fn list_profiles(pool: State<'_, SqlitePool>) -> Result<Vec<UserProfile>, ApiError> {
    ProfileService::new(pool.inner()).list().await
}

#[tauri::command]
pub async fn create_profile(
    name: String,
    avatar: Option<String>,
    supabase_user_id: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<UserProfile, ApiError> {
    ProfileService::new(pool.inner())
        .create(&name, avatar, supabase_user_id)
        .await
}

#[tauri::command]
pub async fn find_profile_by_supabase_user_id(
    supabase_user_id: String,
    pool: State<'_, SqlitePool>,
) -> Result<Option<UserProfile>, ApiError> {
    ProfileService::new(pool.inner())
        .find_by_supabase_user_id(&supabase_user_id)
        .await
}

#[tauri::command]
pub async fn link_profile_to_supabase_user(
    profile_id: String,
    supabase_user_id: String,
    pool: State<'_, SqlitePool>,
) -> Result<UserProfile, ApiError> {
    ProfileService::new(pool.inner())
        .link_to_supabase_user(&profile_id, &supabase_user_id)
        .await
}

#[tauri::command]
pub async fn resolve_profile_for_supabase_user(
    supabase_user_id: String,
    pool: State<'_, SqlitePool>,
) -> Result<Option<UserProfile>, ApiError> {
    ProfileService::new(pool.inner())
        .resolve_for_supabase_user(&supabase_user_id)
        .await
}

#[tauri::command]
pub async fn remove_profile(
    profile_id: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    ProfileService::new(pool.inner()).remove(&profile_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
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
        let found = find_profile_by_supabase_user_id("user-1".to_string(), state)
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
            link_profile_to_supabase_user("default".to_string(), "user-1".to_string(), state)
                .await
                .unwrap();
        assert_eq!(linked.supabase_user_id.as_deref(), Some("user-1"));
    }

    #[tokio::test]
    async fn resolve_profile_for_supabase_user_command_claims_the_default_profile() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();
        let resolved = resolve_profile_for_supabase_user("user-1".to_string(), state)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(resolved.id, "default");
    }

    #[tokio::test]
    async fn remove_profile_command_refuses_to_remove_the_default_profile() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();
        assert!(remove_profile("default".to_string(), state).await.is_err());
    }
}
