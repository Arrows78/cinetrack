use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::SqlitePool;
use tauri::State;

use crate::commands::macros::profile_scoped_command;
use crate::database::{new_uuid, now_iso};
use crate::error::ApiError;
use crate::models::MediaType;

/// Only the fields `toggle_availability_alert` reads off the frontend's
/// `MediaSummary` object.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSummaryInput {
    pub id: i64,
    pub media_type: MediaType,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailabilityAlert {
    pub id: String,
    pub profile_id: String,
    pub media_id: i64,
    pub media_type: MediaType,
    pub title: String,
    pub region: String,
    pub provider_ids: Vec<i64>,
    pub enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailabilitySnapshot {
    pub media_id: i64,
    pub media_type: MediaType,
    pub region: String,
    pub provider_ids: Vec<i64>,
    pub checked_at: String,
}

#[derive(sqlx::FromRow)]
pub(crate) struct AlertRow {
    pub(crate) uuid: String,
    pub(crate) profile_id: String,
    pub(crate) media_id: i64,
    pub(crate) media_type: String,
    pub(crate) title: String,
    pub(crate) region: String,
    pub(crate) provider_ids: String,
    pub(crate) enabled: bool,
    pub(crate) created_at: String,
}

#[derive(sqlx::FromRow)]
pub(crate) struct SnapshotRow {
    pub(crate) media_id: i64,
    pub(crate) media_type: String,
    pub(crate) region: String,
    pub(crate) provider_ids: String,
    pub(crate) checked_at: String,
}

/// A corrupt provider_ids cell must not make the whole list/snapshot
/// unreadable — mirrors parseProviderIds in the original TS.
fn parse_provider_ids(raw: &str) -> Vec<i64> {
    let Ok(Value::Array(values)) = serde_json::from_str::<Value>(raw) else {
        return Vec::new();
    };
    values.into_iter().filter_map(|value| value.as_i64()).collect()
}

impl From<AlertRow> for AvailabilityAlert {
    fn from(row: AlertRow) -> Self {
        Self {
            id: row.uuid,
            profile_id: row.profile_id,
            media_id: row.media_id,
            media_type: MediaType::from_db_str(&row.media_type),
            title: row.title,
            region: row.region,
            provider_ids: parse_provider_ids(&row.provider_ids),
            enabled: row.enabled,
            created_at: row.created_at,
        }
    }
}

impl From<SnapshotRow> for AvailabilitySnapshot {
    fn from(row: SnapshotRow) -> Self {
        Self {
            media_id: row.media_id,
            media_type: MediaType::from_db_str(&row.media_type),
            region: row.region,
            provider_ids: parse_provider_ids(&row.provider_ids),
            checked_at: row.checked_at,
        }
    }
}

async fn list_alerts_impl(pool: &SqlitePool, profile_id: &str) -> Result<Vec<AvailabilityAlert>, ApiError> {
    let rows: Vec<AlertRow> =
        sqlx::query_as("SELECT * FROM availability_alerts WHERE profile_id = $1 ORDER BY created_at DESC")
            .bind(profile_id)
            .fetch_all(pool)
            .await
            .map_err(ApiError::from)?;
    Ok(rows.into_iter().map(Into::into).collect())
}

async fn get_alert_impl(
    pool: &SqlitePool,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
) -> Result<Option<AvailabilityAlert>, ApiError> {
    let row: Option<AlertRow> = sqlx::query_as(
        "SELECT * FROM availability_alerts WHERE profile_id = $1 AND media_id = $2 AND media_type = $3",
    )
    .bind(profile_id)
    .bind(media_id)
    .bind(media_type.as_db_str())
    .fetch_optional(pool)
    .await
    .map_err(ApiError::from)?;
    Ok(row.map(Into::into))
}

async fn toggle_impl(
    pool: &SqlitePool,
    profile_id: &str,
    media: MediaSummaryInput,
    region: String,
    provider_ids: Vec<i64>,
) -> Result<Option<AvailabilityAlert>, ApiError> {
    let existing = get_alert_impl(pool, profile_id, media.id, media.media_type).await?;
    if let Some(existing) = existing {
        remove_impl(pool, &existing.id).await?;
        return Ok(None);
    }

    let created_at = now_iso(pool).await?;
    let alert = AvailabilityAlert {
        id: new_uuid(),
        profile_id: profile_id.to_string(),
        media_id: media.id,
        media_type: media.media_type,
        title: media.title,
        region,
        provider_ids,
        enabled: true,
        created_at,
    };

    sqlx::query(
        "INSERT INTO availability_alerts (uuid,profile_id,media_id,media_type,title,region,provider_ids,enabled,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,$8)",
    )
    .bind(&alert.id)
    .bind(&alert.profile_id)
    .bind(alert.media_id)
    .bind(alert.media_type.as_db_str())
    .bind(&alert.title)
    .bind(&alert.region)
    .bind(serde_json::to_string(&alert.provider_ids).unwrap())
    .bind(&alert.created_at)
    .execute(pool)
    .await
    .map_err(ApiError::from)?;

    Ok(Some(alert))
}

async fn remove_impl(pool: &SqlitePool, id: &str) -> Result<(), ApiError> {
    sqlx::query("DELETE FROM availability_alerts WHERE uuid = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(ApiError::from)?;
    Ok(())
}

async fn get_snapshot_impl(
    pool: &SqlitePool,
    media_id: i64,
    media_type: MediaType,
    region: &str,
) -> Result<Option<AvailabilitySnapshot>, ApiError> {
    let row: Option<SnapshotRow> =
        sqlx::query_as("SELECT * FROM availability_snapshots WHERE media_id = $1 AND media_type = $2 AND region = $3")
            .bind(media_id)
            .bind(media_type.as_db_str())
            .bind(region)
            .fetch_optional(pool)
            .await
            .map_err(ApiError::from)?;
    Ok(row.map(Into::into))
}

async fn save_snapshot_impl(pool: &SqlitePool, snapshot: AvailabilitySnapshot) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT OR REPLACE INTO availability_snapshots (media_id,media_type,region,provider_ids,checked_at)
         VALUES ($1,$2,$3,$4,$5)",
    )
    .bind(snapshot.media_id)
    .bind(snapshot.media_type.as_db_str())
    .bind(&snapshot.region)
    .bind(serde_json::to_string(&snapshot.provider_ids).unwrap())
    .bind(&snapshot.checked_at)
    .execute(pool)
    .await
    .map_err(ApiError::from)?;
    Ok(())
}

