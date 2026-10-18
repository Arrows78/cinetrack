#[cfg(test)]
use sqlx::SqlitePool;

mod commands;
#[cfg(test)]
mod consistency_tests;
#[cfg(test)]
mod current_state_tests;
mod models;
#[cfg(test)]
mod performance;
mod queries;
mod repository;
mod service;
#[cfg(test)]
mod time_zone_tests;

pub use commands::{
    get_activity_stats, get_library_extras, get_monthly_recap, get_rating_distribution,
    get_rewatch_stats, get_stats_overview, get_watch_forecast, get_watch_milestones,
    get_year_favourite_genre, list_on_this_day_events, list_recent_viewing_events,
    list_viewing_events_for_media, list_viewing_events_for_year, list_yearly_activity,
};
use models::{
    ActivityStats, LibraryExtras, MonthlyRecap, RatingDistribution, RewatchStats, StatsOverview,
    WatchForecast, WatchMilestone, YearlyActivityBucket,
};
pub(crate) use queries::{ViewingEvent, ViewingEventNote, ViewingEventType};

use queries::{
    activity, forecast, library_extras, milestones, overview, ratings, recap, rewatch,
    viewing_events, year_favourite_genre,
};

#[cfg(test)]
use activity::get_activity_stats_impl;
#[cfg(test)]
use forecast::get_watch_forecast_impl;
#[cfg(test)]
use library_extras::get_library_extras_impl;
#[cfg(test)]
use milestones::get_watch_milestones_impl;
#[cfg(test)]
use overview::{get_stats_overview_impl, list_yearly_activity_impl};
#[cfg(test)]
use ratings::get_rating_distribution_impl;
#[cfg(test)]
use recap::get_monthly_recap_impl;
#[cfg(test)]
use rewatch::get_rewatch_stats_impl;
#[cfg(test)]
use viewing_events::ViewingEventRow;
#[cfg(test)]
use viewing_events::{
    list_on_this_day_events_impl, list_viewing_events_for_media_impl,
    list_viewing_events_for_year_impl, list_viewing_events_since_impl,
};

#[cfg(test)]
mod edge_tests;

/// What the statistics currently count as seen — one `(media type, media id,
/// episode id)` per seen movie or episode — for the tests that compare it
/// with the progress tables.
#[cfg(test)]
pub(crate) async fn counted_seen_keys(
    pool: &SqlitePool,
    profile_id: &str,
) -> Vec<(String, i64, Option<i64>)> {
    let mut keys: Vec<_> =
        list_viewing_events_since_impl(pool, profile_id, "0000-01-01T00:00:00.000Z")
            .await
            .unwrap()
            .into_iter()
            .map(|event| {
                (
                    event.media_type.as_db_str().to_string(),
                    event.media_id,
                    event.episode_id,
                )
            })
            .collect();
    keys.sort();
    keys
}

#[cfg(test)]
mod tests;
