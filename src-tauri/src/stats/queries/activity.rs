use std::collections::{BTreeSet, HashMap};

use chrono::{Datelike, Duration, NaiveDate, Timelike};
use sqlx::SqlitePool;

use super::active_events::fetch_counted_watches;
use super::local_time::LocalClock;
use super::{ActivityStats, BiggestBingeDay, HeatmapBucket};
use crate::error::ApiError;

// Everything here is bucketed in the viewer's local time (see `local_time`):
// streaks, the binge day and the heatmap read as "days" and "hours you
// experienced", not UTC ones — a heatmap in UTC hours would misrepresent
// anyone outside UTC. Only the titles currently seen count, each at its last
// active watch (see `active_events`).

/// Runs of consecutive days in an ascending, de-duplicated day list, as
/// `(last day of the run, run length)`, oldest run first.
fn day_runs(days: &BTreeSet<NaiveDate>) -> Vec<(NaiveDate, i64)> {
    let mut runs: Vec<(NaiveDate, i64)> = Vec::new();
    for &day in days {
        match runs.last_mut() {
            Some((last, length)) if *last + Duration::days(1) == day => {
                *last = day;
                *length += 1;
            }
            _ => runs.push((day, 1)),
        }
    }
    runs
}

pub(in crate::stats) async fn get_activity_stats_impl(
    pool: &SqlitePool,
    profile_id: &str,
    since: &str,
    today: &str,
    clock: impl Into<LocalClock>,
) -> Result<ActivityStats, ApiError> {
    let clock = clock.into();
    let events = fetch_counted_watches(pool, profile_id, Some(since), None).await?;

    let mut days: BTreeSet<NaiveDate> = BTreeSet::new();
    let mut per_day: HashMap<NaiveDate, i64> = HashMap::new();
    let mut heat: HashMap<(i64, i64), i64> = HashMap::new();
    for event in &events {
        let local = clock.local(&event.watched_at)?;
        let day = local.date();
        days.insert(day);
        *per_day.entry(day).or_insert(0) += 1;
        *heat
            .entry((
                i64::from(day.weekday().num_days_from_sunday()),
                i64::from(local.hour()),
            ))
            .or_insert(0) += 1;
    }

    let runs = day_runs(&days);
    let longest_streak_days = runs.iter().map(|(_, length)| *length).max().unwrap_or(0);

    let local_today = clock.day(today)?;
    let local_yesterday = local_today - Duration::days(1);

    // A streak still "counts" if the most recent watched day is today or
    // yesterday (local time) — it only breaks once a full day passes with
    // no watch, not the instant a new day starts before today's first watch.
    let current_streak_days = runs
        .last()
        .filter(|(end, _)| *end == local_today || *end == local_yesterday)
        .map(|(_, length)| *length)
        .unwrap_or(0);

    // Most watches in one local day; on a tie the more recent day.
    let biggest_binge_day = per_day
        .iter()
        .max_by(|a, b| a.1.cmp(b.1).then_with(|| a.0.cmp(b.0)))
        .map(|(day, count)| BiggestBingeDay {
            day: day.format("%Y-%m-%d").to_string(),
            count: *count,
        });

    let mut heatmap = Vec::with_capacity(7 * 24);
    for day in 0..7 {
        for hour in 0..24 {
            heatmap.push(HeatmapBucket {
                day,
                hour,
                count: heat.get(&(day, hour)).copied().unwrap_or(0),
            });
        }
    }

    Ok(ActivityStats {
        current_streak_days,
        longest_streak_days,
        biggest_binge_day,
        heatmap,
    })
}