profile_scoped_command! {
    pub async fn list_availability_alerts() -> Vec<AvailabilityAlert> => list_alerts_impl
}

profile_scoped_command! {
    pub async fn get_availability_alert(media_id: i64, media_type: MediaType) -> Option<AvailabilityAlert> => get_alert_impl
}

profile_scoped_command! {
    pub async fn toggle_availability_alert(
        media: MediaSummaryInput,
        region: String,
        provider_ids: Vec<i64>
    ) -> Option<AvailabilityAlert> => toggle_impl
}

#[tauri::command]
pub async fn remove_availability_alert(id: String, pool: State<'_, SqlitePool>) -> Result<(), ApiError> {
    remove_impl(&pool, &id).await
}

#[tauri::command]
pub async fn get_availability_snapshot(
    media_id: i64,
    media_type: MediaType,
    region: String,
    pool: State<'_, SqlitePool>,
) -> Result<Option<AvailabilitySnapshot>, ApiError> {
    get_snapshot_impl(&pool, media_id, media_type, &region).await
}

#[tauri::command]
pub async fn save_availability_snapshot(
    snapshot: AvailabilitySnapshot,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    save_snapshot_impl(&pool, snapshot).await
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

    fn media(id: i64, media_type: MediaType, title: &str) -> MediaSummaryInput {
        MediaSummaryInput { id, media_type, title: title.to_string() }
    }

    #[tokio::test]
    async fn creates_an_alert_on_first_toggle_and_removes_it_on_the_second() {
        let pool = migrated_pool().await;
        let m = media(7, MediaType::Movie, "Alerte");

        let created = toggle_impl(&pool, "default", m.clone(), "FR".to_string(), vec![8]).await.unwrap();
        assert!(created.is_some());
        assert!(created.unwrap().enabled);
        assert!(get_alert_impl(&pool, "default", 7, MediaType::Movie).await.unwrap().is_some());

        let removed = toggle_impl(&pool, "default", m, "FR".to_string(), vec![8]).await.unwrap();
        assert!(removed.is_none());
        assert!(get_alert_impl(&pool, "default", 7, MediaType::Movie).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn distinguishes_alerts_by_media_type() {
        let pool = migrated_pool().await;
        toggle_impl(&pool, "default", media(7, MediaType::Movie, "Movie"), "FR".to_string(), vec![8]).await.unwrap();

        assert!(get_alert_impl(&pool, "default", 7, MediaType::Series).await.unwrap().is_none());
        assert!(get_alert_impl(&pool, "default", 7, MediaType::Movie).await.unwrap().is_some());
    }

    #[tokio::test]
    async fn round_trips_a_snapshot_and_replaces_it_on_the_same_media_region_key() {
        let pool = migrated_pool().await;
        assert!(get_snapshot_impl(&pool, 1, MediaType::Movie, "FR").await.unwrap().is_none());

        save_snapshot_impl(
            &pool,
            AvailabilitySnapshot {
                media_id: 1,
                media_type: MediaType::Movie,
                region: "FR".to_string(),
                provider_ids: vec![8, 119],
                checked_at: "2026-01-01T00:00:00.000Z".to_string(),
            },
        )
        .await
        .unwrap();
        let snapshot = get_snapshot_impl(&pool, 1, MediaType::Movie, "FR").await.unwrap().unwrap();
        assert_eq!(snapshot.provider_ids, vec![8, 119]);

        save_snapshot_impl(
            &pool,
            AvailabilitySnapshot {
                media_id: 1,
                media_type: MediaType::Movie,
                region: "FR".to_string(),
                provider_ids: vec![337],
                checked_at: "2026-02-01T00:00:00.000Z".to_string(),
            },
        )
        .await
        .unwrap();
        let replaced = get_snapshot_impl(&pool, 1, MediaType::Movie, "FR").await.unwrap().unwrap();
        assert_eq!(replaced.provider_ids, vec![337]);
        assert_eq!(replaced.checked_at, "2026-02-01T00:00:00.000Z");
    }

    #[tokio::test]
    async fn keeps_snapshots_for_different_regions_separate() {
        let pool = migrated_pool().await;
        save_snapshot_impl(
            &pool,
            AvailabilitySnapshot {
                media_id: 1,
                media_type: MediaType::Movie,
                region: "FR".to_string(),
                provider_ids: vec![8],
                checked_at: "2026-01-01T00:00:00.000Z".to_string(),
            },
        )
        .await
        .unwrap();
        save_snapshot_impl(
            &pool,
            AvailabilitySnapshot {
                media_id: 1,
                media_type: MediaType::Movie,
                region: "US".to_string(),
                provider_ids: vec![9],
                checked_at: "2026-01-01T00:00:00.000Z".to_string(),
            },
        )
        .await
        .unwrap();

        assert_eq!(get_snapshot_impl(&pool, 1, MediaType::Movie, "FR").await.unwrap().unwrap().provider_ids, vec![8]);
        assert_eq!(get_snapshot_impl(&pool, 1, MediaType::Movie, "US").await.unwrap().unwrap().provider_ids, vec![9]);
    }

    #[tokio::test]
    async fn tolerates_corrupt_provider_ids_json() {
        assert_eq!(parse_provider_ids("not json"), Vec::<i64>::new());
        assert_eq!(parse_provider_ids("[8, \"x\", 119]"), vec![8, 119]);
    }
}
