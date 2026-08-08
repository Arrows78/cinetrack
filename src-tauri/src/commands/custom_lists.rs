use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

use crate::commands::macros::profile_scoped_command;
use crate::database::{current_profile_id, new_uuid, now_iso};
use crate::error::ApiError;
use crate::models::MediaType;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomList {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(sqlx::FromRow)]
struct CustomListRow {
    uuid: String,
    profile_id: String,
    name: String,
    description: Option<String>,
    created_at: String,
    updated_at: String,
}

impl From<CustomListRow> for CustomList {
    fn from(row: CustomListRow) -> Self {
        Self {
            id: row.uuid,
            profile_id: row.profile_id,
            name: row.name,
            description: row.description,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

/// Only the fields `add_custom_list_item` reads off the frontend's
/// `MediaSummary` object.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSummaryInput {
    pub id: i64,
    pub media_type: MediaType,
    pub title: String,
    pub poster_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomListItem {
    pub id: String,
    pub list_id: String,
    pub media_id: i64,
    pub media_type: MediaType,
    pub title: String,
    pub poster_path: Option<String>,
    pub position: i64,
    pub added_at: String,
    pub updated_at: String,
}

#[derive(sqlx::FromRow)]
struct CustomListItemRow {
    uuid: String,
    list_id: String,
    media_id: i64,
    media_type: String,
    title: String,
    poster_path: Option<String>,
    position: i64,
    added_at: String,
    updated_at: String,
}

impl From<CustomListItemRow> for CustomListItem {
    fn from(row: CustomListItemRow) -> Self {
        Self {
            id: row.uuid,
            list_id: row.list_id,
            media_id: row.media_id,
            media_type: MediaType::from_db_str(&row.media_type),
            title: row.title,
            poster_path: row.poster_path,
            position: row.position,
            added_at: row.added_at,
            updated_at: row.updated_at,
        }
    }
}

async fn list_impl(pool: &SqlitePool, profile_id: &str) -> Result<Vec<CustomList>, ApiError> {
    let rows: Vec<CustomListRow> =
        sqlx::query_as("SELECT * FROM custom_lists WHERE profile_id = $1 ORDER BY updated_at DESC")
            .bind(profile_id)
            .fetch_all(pool)
            .await
            .map_err(ApiError::from)?;
    Ok(rows.into_iter().map(Into::into).collect())
}

async fn create_impl(pool: &SqlitePool, profile_id: &str, name: &str, description: Option<String>) -> Result<CustomList, ApiError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(ApiError::bad_request("Le nom de la liste est requis."));
    }

    let now = now_iso(pool).await?;
    let list = CustomList {
        id: new_uuid(),
        profile_id: profile_id.to_string(),
        name: trimmed.to_string(),
        description,
        created_at: now.clone(),
        updated_at: now,
    };

    sqlx::query("INSERT INTO custom_lists (uuid, profile_id, name, description, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)")
        .bind(&list.id)
        .bind(&list.profile_id)
        .bind(&list.name)
        .bind(&list.description)
        .bind(&list.created_at)
        .bind(&list.updated_at)
        .execute(pool)
        .await
        .map_err(ApiError::from)?;

    Ok(list)
}

async fn remove_impl(pool: &SqlitePool, list_id: &str) -> Result<(), ApiError> {
    let mut tx = pool.begin().await.map_err(ApiError::from)?;

    sqlx::query("DELETE FROM custom_list_items WHERE list_id = $1")
        .bind(list_id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;
    sqlx::query("DELETE FROM custom_lists WHERE uuid = $1")
        .bind(list_id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;

    tx.commit().await.map_err(ApiError::from)?;
    Ok(())
}

async fn items_impl(pool: &SqlitePool, list_id: &str) -> Result<Vec<CustomListItem>, ApiError> {
    let rows: Vec<CustomListItemRow> = sqlx::query_as("SELECT * FROM custom_list_items WHERE list_id = $1 ORDER BY position")
        .bind(list_id)
        .fetch_all(pool)
        .await
        .map_err(ApiError::from)?;
    Ok(rows.into_iter().map(Into::into).collect())
}

async fn add_impl(pool: &SqlitePool, list_id: &str, media: MediaSummaryInput) -> Result<(), ApiError> {
    let items = items_impl(pool, list_id).await?;
    let now = now_iso(pool).await?;
    let item = CustomListItem {
        id: new_uuid(),
        list_id: list_id.to_string(),
        media_id: media.id,
        media_type: media.media_type,
        title: media.title,
        poster_path: media.poster_path,
        position: items.len() as i64,
        added_at: now.clone(),
        updated_at: now.clone(),
    };

    sqlx::query(
        "INSERT INTO custom_list_items (uuid, list_id, media_id, media_type, title, poster_path, position, added_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
         ON CONFLICT (list_id, media_id, media_type) DO UPDATE SET
           title = excluded.title,
           poster_path = excluded.poster_path,
           position = excluded.position,
           updated_at = excluded.updated_at",
    )
    .bind(&item.id)
    .bind(&item.list_id)
    .bind(item.media_id)
    .bind(item.media_type.as_db_str())
    .bind(&item.title)
    .bind(&item.poster_path)
    .bind(item.position)
    .bind(&item.added_at)
    .execute(pool)
    .await
    .map_err(ApiError::from)?;

    sqlx::query("UPDATE custom_lists SET updated_at = $1 WHERE uuid = $2")
        .bind(&now)
        .bind(list_id)
        .execute(pool)
        .await
        .map_err(ApiError::from)?;

    Ok(())
}

async fn remove_item_impl(pool: &SqlitePool, list_id: &str, media_id: i64, media_type: MediaType) -> Result<(), ApiError> {
    sqlx::query("DELETE FROM custom_list_items WHERE list_id = $1 AND media_id = $2 AND media_type = $3")
        .bind(list_id)
        .bind(media_id)
        .bind(media_type.as_db_str())
        .execute(pool)
        .await
        .map_err(ApiError::from)?;
    Ok(())
}

profile_scoped_command! {
    pub async fn list_custom_lists() -> Vec<CustomList> => list_impl
}

#[tauri::command]
pub async fn create_custom_list(
    name: String,
    description: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<CustomList, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    create_impl(&pool, &profile_id, &name, description).await
}

#[tauri::command]
pub async fn remove_custom_list(list_id: String, pool: State<'_, SqlitePool>) -> Result<(), ApiError> {
    remove_impl(&pool, &list_id).await
}

#[tauri::command]
pub async fn list_custom_list_items(list_id: String, pool: State<'_, SqlitePool>) -> Result<Vec<CustomListItem>, ApiError> {
    items_impl(&pool, &list_id).await
}

#[tauri::command]
pub async fn add_custom_list_item(
    list_id: String,
    media: MediaSummaryInput,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    add_impl(&pool, &list_id, media).await
}

#[tauri::command]
pub async fn remove_custom_list_item(
    list_id: String,
    media_id: i64,
    media_type: MediaType,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    remove_item_impl(&pool, &list_id, media_id, media_type).await
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

    fn media(id: i64, title: &str) -> MediaSummaryInput {
        MediaSummaryInput { id, media_type: MediaType::Movie, title: title.to_string(), poster_path: None }
    }

    #[tokio::test]
    async fn creates_a_list_with_a_trimmed_name() {
        let pool = migrated_pool().await;
        let list = create_impl(&pool, "default", "  Soirées ciné  ", Some("Les classiques".to_string())).await.unwrap();
        assert_eq!(list.name, "Soirées ciné");
        assert_eq!(list.description.as_deref(), Some("Les classiques"));
        assert_eq!(list_impl(&pool, "default").await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn rejects_a_whitespace_only_name() {
        let pool = migrated_pool().await;
        assert!(create_impl(&pool, "default", "   ", None).await.is_err());
        assert_eq!(list_impl(&pool, "default").await.unwrap().len(), 0);
    }

    #[tokio::test]
    async fn adds_items_with_increasing_positions_and_deduplicates_readds() {
        let pool = migrated_pool().await;
        let list = create_impl(&pool, "default", "Ma liste", None).await.unwrap();

        add_impl(&pool, &list.id, media(1, "Premier")).await.unwrap();
        add_impl(&pool, &list.id, media(2, "Deuxième")).await.unwrap();
        add_impl(&pool, &list.id, media(1, "Premier")).await.unwrap();

        let items = items_impl(&pool, &list.id).await.unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items.iter().map(|i| i.media_id).collect::<Vec<_>>(), vec![2, 1]);
    }

    #[tokio::test]
    async fn removes_a_single_item_without_touching_the_rest() {
        let pool = migrated_pool().await;
        let list = create_impl(&pool, "default", "Ma liste", None).await.unwrap();
        add_impl(&pool, &list.id, media(1, "Un")).await.unwrap();
        add_impl(&pool, &list.id, media(2, "Deux")).await.unwrap();

        remove_item_impl(&pool, &list.id, 1, MediaType::Movie).await.unwrap();

        let items = items_impl(&pool, &list.id).await.unwrap();
        assert_eq!(items.iter().map(|i| i.media_id).collect::<Vec<_>>(), vec![2]);
    }

    #[tokio::test]
    async fn removes_a_list_along_with_its_items() {
        let pool = migrated_pool().await;
        let kept = create_impl(&pool, "default", "Gardée", None).await.unwrap();
        let removed = create_impl(&pool, "default", "Supprimée", None).await.unwrap();
        add_impl(&pool, &kept.id, media(1, "Un")).await.unwrap();
        add_impl(&pool, &removed.id, media(2, "Deux")).await.unwrap();

        remove_impl(&pool, &removed.id).await.unwrap();

        let lists = list_impl(&pool, "default").await.unwrap();
        assert_eq!(lists.iter().map(|l| l.id.clone()).collect::<Vec<_>>(), vec![kept.id.clone()]);
        assert_eq!(items_impl(&pool, &removed.id).await.unwrap().len(), 0);
        assert_eq!(items_impl(&pool, &kept.id).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_freshly_added_items_id_is_stable_across_a_reread() {
        let pool = migrated_pool().await;
        let list = create_impl(&pool, "default", "Ma liste", None).await.unwrap();
        add_impl(&pool, &list.id, media(1, "Un")).await.unwrap();

        let items = items_impl(&pool, &list.id).await.unwrap();
        assert_eq!(items.len(), 1);
    }
}
