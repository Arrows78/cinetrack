use sqlx::SqlitePool;

use super::models::{DismissedRecommendation, DismissedRecommendationRow, MediaSummaryInput};
use crate::database::{new_uuid, now_iso};
use crate::error::ApiError;
use crate::models::MediaType;

pub(super) async fn list_impl(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<Vec<DismissedRecommendation>, ApiError> {
    let rows: Vec<DismissedRecommendationRow> = sqlx::query_as(
        "SELECT * FROM dismissed_recommendations WHERE profile_id = $1 ORDER BY created_at DESC",
    )
    .bind(profile_id)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;
    Ok(rows.into_iter().map(Into::into).collect())
}

/// Idempotent: dismissing an already-dismissed title is a no-op rather than
/// a second insert (which the UNIQUE index on (profile_id, media_id,
/// media_type) would otherwise reject) — same idempotent-mutation shape the
/// audit's data-integrity findings require elsewhere (see
/// apply_episodes_and_log_impl's own doc comment).
pub(super) async fn dismiss_impl(
    pool: &SqlitePool,
    profile_id: &str,
    media: MediaSummaryInput,
) -> Result<(), ApiError> {
    let existing: Option<(String,)> = sqlx::query_as(
        "SELECT uuid FROM dismissed_recommendations WHERE profile_id = $1 AND media_id = $2 AND media_type = $3",
    )
    .bind(profile_id)
    .bind(media.id)
    .bind(media.media_type.as_db_str())
    .fetch_optional(pool)
    .await
    .map_err(ApiError::from)?;
    if existing.is_some() {
        return Ok(());
    }

    let now = now_iso(pool).await?;
    sqlx::query(
        "INSERT INTO dismissed_recommendations (uuid,profile_id,media_id,media_type,title,poster_path,dismissed_at,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$7)",
    )
    .bind(new_uuid())
    .bind(profile_id)
    .bind(media.id)
    .bind(media.media_type.as_db_str())
    .bind(&media.title)
    .bind(&media.poster_path)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(ApiError::from)?;
    Ok(())
}

/// Idempotent: undismissing a title that isn't (or is no longer) dismissed
/// affects zero rows rather than erroring.
pub(super) async fn undismiss_impl(
    pool: &SqlitePool,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
) -> Result<(), ApiError> {
    sqlx::query("DELETE FROM dismissed_recommendations WHERE profile_id = $1 AND media_id = $2 AND media_type = $3")
        .bind(profile_id)
        .bind(media_id)
        .bind(media_type.as_db_str())
        .execute(pool)
        .await
        .map_err(ApiError::from)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database::migrations::run_migrations(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('other', 'Other', '2026-01-01', '2026-01-01')",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    fn media(id: i64, media_type: MediaType, title: &str) -> MediaSummaryInput {
        MediaSummaryInput {
            id,
            media_type,
            title: title.to_string(),
            poster_path: Some("/poster.jpg".to_string()),
        }
    }

    #[tokio::test]
    async fn dismisses_a_title_and_it_shows_up_in_the_list() {
        let pool = migrated_pool().await;
        dismiss_impl(&pool, "default", media(7, MediaType::Movie, "Dune"))
            .await
            .unwrap();

        let list = list_impl(&pool, "default").await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].media_id, 7);
        assert_eq!(list[0].title, "Dune");
    }

    #[tokio::test]
    async fn dismissing_the_same_title_twice_does_not_duplicate_the_row() {
        let pool = migrated_pool().await;
        dismiss_impl(&pool, "default", media(7, MediaType::Movie, "Dune"))
            .await
            .unwrap();
        dismiss_impl(&pool, "default", media(7, MediaType::Movie, "Dune"))
            .await
            .unwrap();

        assert_eq!(list_impl(&pool, "default").await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn undismissing_removes_it_from_the_list() {
        let pool = migrated_pool().await;
        dismiss_impl(&pool, "default", media(7, MediaType::Movie, "Dune"))
            .await
            .unwrap();

        undismiss_impl(&pool, "default", 7, MediaType::Movie)
            .await
            .unwrap();

        assert!(list_impl(&pool, "default").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn undismissing_a_title_that_was_never_dismissed_is_a_harmless_no_op() {
        let pool = migrated_pool().await;
        let result = undismiss_impl(&pool, "default", 7, MediaType::Movie).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn distinguishes_by_media_type() {
        let pool = migrated_pool().await;
        dismiss_impl(&pool, "default", media(7, MediaType::Movie, "Movie"))
            .await
            .unwrap();

        let list = list_impl(&pool, "default").await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].media_type, MediaType::Movie);
    }

    #[tokio::test]
    async fn a_dismissal_never_leaks_across_profiles() {
        let pool = migrated_pool().await;
        dismiss_impl(&pool, "default", media(7, MediaType::Movie, "Dune"))
            .await
            .unwrap();
        dismiss_impl(&pool, "other", media(8, MediaType::Series, "Other Show"))
            .await
            .unwrap();

        let default_list = list_impl(&pool, "default").await.unwrap();
        assert_eq!(default_list.len(), 1);
        assert_eq!(default_list[0].media_id, 7);

        undismiss_impl(&pool, "other", 7, MediaType::Movie)
            .await
            .unwrap();
        assert_eq!(list_impl(&pool, "default").await.unwrap().len(), 1);
    }
}
