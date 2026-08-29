use sqlx::SqlitePool;

use super::monthly_activity::{self, MonthlyActivityRow};
use super::{ComfortTitle, RewatchStats};
use crate::error::ApiError;

#[derive(sqlx::FromRow)]
struct RewatchTotalsRow {
    rewatches: i64,
    total_watches: i64,
}

#[derive(sqlx::FromRow)]
struct ComfortTitleRow {
    title: String,
    count: i64,
}

const COMFORT_TITLES_LIMIT: i64 = 5;

pub(super) async fn get_rewatch_stats_impl(
    pool: &SqlitePool,
    profile_id: &str,
    window_start: &str,
    month_labels: &[String],
) -> Result<RewatchStats, ApiError> {
    let totals: RewatchTotalsRow = sqlx::query_as(
        "SELECT
           COUNT(CASE WHEN event_type = 'rewatched' THEN 1 END) AS rewatches,
           COUNT(CASE WHEN event_type IN ('watched','rewatched') THEN 1 END) AS total_watches
         FROM viewing_events WHERE profile_id = $1",
    )
    .bind(profile_id)
    .fetch_one(pool)
    .await
    .map_err(ApiError::from)?;

    let comfort_rows: Vec<ComfortTitleRow> = sqlx::query_as(
        "SELECT title, COUNT(*) AS count
         FROM viewing_events
         WHERE profile_id = $1 AND event_type = 'rewatched'
         GROUP BY media_id, media_type, title
         ORDER BY count DESC, title ASC
         LIMIT $2",
    )
    .bind(profile_id)
    .bind(COMFORT_TITLES_LIMIT)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    let monthly_rows: Vec<MonthlyActivityRow> = sqlx::query_as(
        "SELECT strftime('%Y-%m', watched_at) AS month, COUNT(*) AS count, SUM(duration_minutes) AS minutes
         FROM viewing_events
         WHERE profile_id = $1 AND event_type = 'rewatched' AND watched_at >= $2
         GROUP BY month",
    )
    .bind(profile_id)
    .bind(window_start)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    let rewatch_activity = monthly_activity::zero_fill(&monthly_rows, month_labels);

    let rewatch_share_percent = if totals.total_watches > 0 {
        ((totals.rewatches as f64 / totals.total_watches as f64) * 100.0).round() as i64
    } else {
        0
    };

    Ok(RewatchStats {
        total_rewatches: totals.rewatches,
        rewatch_share_percent,
        favourite_comfort_titles: comfort_rows
            .into_iter()
            .map(|row| ComfortTitle {
                title: row.title,
                count: row.count,
            })
            .collect(),
        rewatch_activity,
    })
}
