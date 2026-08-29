use sqlx::SqlitePool;
use tauri::State;

use super::models::{AvailabilityAlert, AvailabilitySnapshot, MediaSummaryInput};
use super::service::AvailabilityService;
use crate::error::ApiError;
use crate::models::MediaType;

#[tauri::command]
pub async fn list_availability_alerts(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<AvailabilityAlert>, ApiError> {
    AvailabilityService::new(pool.inner()).list_alerts().await
}

#[tauri::command]
pub async fn get_availability_alert(
    media_id: i64,
    media_type: MediaType,
    pool: State<'_, SqlitePool>,
) -> Result<Option<AvailabilityAlert>, ApiError> {
    AvailabilityService::new(pool.inner())
        .get_alert(media_id, media_type)
        .await
}

#[tauri::command]
pub async fn toggle_availability_alert(
    media: MediaSummaryInput,
    region: String,
    provider_ids: Vec<i64>,
    pool: State<'_, SqlitePool>,
) -> Result<Option<AvailabilityAlert>, ApiError> {
    AvailabilityService::new(pool.inner())
        .toggle_alert(media, region, provider_ids)
        .await
}

#[tauri::command]
pub async fn remove_availability_alert(
    id: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    AvailabilityService::new(pool.inner())
        .remove_alert(&id)
        .await
}

#[tauri::command]
pub async fn get_availability_snapshot(
    media_id: i64,
    media_type: MediaType,
    region: String,
    pool: State<'_, SqlitePool>,
) -> Result<Option<AvailabilitySnapshot>, ApiError> {
    AvailabilityService::new(pool.inner())
        .get_snapshot(media_id, media_type, &region)
        .await
}

#[tauri::command]
pub async fn save_availability_snapshot(
    snapshot: AvailabilitySnapshot,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    AvailabilityService::new(pool.inner())
        .save_snapshot(snapshot)
        .await
}

/// Backs the smart-lists "My Services"/specific-provider rule (see
/// smart-list-evaluation.ts): rather than re-fetching TMDB watch-provider
/// data for every library item at evaluation time, that rule matches
/// against whatever's already cached here from normal app usage (visiting a
/// detail page, setting an availability alert). Not profile-scoped, for the
/// same reason `get_availability_snapshot` isn't: the cache itself has no
/// notion of "profile".
#[tauri::command]
pub async fn list_availability_snapshots(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<AvailabilitySnapshot>, ApiError> {
    AvailabilityService::new(pool.inner())
        .list_snapshots()
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use tauri::Manager;

    #[tokio::test]
    async fn remove_availability_alert_command_removes_the_callers_alert() {
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database::migrations::run_migrations(&pool)
            .await
            .unwrap();

        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let alert = toggle_availability_alert(
            MediaSummaryInput {
                id: 7,
                media_type: MediaType::Movie,
                title: "Alerte".to_string(),
            },
            "FR".to_string(),
            vec![8],
            state.clone(),
        )
        .await
        .unwrap()
        .unwrap();

        remove_availability_alert(alert.id.clone(), state.clone())
            .await
            .unwrap();

        assert!(
            get_availability_alert(7, MediaType::Movie, state)
                .await
                .unwrap()
                .is_none()
        );
    }

    #[tokio::test]
    async fn get_availability_snapshot_command_returns_a_saved_snapshot() {
        let app = tauri::test::mock_app();
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database::migrations::run_migrations(&pool)
            .await
            .unwrap();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        save_availability_snapshot(
            AvailabilitySnapshot {
                media_id: 1,
                media_type: MediaType::Movie,
                region: "FR".to_string(),
                provider_ids: vec![8],
                checked_at: "2026-01-01T00:00:00.000Z".to_string(),
            },
            state.clone(),
        )
        .await
        .unwrap();

        let snapshot = get_availability_snapshot(1, MediaType::Movie, "FR".to_string(), state)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(snapshot.provider_ids, vec![8]);
    }

    #[tokio::test]
    async fn save_availability_snapshot_command_persists_the_snapshot() {
        let app = tauri::test::mock_app();
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database::migrations::run_migrations(&pool)
            .await
            .unwrap();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        save_availability_snapshot(
            AvailabilitySnapshot {
                media_id: 1,
                media_type: MediaType::Movie,
                region: "FR".to_string(),
                provider_ids: vec![119],
                checked_at: "2026-01-01T00:00:00.000Z".to_string(),
            },
            state.clone(),
        )
        .await
        .unwrap();

        let snapshot = get_availability_snapshot(1, MediaType::Movie, "FR".to_string(), state)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(snapshot.provider_ids, vec![119]);
    }

    #[tokio::test]
    async fn list_availability_alerts_command_returns_the_callers_alerts() {
        let app = tauri::test::mock_app();
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database::migrations::run_migrations(&pool)
            .await
            .unwrap();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        toggle_availability_alert(
            MediaSummaryInput {
                id: 7,
                media_type: MediaType::Movie,
                title: "Alerte".to_string(),
            },
            "FR".to_string(),
            vec![8],
            state.clone(),
        )
        .await
        .unwrap();

        let alerts = list_availability_alerts(state).await.unwrap();
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].media_id, 7);
    }

    #[tokio::test]
    async fn list_availability_snapshots_command_returns_every_snapshot() {
        let app = tauri::test::mock_app();
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database::migrations::run_migrations(&pool)
            .await
            .unwrap();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        save_availability_snapshot(
            AvailabilitySnapshot {
                media_id: 1,
                media_type: MediaType::Movie,
                region: "FR".to_string(),
                provider_ids: vec![8],
                checked_at: "2026-01-01T00:00:00.000Z".to_string(),
            },
            state.clone(),
        )
        .await
        .unwrap();

        let snapshots = list_availability_snapshots(state).await.unwrap();
        assert_eq!(snapshots.len(), 1);
        assert_eq!(snapshots[0].media_id, 1);
    }
}
