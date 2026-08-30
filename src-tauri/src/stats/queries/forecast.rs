use chrono::{DateTime, Duration, SecondsFormat, Utc};
use sqlx::SqlitePool;

use super::WatchForecast;
use crate::error::ApiError;

const FALLBACK_EPISODE_MINUTES: f64 = 40.0;
const PACE_WINDOW_DAYS: f64 = 60.0;

#[derive(sqlx::FromRow)]
struct BacklogRow {
    backlog_episodes: i64,
}

#[derive(sqlx::FromRow)]
struct RuntimeRow {
    duration_minutes: i64,
}

pub(in crate::stats) async fn get_watch_forecast_impl(
    pool: &SqlitePool,
    profile_id: &str,
    since: &str,
    pace_window_start: &str,
    now: &str,
) -> Result<WatchForecast, ApiError> {
    // COALESCE(watched.count, 0) before subtracting, not after: a series
    // with zero watched episodes has no row in the `watched` subquery at
    // all (LEFT JOIN produces NULL), and `total_episodes - NULL` is itself
    // NULL — which the outer MAX(..., 0) would then just discard as "the
    // NULL argument is ignored", silently treating that series as having no
    // backlog instead of a full one.
    let backlog_row: BacklogRow = sqlx::query_as(
        "SELECT COALESCE(SUM(MAX(ts.total_episodes - COALESCE(watched.count, 0), 0)), 0) AS backlog_episodes
         FROM tracked_series ts
         LEFT JOIN (
           SELECT series_id, COUNT(*) AS count
           FROM episode_progress
           WHERE profile_id = $1 AND watched = 1
           GROUP BY series_id
         ) watched ON watched.series_id = ts.series_id
         WHERE ts.profile_id = $1",
    )
    .bind(profile_id)
    .fetch_one(pool)
    .await
    .map_err(ApiError::from)?;
    let backlog_episodes = backlog_row.backlog_episodes;

    // Average runtime is drawn from the same bounded recent-events window as
    // activity stats (`since`, ~400 days) — not further restricted to the
    // 60-day pace window below, matching the pre-migration TS behavior.
    let runtime_rows: Vec<RuntimeRow> = sqlx::query_as(
        "SELECT duration_minutes
         FROM viewing_events
         WHERE profile_id = $1 AND event_type IN ('watched','rewatched')
           AND episode_id IS NOT NULL AND watched_at >= $2
           AND duration_minutes IS NOT NULL AND duration_minutes > 0",
    )
    .bind(profile_id)
    .bind(since)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    let average_episode_minutes = if runtime_rows.is_empty() {
        FALLBACK_EPISODE_MINUTES
    } else {
        runtime_rows
            .iter()
            .map(|row| row.duration_minutes)
            .sum::<i64>() as f64
            / runtime_rows.len() as f64
    };

    let recent_count_row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*)
         FROM viewing_events
         WHERE profile_id = $1 AND event_type IN ('watched','rewatched')
           AND episode_id IS NOT NULL AND watched_at >= $2",
    )
    .bind(profile_id)
    .bind(pace_window_start)
    .fetch_one(pool)
    .await
    .map_err(ApiError::from)?;
    let recent_count = recent_count_row.0;

    let episodes_per_week = recent_count as f64 / (PACE_WINDOW_DAYS / 7.0);

    let catch_up_date = if backlog_episodes > 0 && episodes_per_week > 0.0 {
        let now_dt: DateTime<Utc> = now.parse().map_err(|error| {
            ApiError::internal(format!("Malformed 'now' instant '{now}': {error}"))
        })?;
        let days_to_catch_up = ((backlog_episodes as f64 / episodes_per_week) * 7.0).ceil() as i64;
        // Matches JS's `toISOString()` exactly (millisecond precision, "Z"
        // suffix) — the plain `to_rfc3339()` default uses "+00:00" and a
        // variable-precision fractional second instead.
        Some(
            (now_dt + Duration::days(days_to_catch_up))
                .to_rfc3339_opts(SecondsFormat::Millis, true),
        )
    } else {
        None
    };

    Ok(WatchForecast {
        backlog_episodes,
        backlog_minutes: (backlog_episodes as f64 * average_episode_minutes).round() as i64,
        episodes_per_week: (episodes_per_week * 10.0).round() / 10.0,
        catch_up_date,
    })
}
