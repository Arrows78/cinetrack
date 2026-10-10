use std::collections::BTreeMap;

use sqlx::SqlitePool;

use super::active_events::fetch_counted_watches;
use super::local_time::LocalClock;
use super::monthly_activity;
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

/// Headline totals and the trailing-window monthly chart, both over the
/// titles currently seen (see `active_events`): a title counts once, at the
/// date of its last active watch, and a cancelled watch counts nowhere.
pub(in crate::stats) async fn get_stats_overview_impl(
    pool: &SqlitePool,
    profile_id: &str,
    window_start: &str,
    month_labels: &[String],
    clock: impl Into<LocalClock>,
) -> Result<StatsOverview, ApiError> {
    let clock = clock.into();
    let event_totals = sqlx::query_as::<_, EventTotalsRow>(concat!(
        active_events_cte!(),
        " SELECT
           COUNT(CASE WHEN media_type = 'movie' THEN 1 END) AS movies_watched,
           COUNT(CASE WHEN episode_id IS NOT NULL THEN 1 END) AS episodes_watched,
           SUM(duration_minutes) AS minutes_watched,
           SUM(CASE WHEN media_type = 'movie' THEN duration_minutes ELSE 0 END) AS movie_minutes_watched,
           SUM(CASE WHEN episode_id IS NOT NULL THEN duration_minutes ELSE 0 END) AS episode_minutes_watched
         FROM counted WHERE rk = 1"
    ))
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

    let window_events = fetch_counted_watches(pool, profile_id, Some(window_start), None);

    // These reads are independent and read-only. Let the SQLite pool service
    // them concurrently instead of paying their wall-clock latencies serially.
    let (event_totals, library_totals, window_events) = tokio::try_join!(
        async { event_totals.await.map_err(ApiError::from) },
        async { library_totals.await.map_err(ApiError::from) },
        window_events
    )?;

    let monthly_rows = monthly_activity::bucket_by_local_month(&window_events, &clock)?;
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

/// One bucket per local calendar year with at least one seen title, oldest
/// first; each seen title is counted once, in the year of its last active
/// watch.
pub(in crate::stats) async fn list_yearly_activity_impl(
    pool: &SqlitePool,
    profile_id: &str,
    clock: impl Into<LocalClock>,
) -> Result<Vec<YearlyActivityBucket>, ApiError> {
    let clock = clock.into();
    let events = fetch_counted_watches(pool, profile_id, None, None).await?;

    let mut by_year: BTreeMap<i64, YearlyActivityBucket> = BTreeMap::new();
    for event in &events {
        let year = i64::from(chrono::Datelike::year(&clock.day(&event.watched_at)?));
        let bucket = by_year.entry(year).or_insert(YearlyActivityBucket {
            year,
            movies_watched: 0,
            episodes_watched: 0,
            minutes_watched: 0,
        });
        if event.media_type == "movie" {
            bucket.movies_watched += 1;
        }
        if event.episode_id.is_some() {
            bucket.episodes_watched += 1;
        }
        bucket.minutes_watched += event.duration_minutes.unwrap_or(0);
    }

    Ok(by_year.into_values().collect())
}
