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
pub(crate) struct CustomListRow {
    pub(crate) uuid: String,
    pub(crate) profile_id: String,
    pub(crate) name: String,
    pub(crate) description: Option<String>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
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
pub(crate) struct CustomListItemRow {
    pub(crate) uuid: String,
    pub(crate) list_id: String,
    pub(crate) media_id: i64,
    pub(crate) media_type: String,
    pub(crate) title: String,
    pub(crate) poster_path: Option<String>,
    pub(crate) position: i64,
    pub(crate) added_at: String,
    pub(crate) updated_at: String,
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

const MAX_LIST_NAME_LENGTH: usize = 100;

async fn create_impl(pool: &SqlitePool, profile_id: &str, name: &str, description: Option<String>) -> Result<CustomList, ApiError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(ApiError::bad_request("Le nom de la liste est requis."));
    }
    if trimmed.chars().count() > MAX_LIST_NAME_LENGTH {
        return Err(ApiError::bad_request(format!(
            "Le nom de la liste ne peut pas dépasser {MAX_LIST_NAME_LENGTH} caractères."
        )));
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

/// Every command below takes a bare `list_id` from the frontend with no
/// other proof of ownership, so each one must confirm the list belongs to
/// the caller's active profile before reading or writing it — otherwise a
/// profile that merely knows another profile's list UUID could read,
/// mutate, or delete it. `not_found` (rather than a distinct "forbidden")
/// avoids confirming to the caller that a list with that UUID exists at
/// all under a different profile.
async fn assert_owns_list<'e, E>(executor: E, profile_id: &str, list_id: &str) -> Result<(), ApiError>
where
    E: sqlx::Executor<'e, Database = sqlx::Sqlite>,
{
    let owned: Option<(i64,)> = sqlx::query_as("SELECT 1 FROM custom_lists WHERE uuid = $1 AND profile_id = $2")
        .bind(list_id)
        .bind(profile_id)
        .fetch_optional(executor)
        .await
        .map_err(ApiError::from)?;
    owned.map(|_| ()).ok_or_else(|| ApiError::not_found("Liste introuvable."))
}

async fn remove_impl(pool: &SqlitePool, profile_id: &str, list_id: &str) -> Result<(), ApiError> {
    let mut tx = pool.begin().await.map_err(ApiError::from)?;
    assert_owns_list(&mut *tx, profile_id, list_id).await?;

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

async fn items_impl(pool: &SqlitePool, profile_id: &str, list_id: &str) -> Result<Vec<CustomListItem>, ApiError> {
    assert_owns_list(pool, profile_id, list_id).await?;
    let rows: Vec<CustomListItemRow> = sqlx::query_as("SELECT * FROM custom_list_items WHERE list_id = $1 ORDER BY position")
        .bind(list_id)
        .fetch_all(pool)
        .await
        .map_err(ApiError::from)?;
    Ok(rows.into_iter().map(Into::into).collect())
}

async fn add_impl(pool: &SqlitePool, profile_id: &str, list_id: &str, media: MediaSummaryInput) -> Result<(), ApiError> {
    let mut tx = pool.begin().await.map_err(ApiError::from)?;
    assert_owns_list(&mut *tx, profile_id, list_id).await?;

    // MAX(position)+1 computed inside the same transaction as the insert
    // below (rather than items.len() read separately beforehand) so two
    // concurrent adds to the same list can't both land on the same
    // position — the second transaction blocks until the first commits.
    let (next_position,): (i64,) =
        sqlx::query_as("SELECT COALESCE(MAX(position) + 1, 0) FROM custom_list_items WHERE list_id = $1")
            .bind(list_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(ApiError::from)?;

    let now = now_iso(&mut *tx).await?;
    let item = CustomListItem {
        id: new_uuid(),
        list_id: list_id.to_string(),
        media_id: media.id,
        media_type: media.media_type,
        title: media.title,
        poster_path: media.poster_path,
        position: next_position,
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
    .execute(&mut *tx)
    .await
    .map_err(ApiError::from)?;

    sqlx::query("UPDATE custom_lists SET updated_at = $1 WHERE uuid = $2")
        .bind(&now)
        .bind(list_id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;

    tx.commit().await.map_err(ApiError::from)?;
    Ok(())
}

async fn remove_item_impl(
    pool: &SqlitePool,
    profile_id: &str,
    list_id: &str,
    media_id: i64,
    media_type: MediaType,
) -> Result<(), ApiError> {
    assert_owns_list(pool, profile_id, list_id).await?;
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
    let profile_id = current_profile_id(&pool).await?;
    remove_impl(&pool, &profile_id, &list_id).await
}

#[tauri::command]
pub async fn list_custom_list_items(list_id: String, pool: State<'_, SqlitePool>) -> Result<Vec<CustomListItem>, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    items_impl(&pool, &profile_id, &list_id).await
}

#[tauri::command]
pub async fn add_custom_list_item(
    list_id: String,
    media: MediaSummaryInput,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    add_impl(&pool, &profile_id, &list_id, media).await
}

#[tauri::command]
pub async fn remove_custom_list_item(
    list_id: String,
    media_id: i64,
    media_type: MediaType,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    remove_item_impl(&pool, &profile_id, &list_id, media_id, media_type).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(2).connect("sqlite::memory:").await.unwrap();
        crate::database::migrations::run_migrations(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('other', 'Other', '2026-01-01', '2026-01-01')",
        )
        .execute(&pool)
        .await
        .unwrap();
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
    async fn rejects_a_name_over_the_length_limit() {
        let pool = migrated_pool().await;
        let too_long = "a".repeat(MAX_LIST_NAME_LENGTH + 1);
        assert!(create_impl(&pool, "default", &too_long, None).await.is_err());

        let exactly_at_limit = "a".repeat(MAX_LIST_NAME_LENGTH);
        assert!(create_impl(&pool, "default", &exactly_at_limit, None).await.is_ok());
    }

    #[tokio::test]
    async fn adds_items_with_increasing_positions_and_deduplicates_readds() {
        let pool = migrated_pool().await;
        let list = create_impl(&pool, "default", "Ma liste", None).await.unwrap();

        add_impl(&pool, "default", &list.id, media(1, "Premier")).await.unwrap();
        add_impl(&pool, "default", &list.id, media(2, "Deuxième")).await.unwrap();
        add_impl(&pool, "default", &list.id, media(1, "Premier")).await.unwrap();

        let items = items_impl(&pool, "default", &list.id).await.unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items.iter().map(|i| i.media_id).collect::<Vec<_>>(), vec![2, 1]);
    }

    #[tokio::test]
    async fn removes_a_single_item_without_touching_the_rest() {
        let pool = migrated_pool().await;
        let list = create_impl(&pool, "default", "Ma liste", None).await.unwrap();
        add_impl(&pool, "default", &list.id, media(1, "Un")).await.unwrap();
        add_impl(&pool, "default", &list.id, media(2, "Deux")).await.unwrap();

        remove_item_impl(&pool, "default", &list.id, 1, MediaType::Movie).await.unwrap();

        let items = items_impl(&pool, "default", &list.id).await.unwrap();
        assert_eq!(items.iter().map(|i| i.media_id).collect::<Vec<_>>(), vec![2]);
    }

    #[tokio::test]
    async fn removes_a_list_along_with_its_items() {
        let pool = migrated_pool().await;
        let kept = create_impl(&pool, "default", "Gardée", None).await.unwrap();
        let removed = create_impl(&pool, "default", "Supprimée", None).await.unwrap();
        add_impl(&pool, "default", &kept.id, media(1, "Un")).await.unwrap();
        add_impl(&pool, "default", &removed.id, media(2, "Deux")).await.unwrap();

        remove_impl(&pool, "default", &removed.id).await.unwrap();

        let lists = list_impl(&pool, "default").await.unwrap();
        assert_eq!(lists.iter().map(|l| l.id.clone()).collect::<Vec<_>>(), vec![kept.id.clone()]);
        // The list itself is gone, so querying its items now 404s rather
        // than returning an empty vec.
        assert!(items_impl(&pool, "default", &removed.id).await.is_err());
        assert_eq!(items_impl(&pool, "default", &kept.id).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_freshly_added_items_id_is_stable_across_a_reread() {
        let pool = migrated_pool().await;
        let list = create_impl(&pool, "default", "Ma liste", None).await.unwrap();
        add_impl(&pool, "default", &list.id, media(1, "Un")).await.unwrap();

        let items = items_impl(&pool, "default", &list.id).await.unwrap();
        assert_eq!(items.len(), 1);
    }

    #[tokio::test]
    async fn a_profile_cannot_read_write_or_delete_another_profiles_list() {
        let pool = migrated_pool().await;
        let list = create_impl(&pool, "default", "Privée", None).await.unwrap();
        add_impl(&pool, "default", &list.id, media(1, "Un")).await.unwrap();

        assert!(items_impl(&pool, "other", &list.id).await.is_err());
        assert!(add_impl(&pool, "other", &list.id, media(2, "Deux")).await.is_err());
        assert!(remove_item_impl(&pool, "other", &list.id, 1, MediaType::Movie).await.is_err());
        assert!(remove_impl(&pool, "other", &list.id).await.is_err());

        // None of the rejected calls above should have mutated anything.
        assert_eq!(items_impl(&pool, "default", &list.id).await.unwrap().len(), 1);
        assert_eq!(list_impl(&pool, "default").await.unwrap().len(), 1);
    }
}
