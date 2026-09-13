use sqlx::SqlitePool;
use tauri::State;

use super::models::{DismissedRecommendation, MediaSummaryInput};
use super::service::RecommendationsService;
use crate::diagnostics::timed;
use crate::error::ApiError;
use crate::models::MediaType;

#[tauri::command]
pub async fn list_dismissed_recommendations(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<DismissedRecommendation>, ApiError> {
    timed("list_dismissed_recommendations", async {
        RecommendationsService::new(pool.inner()).list().await
    })
    .await
}

#[tauri::command]
pub async fn dismiss_recommendation(
    media: MediaSummaryInput,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    timed("dismiss_recommendation", async {
        RecommendationsService::new(pool.inner())
            .dismiss(media)
            .await
    })
    .await
}

#[tauri::command]
pub async fn undismiss_recommendation(
    media_id: i64,
    media_type: MediaType,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    timed("undismiss_recommendation", async {
        RecommendationsService::new(pool.inner())
            .undismiss(media_id, media_type)
            .await
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use tauri::Manager;

    #[tokio::test]
    async fn dismiss_then_undismiss_round_trips_through_the_commands() {
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

        dismiss_recommendation(
            MediaSummaryInput {
                id: 7,
                media_type: MediaType::Movie,
                title: "Dune".to_string(),
                poster_path: None,
            },
            state.clone(),
        )
        .await
        .unwrap();

        let list = list_dismissed_recommendations(state.clone()).await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].media_id, 7);

        undismiss_recommendation(7, MediaType::Movie, state.clone())
            .await
            .unwrap();

        assert!(
            list_dismissed_recommendations(state)
                .await
                .unwrap()
                .is_empty()
        );
    }
}
