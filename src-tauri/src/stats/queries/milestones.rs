use sqlx::SqlitePool;

use super::{MilestoneCategory, WatchMilestone};
use crate::error::ApiError;

const EPISODE_THRESHOLDS: [i64; 4] = [100, 500, 1000, 2500];
const MOVIE_THRESHOLDS: [i64; 4] = [50, 100, 250, 500];
const HOUR_THRESHOLDS: [i64; 5] = [10, 50, 100, 500, 1000];
const SERIES_THRESHOLDS: [i64; 4] = [10, 25, 50, 100];

#[derive(sqlx::FromRow)]
struct CurrentEventRow {
    media_type: String,
    episode_id: Option<i64>,
    watched_at: String,
    duration_minutes: Option<i64>,
}

async fn fetch_current_watch_events(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<Vec<CurrentEventRow>, ApiError> {
    sqlx::query_as(
        "WITH latest_events AS (
           SELECT media_type, episode_id, event_type, watched_at, duration_minutes,
                  ROW_NUMBER() OVER (
                    PARTITION BY media_id, media_type, episode_id
                    ORDER BY watched_at DESC, created_at DESC
                  ) AS rn
           FROM viewing_events WHERE profile_id = $1
         )
         SELECT media_type, episode_id, watched_at, duration_minutes
         FROM latest_events
         WHERE rn = 1 AND event_type IN ('watched','rewatched')
         ORDER BY watched_at ASC",
    )
    .bind(profile_id)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)
}

fn milestones_from_dates(
    category: MilestoneCategory,
    prefix: &str,
    ordered_dates: &[String],
    total: i64,
    thresholds: &[i64],
) -> Vec<WatchMilestone> {
    thresholds
        .iter()
        .map(|&threshold| {
            let achieved = total >= threshold;
            let achieved_at = if achieved {
                ordered_dates.get((threshold - 1) as usize).cloned()
            } else {
                None
            };
            WatchMilestone {
                id: format!("{prefix}-{threshold}"),
                category,
                threshold,
                current_value: total,
                achieved,
                achieved_at,
            }
        })
        .collect()
}

fn milestones_for_hours(events: &[CurrentEventRow], thresholds: &[i64]) -> Vec<WatchMilestone> {
    let total_minutes: i64 = events.iter().filter_map(|row| row.duration_minutes).sum();
    let current_hours = total_minutes / 60;

    let mut crossing_at: std::collections::HashMap<i64, String> = std::collections::HashMap::new();
    let mut cumulative_minutes = 0i64;
    for row in events {
        cumulative_minutes += row.duration_minutes.unwrap_or(0);
        for &threshold in thresholds {
            if !crossing_at.contains_key(&threshold) && cumulative_minutes >= threshold * 60 {
                crossing_at.insert(threshold, row.watched_at.clone());
            }
        }
    }

    thresholds
        .iter()
        .map(|&threshold| {
            let achieved = current_hours >= threshold;
            WatchMilestone {
                id: format!("hours-{threshold}"),
                category: MilestoneCategory::Hours,
                threshold,
                current_value: current_hours,
                achieved,
                achieved_at: if achieved {
                    crossing_at.get(&threshold).cloned()
                } else {
                    None
                },
            }
        })
        .collect()
}

pub(in crate::stats) async fn get_watch_milestones_impl(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<Vec<WatchMilestone>, ApiError> {
    let events = fetch_current_watch_events(pool, profile_id).await?;

    let episode_dates: Vec<String> = events
        .iter()
        .filter(|row| row.episode_id.is_some())
        .map(|row| row.watched_at.clone())
        .collect();
    let movie_dates: Vec<String> = events
        .iter()
        .filter(|row| row.media_type == "movie")
        .map(|row| row.watched_at.clone())
        .collect();

    let completed_series_total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM library_items
         WHERE profile_id = $1 AND media_type = 'series' AND status = 'completed'",
    )
    .bind(profile_id)
    .fetch_one(pool)
    .await
    .map_err(ApiError::from)?;

    let completed_series_dates: Vec<String> = sqlx::query_scalar(
        "SELECT completed_at FROM library_items
         WHERE profile_id = $1 AND media_type = 'series' AND status = 'completed' AND completed_at IS NOT NULL
         ORDER BY completed_at ASC",
    )
    .bind(profile_id)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    let mut milestones = Vec::new();
    milestones.extend(milestones_from_dates(
        MilestoneCategory::Episodes,
        "episodes",
        &episode_dates,
        episode_dates.len() as i64,
        &EPISODE_THRESHOLDS,
    ));
    milestones.extend(milestones_from_dates(
        MilestoneCategory::Movies,
        "movies",
        &movie_dates,
        movie_dates.len() as i64,
        &MOVIE_THRESHOLDS,
    ));
    milestones.extend(milestones_for_hours(&events, &HOUR_THRESHOLDS));
    milestones.extend(milestones_from_dates(
        MilestoneCategory::Series,
        "series",
        &completed_series_dates,
        completed_series_total,
        &SERIES_THRESHOLDS,
    ));

    Ok(milestones)
}
