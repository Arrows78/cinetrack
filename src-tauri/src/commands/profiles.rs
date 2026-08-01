use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

use crate::database::{new_uuid, now_iso};
use crate::error::ApiError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub id: String,
    pub name: String,
    pub avatar: Option<String>,
    pub created_at: String,
    pub supabase_user_id: Option<String>,
}

#[derive(sqlx::FromRow)]
struct ProfileRow {
    uuid: String,
    name: String,
    avatar: Option<String>,
    created_at: String,
    supabase_user_id: Option<String>,
}

impl From<ProfileRow> for UserProfile {
    fn from(row: ProfileRow) -> Self {
        Self {
            id: row.uuid,
            name: row.name,
            avatar: row.avatar,
            created_at: row.created_at,
            supabase_user_id: row.supabase_user_id,
        }
    }
}

async fn list_impl(pool: &SqlitePool) -> Result<Vec<UserProfile>, ApiError> {
    let now = now_iso(pool).await?;
    sqlx::query(
        "INSERT OR IGNORE INTO profiles (uuid, name, avatar, created_at, updated_at) VALUES ('default', 'Principal', NULL, $1, $1)",
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

async fn create_impl(
    pool: &SqlitePool,
    name: &str,
    avatar: Option<String>,
    supabase_user_id: Option<String>,
) -> Result<UserProfile, ApiError> {
    let trimmed = name.trim();
    let profile = UserProfile {
        id: new_uuid(),
        name: if trimmed.is_empty() { "Profil".to_string() } else { trimmed.to_string() },
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

async fn find_by_supabase_user_id_impl(pool: &SqlitePool, supabase_user_id: &str) -> Result<Option<UserProfile>, ApiError> {
    let row: Option<ProfileRow> = sqlx::query_as("SELECT * FROM profiles WHERE supabase_user_id = $1 LIMIT 1")
        .bind(supabase_user_id)
        .fetch_optional(pool)
        .await
        .map_err(ApiError::from)?;
    Ok(row.map(Into::into))
}

async fn link_to_supabase_user_impl(
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

    let row: Option<ProfileRow> = sqlx::query_as("SELECT * FROM profiles WHERE uuid = $1")
        .bind(profile_id)
        .fetch_optional(pool)
        .await
        .map_err(ApiError::from)?;
    row.map(Into::into).ok_or_else(|| ApiError::not_found("Profil introuvable."))
}

/// Resolves which local profile a signed-in Supabase account should land on:
/// the profile it's already linked to, or — only the very first time, for
/// whichever account signs in first — the 'default' profile that predates
/// Supabase auth entirely, auto-claimed so pre-existing local data isn't
/// orphaned by this feature. Returns None when neither applies, meaning the
/// caller must offer to create a brand new profile.
async fn resolve_for_supabase_user_impl(pool: &SqlitePool, supabase_user_id: &str) -> Result<Option<UserProfile>, ApiError> {
    if let Some(existing) = find_by_supabase_user_id_impl(pool, supabase_user_id).await? {
        return Ok(Some(existing));
    }

    let profiles = list_impl(pool).await?;
    let default_profile = profiles.into_iter().find(|profile| profile.id == "default");
    if let Some(default_profile) = default_profile
        && default_profile.supabase_user_id.is_none()
    {
        return Ok(Some(link_to_supabase_user_impl(pool, "default", supabase_user_id).await?));
    }

    Ok(None)
}

async fn remove_impl(pool: &SqlitePool, profile_id: &str) -> Result<(), ApiError> {
    if profile_id == "default" {
        return Err(ApiError::bad_request("Le profil principal ne peut pas être supprimé."));
    }

    let mut tx = pool.begin().await.map_err(ApiError::from)?;

    let list_rows: Vec<(String,)> = sqlx::query_as("SELECT uuid FROM custom_lists WHERE profile_id = $1")
        .bind(profile_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(ApiError::from)?;
    for (list_uuid,) in &list_rows {
        sqlx::query("DELETE FROM custom_list_items WHERE list_id = $1")
            .bind(list_uuid)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from)?;
    }

    for table in [
        "custom_lists",
        "watchlist_items",
        "seen_movies",
        "episode_progress",
        "tracked_series",
        "library_items",
        "viewing_events",
        "availability_alerts",
        "activity_log",
    ] {
        sqlx::query(&format!("DELETE FROM {table} WHERE profile_id = $1"))
            .bind(profile_id)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from)?;
    }
    sqlx::query("DELETE FROM profiles WHERE uuid = $1")
        .bind(profile_id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;

    tx.commit().await.map_err(ApiError::from)?;
    Ok(())
}

#[tauri::command]
pub async fn list_profiles(pool: State<'_, SqlitePool>) -> Result<Vec<UserProfile>, ApiError> {
    list_impl(&pool).await
}

#[tauri::command]
pub async fn create_profile(
    name: String,
    avatar: Option<String>,
    supabase_user_id: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<UserProfile, ApiError> {
    create_impl(&pool, &name, avatar, supabase_user_id).await
}

#[tauri::command]
pub async fn find_profile_by_supabase_user_id(
    supabase_user_id: String,
    pool: State<'_, SqlitePool>,
) -> Result<Option<UserProfile>, ApiError> {
    find_by_supabase_user_id_impl(&pool, &supabase_user_id).await
}

#[tauri::command]
pub async fn link_profile_to_supabase_user(
    profile_id: String,
    supabase_user_id: String,
    pool: State<'_, SqlitePool>,
) -> Result<UserProfile, ApiError> {
    link_to_supabase_user_impl(&pool, &profile_id, &supabase_user_id).await
}

#[tauri::command]
pub async fn resolve_profile_for_supabase_user(
    supabase_user_id: String,
    pool: State<'_, SqlitePool>,
) -> Result<Option<UserProfile>, ApiError> {
    resolve_for_supabase_user_impl(&pool, &supabase_user_id).await
}

#[tauri::command]
pub async fn remove_profile(profile_id: String, pool: State<'_, SqlitePool>) -> Result<(), ApiError> {
    remove_impl(&pool, &profile_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(2).connect("sqlite::memory:").await.unwrap();
        crate::database::migrations::run_migrations(&pool).await.unwrap();
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
        assert!(profiles.iter().any(|p| p.id == created.id && p.name == "Alex"));
    }

    #[tokio::test]
    async fn refuses_to_remove_the_default_profile() {
        let pool = migrated_pool().await;
        assert!(remove_impl(&pool, "default").await.is_err());
    }

    #[tokio::test]
    async fn removing_a_profile_clears_its_scoped_data() {
        let pool = migrated_pool().await;
        let created = create_impl(&pool, "Alex", None, None).await.unwrap();
        sqlx::query(
            "INSERT INTO watchlist_items (uuid, profile_id, media_id, media_type, title, created_at, updated_at)
             VALUES ('w1', $1, 1, 'movie', 'Test', 'now', 'now')",
        )
        .bind(&created.id)
        .execute(&pool)
        .await
        .unwrap();

        remove_impl(&pool, &created.id).await.unwrap();

        let profiles = list_impl(&pool).await.unwrap();
        assert!(!profiles.iter().any(|p| p.id == created.id));
        let remaining: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM watchlist_items WHERE profile_id = $1")
            .bind(&created.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(remaining.0, 0);
    }

    #[tokio::test]
    async fn auto_claims_the_unclaimed_default_profile_for_the_first_account() {
        let pool = migrated_pool().await;
        let resolved = resolve_for_supabase_user_impl(&pool, "user-1").await.unwrap().unwrap();
        assert_eq!(resolved.id, "default");
        assert_eq!(resolved.supabase_user_id.as_deref(), Some("user-1"));
    }

    #[tokio::test]
    async fn returns_the_already_linked_profile_on_subsequent_resolutions() {
        let pool = migrated_pool().await;
        resolve_for_supabase_user_impl(&pool, "user-1").await.unwrap();
        let second = resolve_for_supabase_user_impl(&pool, "user-1").await.unwrap().unwrap();
        assert_eq!(second.id, "default");
    }

    #[tokio::test]
    async fn returns_none_for_a_second_account_once_default_is_claimed() {
        let pool = migrated_pool().await;
        resolve_for_supabase_user_impl(&pool, "user-1").await.unwrap();
        assert!(resolve_for_supabase_user_impl(&pool, "user-2").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn the_unique_index_rejects_linking_a_second_profile_to_an_already_claimed_account() {
        let pool = migrated_pool().await;
        resolve_for_supabase_user_impl(&pool, "user-1").await.unwrap();
        let second = create_impl(&pool, "Camille", None, Some("user-2".to_string())).await.unwrap();

        let result = link_to_supabase_user_impl(&pool, &second.id, "user-1").await;
        assert!(result.is_err());
    }
}
