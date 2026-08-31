use sqlx::SqlitePool;

use super::monthly_activity::{self, MonthlyActivityRow};
use super::{StatsOverview, StatsTotals, YearlyActivityBucket};
use crate::error::ApiError;

#[derive(sqlx::FromRow)]
struct EventTotalsRow {
    movies_watched: i64,
    episodes_watched: i64,
    minutes_watched: Option<i64>,
    movie_minutes_watched: Option<i64>,
    episode_minutes_watched: Option<i64>,
}

#[derive(sqlx::FromRow)]
struct LibraryTotalsRow {
    total: i64,
    completed: i64,
    completed_series: i64,
}

pub(in crate::stats) async fn get_stats_overview_impl(
    pool: &SqlitePool,
    profile_id: &str,
    window_start: &str,
    month_labels: &[String],
) -> Result<StatsOverview, ApiError> {
    let event_totals = sqlx::query_as::<_, EventTotalsRow>(
        "WITH latest_events AS (
           SELECT media_type, episode_id, event_type, duration_minutes,
                  ROW_NUMBER() OVER (
                    PARTITION BY media_id, media_type, episode_id
                    ORDER BY watched_at DESC, created_at DESC
                  ) AS rn
           FROM viewing_events WHERE profile_id = $1
         )
         SELECT
           COUNT(CASE WHEN rn = 1 AND event_type IN ('watched','rewatched') AND media_type = 'movie' THEN 1 END) AS movies_watched,
           COUNT(CASE WHEN rn = 1 AND event_type IN ('watched','rewatched') AND episode_id IS NOT NULL THEN 1 END) AS episodes_watched,
           SUM(CASE WHEN rn = 1 AND event_type IN ('watched','rewatched') THEN duration_minutes ELSE 0 END) AS minutes_watched,
           SUM(CASE WHEN rn = 1 AND event_type IN ('watched','rewatched') AND media_type = 'movie' THEN duration_minutes ELSE 0 END) AS movie_minutes_watched,
           SUM(CASE WHEN rn = 1 AND event_type IN ('watched','rewatched') AND episode_id IS NOT NULL THEN duration_minutes ELSE 0 END) AS episode_minutes_watched
         FROM latest_events",
    )
    .bind(profile_id)
    .fetch_one(pool);

    let library_totals = sqlx::query_as::<_, LibraryTotalsRow>(
        "SELECT
           COUNT(*) AS total,
           COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed,
           COUNT(CASE WHEN media_type = 'series' AND status = 'completed' THEN 1 END) AS completed_series
         FROM library_items WHERE profile_id = $1",
    )
    .bind(profile_id)
    .fetch_one(pool);

    let monthly_rows = sqlx::query_as::<_, MonthlyActivityRow>(
        "SELECT strftime('%Y-%m', watched_at) AS month, COUNT(*) AS count, SUM(duration_minutes) AS minutes
         FROM viewing_events
         WHERE profile_id = $1 AND event_type IN ('watched','rewatched') AND watched_at >= $2
         GROUP BY month",
    )
    .bind(profile_id)
    .bind(window_start)
    .fetch_all(pool);

    // These reads are independent and read-only. Let the SQLite pool service
    // them concurrently instead of paying their wall-clock latencies serially.
    let (event_totals, library_totals, monthly_rows) =
        tokio::try_join!(event_totals, library_totals, monthly_rows).map_err(ApiError::from)?;

    let monthly_activity = monthly_activity::zero_fill(&monthly_rows, month_labels);

    let library_completion_percent = if library_totals.total > 0 {
        ((library_totals.completed as f64 / library_totals.total as f64) * 100.0).round() as i64
    } else {
        0
    };

    Ok(StatsOverview {
        totals: StatsTotals {
            movies_watched: event_totals.movies_watched,
            episodes_watched: event_totals.episodes_watched,
            minutes_watched: event_totals.minutes_watched.unwrap_or(0),
            movie_minutes_watched: event_totals.movie_minutes_watched.unwrap_or(0),
            episode_minutes_watched: event_totals.episode_minutes_watched.unwrap_or(0),
            completed_series: library_totals.completed_series,
            library_completion_percent,
        },
        monthly_activity,
    })
}

#[derive(sqlx::FromRow)]
struct YearlyActivityRow {
    year: i64,
    movies_watched: i64,
    episodes_watched: i64,
    minutes_watched: Option<i64>,
}

impl From<YearlyActivityRow> for YearlyActivityBucket {
    fn from(row: YearlyActivityRow) -> Self {
        Self {
            year: row.year,
            movies_watched: row.movies_watched,
            episodes_watched: row.episodes_watched,
            minutes_watched: row.minutes_watched.unwrap_or(0),
        }
    }
}

pub(in crate::stats) async fn list_yearly_activity_impl(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<Vec<YearlyActivityBucket>, ApiError> {
    let rows: Vec<YearlyActivityRow> = sqlx::query_as(
        "SELECT
           CAST(strftime('%Y', watched_at) AS INTEGER) AS year,
           COUNT(CASE WHEN event_type IN ('watched','rewatched') AND media_type = 'movie' THEN 1 END) AS movies_watched,
           COUNT(CASE WHEN event_type IN ('watched','rewatched') AND episode_id IS NOT NULL THEN 1 END) AS episodes_watched,
           SUM(CASE WHEN event_type IN ('watched','rewatched') THEN duration_minutes ELSE 0 END) AS minutes_watched
         FROM viewing_events
         WHERE profile_id = $1 AND event_type IN ('watched','rewatched')
         GROUP BY year
         ORDER BY year ASC",
    )
    .bind(profile_id)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    Ok(rows.into_iter().map(Into::into).collect())
}
