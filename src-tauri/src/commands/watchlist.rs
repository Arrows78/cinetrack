use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::SqlitePool;
use tauri::State;

use super::history::{add_history_item_impl, HistoryAction, ViewingHistoryItem};
use crate::commands::macros::profile_scoped_command;
use crate::database::{current_profile_id, new_uuid, now_iso};
use crate::error::ApiError;
use crate::models::MediaType;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchlistItem {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_id: Option<String>,
    pub media_id: i64,
    pub media_type: MediaType,
    pub title: String,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub year: Option<i64>,
    pub rating: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(sqlx::FromRow)]
struct WatchlistRow {
    uuid: String,
    profile_id: String,
    media_id: i64,
    media_type: String,
    title: String,
    poster_path: Option<String>,
    backdrop_path: Option<String>,
    year: Option<i64>,
    rating: Option<f64>,
    created_at: String,
    updated_at: String,
}

impl From<WatchlistRow> for WatchlistItem {
    fn from(row: WatchlistRow) -> Self {
        Self {
            id: row.uuid,
            profile_id: Some(row.profile_id),
            media_id: row.media_id,
            media_type: MediaType::from_db_str(&row.media_type),
            title: row.title,
            poster_path: row.poster_path,
            backdrop_path: row.backdrop_path,
            year: row.year,
            rating: row.rating,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

async fn list_impl(pool: &SqlitePool, profile_id: &str) -> Result<Vec<WatchlistItem>, ApiError> {
    let rows: Vec<WatchlistRow> =
        sqlx::query_as("SELECT * FROM watchlist_items WHERE profile_id = $1 ORDER BY created_at DESC")
            .bind(profile_id)
            .fetch_all(pool)
            .await
            .map_err(ApiError::from)?;
    Ok(rows.into_iter().map(Into::into).collect())
}

async fn has_impl(pool: &SqlitePool, profile_id: &str, media_id: i64, media_type: MediaType) -> Result<bool, ApiError> {
    let row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM watchlist_items WHERE profile_id = $1 AND media_id = $2 AND media_type = $3",
    )
    .bind(profile_id)
    .bind(media_id)
    .bind(media_type.as_db_str())
    .fetch_one(pool)
    .await
    .map_err(ApiError::from)?;
    Ok(row.0 > 0)
}

async fn upsert_impl(pool: &SqlitePool, item: WatchlistItem) -> Result<(), ApiError> {
    let profile_id = current_profile_id(pool).await?;
    let already_exists = has_impl(pool, &profile_id, item.media_id, item.media_type).await?;

    let mut tx = pool.begin().await.map_err(ApiError::from)?;

    // created_at/updated_at both take the caller-supplied createdAt when
    // present, else "now" — matching the TS upsert, which reused a single
    // bound value ($10) for both columns on insert and only touched
    // updated_at (to that same value) on conflict.
    sqlx::query(
        "INSERT INTO watchlist_items
          (uuid, profile_id, media_id, media_type, title, poster_path, backdrop_path, year, rating, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
           COALESCE(NULLIF($10, ''), strftime('%Y-%m-%dT%H:%M:%f', 'now') || 'Z'),
           COALESCE(NULLIF($10, ''), strftime('%Y-%m-%dT%H:%M:%f', 'now') || 'Z'))
         ON CONFLICT (profile_id, media_id, media_type) DO UPDATE SET
           title = excluded.title,
           poster_path = excluded.poster_path,
           backdrop_path = excluded.backdrop_path,
           year = excluded.year,
           rating = excluded.rating,
           updated_at = excluded.updated_at",
    )
    .bind(new_uuid())
    .bind(&profile_id)
    .bind(item.media_id)
    .bind(item.media_type.as_db_str())
    .bind(&item.title)
    .bind(&item.poster_path)
    .bind(&item.backdrop_path)
    .bind(item.year)
    .bind(item.rating)
    .bind(&item.created_at)
    .execute(&mut *tx)
    .await
    .map_err(ApiError::from)?;

    if !already_exists {
        let timestamp = now_iso(&mut *tx).await?;
        let history_item = ViewingHistoryItem {
            id: new_uuid(),
            media_id: item.media_id,
            media_type: item.media_type,
            title: item.title,
            action: HistoryAction::WatchlistAdd,
            timestamp,
            season_number: None,
            episode_number: None,
            episode_title: None,
            metadata: Some(json!({ "profileId": profile_id })),
        };
        add_history_item_impl(&mut *tx, pool, history_item).await?;
    }

    tx.commit().await.map_err(ApiError::from)?;
    Ok(())
}

async fn remove_impl(pool: &SqlitePool, media_id: i64, media_type: MediaType) -> Result<(), ApiError> {
    let profile_id = current_profile_id(pool).await?;
    let existing = list_impl(pool, &profile_id)
        .await?
        .into_iter()
        .find(|current| current.media_id == media_id && current.media_type == media_type);

    let mut tx = pool.begin().await.map_err(ApiError::from)?;

    sqlx::query("DELETE FROM watchlist_items WHERE profile_id = $1 AND media_id = $2 AND media_type = $3")
        .bind(&profile_id)
        .bind(media_id)
        .bind(media_type.as_db_str())
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;

    if let Some(item) = existing {
        let timestamp = now_iso(&mut *tx).await?;
        let history_item = ViewingHistoryItem {
            id: new_uuid(),
            media_id,
            media_type,
            title: item.title,
            action: HistoryAction::WatchlistRemove,
            timestamp,
            season_number: None,
            episode_number: None,
            episode_title: None,
            metadata: Some(json!({ "profileId": profile_id })),
        };
        add_history_item_impl(&mut *tx, pool, history_item).await?;
    }

    tx.commit().await.map_err(ApiError::from)?;
    Ok(())
}

profile_scoped_command! {
    pub async fn list_watchlist() -> Vec<WatchlistItem> => list_impl
}

profile_scoped_command! {
    pub async fn has_watchlist_item(media_id: i64, media_type: MediaType) -> bool => has_impl
}

#[tauri::command]
pub async fn save_watchlist_item(item: WatchlistItem, pool: State<'_, SqlitePool>) -> Result<(), ApiError> {
    upsert_impl(&pool, item).await
}

#[tauri::command]
pub async fn remove_watchlist_item(
    media_id: i64,
    media_type: MediaType,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    remove_impl(&pool, media_id, media_type).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::history::list_history_impl;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(4)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database::migrations::run_migrations(&pool).await.unwrap();
        pool
    }

    fn item(media_id: i64, title: &str) -> WatchlistItem {
        WatchlistItem {
            id: new_uuid(),
            profile_id: None,
            media_id,
            media_type: MediaType::Movie,
            title: title.to_string(),
            poster_path: None,
            backdrop_path: None,
            year: Some(2020),
            rating: Some(7.5),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[tokio::test]
    async fn adds_an_item_and_reports_it_as_present() {
        let pool = migrated_pool().await;

        upsert_impl(&pool, item(1, "Adds item")).await.unwrap();

        let list = list_impl(&pool, "default").await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "Adds item");
        assert!(has_impl(&pool, "default", 1, MediaType::Movie).await.unwrap());
    }

    #[tokio::test]
    async fn records_a_history_entry_only_the_first_time_an_item_is_added() {
        let pool = migrated_pool().await;

        upsert_impl(&pool, item(1, "First add")).await.unwrap();
        let mut updated = item(1, "Updated title");
        upsert_impl(&pool, {
            updated.rating = Some(9.0);
            updated
        })
        .await
        .unwrap();

        let history = list_history_impl(&pool, 50).await.unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].action, HistoryAction::WatchlistAdd);

        let list = list_impl(&pool, "default").await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "Updated title");
        assert_eq!(list[0].rating, Some(9.0));
    }

    #[tokio::test]
    async fn removes_an_item_and_records_a_removal_history_entry() {
        let pool = migrated_pool().await;
        upsert_impl(&pool, item(1, "To remove")).await.unwrap();

        remove_impl(&pool, 1, MediaType::Movie).await.unwrap();

        assert!(list_impl(&pool, "default").await.unwrap().is_empty());
        let history = list_history_impl(&pool, 50).await.unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].action, HistoryAction::WatchlistRemove);
    }

    #[tokio::test]
    async fn does_not_record_a_removal_history_entry_when_the_item_was_never_present() {
        let pool = migrated_pool().await;

        remove_impl(&pool, 404, MediaType::Movie).await.unwrap();

        assert!(list_history_impl(&pool, 50).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn distinguishes_items_by_media_type() {
        let pool = migrated_pool().await;
        let mut series_item = item(1, "Same id, different type");
        series_item.media_type = MediaType::Series;

        upsert_impl(&pool, item(1, "Movie")).await.unwrap();
        upsert_impl(&pool, series_item).await.unwrap();

        assert_eq!(list_impl(&pool, "default").await.unwrap().len(), 2);
        assert!(has_impl(&pool, "default", 1, MediaType::Movie).await.unwrap());
        assert!(has_impl(&pool, "default", 1, MediaType::Series).await.unwrap());
    }
}
