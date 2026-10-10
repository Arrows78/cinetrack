use std::collections::HashMap;

use sqlx::SqlitePool;

use super::active_events::{fetch_active_rewatches, fetch_counted_watches};
use super::local_time::LocalClock;
use super::monthly_activity;
use super::{ComfortTitle, RewatchStats};
use crate::error::ApiError;

const COMFORT_TITLES_LIMIT: usize = 5;

/// Rewatch statistics, over the `rewatched` events the app writes when the
/// viewer explicitly watches an already-seen title again or raises a
/// title's rewatch count in the library editor. Same current-state rule as
/// every other statistic (see `active_events`): a rewatch cancelled by a
/// later unwatch of its title is not counted.
///
/// The share is rewatches over every standing viewing — the titles currently
/// seen (one first watch each) plus the rewatches.
pub(in crate::stats) async fn get_rewatch_stats_impl(
    pool: &SqlitePool,
    profile_id: &str,
    window_start: &str,
    month_labels: &[String],
    clock: impl Into<LocalClock>,
) -> Result<RewatchStats, ApiError> {
    let clock = clock.into();
    let (rewatches, first_watches) = tokio::try_join!(
        fetch_active_rewatches(pool, profile_id),
        fetch_counted_watches(pool, profile_id, None, None),
    )?;

    let total_rewatches = rewatches.len() as i64;
    let total_watches = first_watches.len() as i64 + total_rewatches;

    // Per title: how many standing rewatches; most first, then alphabetical.
    let mut per_title: HashMap<(i64, &str), (&str, i64)> = HashMap::new();
    for event in &rewatches {
        per_title
            .entry((event.media_id, event.media_type.as_str()))
            .or_insert((event.title.as_str(), 0))
            .1 += 1;
    }
    let mut comfort: Vec<(&str, i64)> = per_title.into_values().collect();
    comfort.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(b.0)));
    comfort.truncate(COMFORT_TITLES_LIMIT);

    let windowed = rewatches
        .iter()
        .filter(|event| event.watched_at.as_str() >= window_start);
    let monthly_rows = monthly_activity::bucket_by_local_month(windowed, &clock)?;
    let rewatch_activity = monthly_activity::zero_fill(&monthly_rows, month_labels);

    let rewatch_share_percent = if total_watches > 0 {
        ((total_rewatches as f64 / total_watches as f64) * 100.0).round() as i64
    } else {
        0
    };

    Ok(RewatchStats {
        total_rewatches,
        rewatch_share_percent,
        favourite_comfort_titles: comfort
            .into_iter()
            .map(|(title, count)| ComfortTitle {
                title: title.to_string(),
                count,
            })
            .collect(),
        rewatch_activity,
    })
}
