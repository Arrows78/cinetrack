use sqlx::SqlitePool;

use super::{RatingBucket, RatingDistribution, RatingPeriodAverage};
use crate::error::ApiError;

#[derive(sqlx::FromRow)]
struct RatingBucketRow {
    rating: f64,
    count: i64,
}

#[derive(sqlx::FromRow)]
struct RatingPeriodRow {
    period: String,
    average: f64,
    count: i64,
}

pub(super) async fn get_rating_distribution_impl(
    pool: &SqlitePool,
    profile_id: &str,
    window_start: &str,
) -> Result<RatingDistribution, ApiError> {
    let distribution: Vec<RatingBucketRow> = sqlx::query_as(
        "SELECT user_rating AS rating, COUNT(*) AS count
         FROM library_items
         WHERE profile_id = $1 AND user_rating IS NOT NULL
         GROUP BY user_rating
         ORDER BY user_rating ASC",
    )
    .bind(profile_id)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    let average_by_month: Vec<RatingPeriodRow> = sqlx::query_as(
        "WITH monthly_titles AS (
           SELECT DISTINCT strftime('%Y-%m', ve.watched_at) AS period, ve.media_id, ve.media_type
           FROM viewing_events ve
           WHERE ve.profile_id = $1 AND ve.event_type IN ('watched','rewatched') AND ve.watched_at >= $2
         )
         SELECT mt.period AS period, AVG(li.user_rating) AS average, COUNT(*) AS count
         FROM monthly_titles mt
         JOIN library_items li ON li.profile_id = $1 AND li.media_id = mt.media_id AND li.media_type = mt.media_type
         WHERE li.user_rating IS NOT NULL
         GROUP BY mt.period
         ORDER BY mt.period ASC",
    )
    .bind(profile_id)
    .bind(window_start)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    let average_by_year: Vec<RatingPeriodRow> = sqlx::query_as(
        "WITH yearly_titles AS (
           SELECT DISTINCT strftime('%Y', ve.watched_at) AS period, ve.media_id, ve.media_type
           FROM viewing_events ve
           WHERE ve.profile_id = $1 AND ve.event_type IN ('watched','rewatched')
         )
         SELECT yt.period AS period, AVG(li.user_rating) AS average, COUNT(*) AS count
         FROM yearly_titles yt
         JOIN library_items li ON li.profile_id = $1 AND li.media_id = yt.media_id AND li.media_type = yt.media_type
         WHERE li.user_rating IS NOT NULL
         GROUP BY yt.period
         ORDER BY yt.period ASC",
    )
    .bind(profile_id)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    Ok(RatingDistribution {
        distribution: distribution
            .into_iter()
            .map(|row| RatingBucket { rating: row.rating, count: row.count })
            .collect(),
        average_by_month: average_by_month
            .into_iter()
            .map(|row| RatingPeriodAverage { period: row.period, average: row.average, count: row.count })
            .collect(),
        average_by_year: average_by_year
            .into_iter()
            .map(|row| RatingPeriodAverage { period: row.period, average: row.average, count: row.count })
            .collect(),
    })
}
