use std::collections::{BTreeMap, BTreeSet, HashMap};

use sqlx::SqlitePool;

use super::active_events::fetch_counted_watches;
use super::local_time::LocalClock;
use super::{RatingBucket, RatingDistribution, RatingPeriodAverage};
use crate::error::ApiError;

#[derive(sqlx::FromRow)]
struct RatingBucketRow {
    rating: f64,
    count: i64,
}

#[derive(sqlx::FromRow)]
struct UserRatingRow {
    media_id: i64,
    media_type: String,
    rating: f64,
}

pub(in crate::stats) async fn get_rating_distribution_impl(
    pool: &SqlitePool,
    profile_id: &str,
    window_start: &str,
    clock: impl Into<LocalClock>,
) -> Result<RatingDistribution, ApiError> {
    let clock = clock.into();
    let distribution = sqlx::query_as::<_, RatingBucketRow>(
        "SELECT user_rating AS rating, COUNT(*) AS count
         FROM library_items
         WHERE profile_id = $1 AND user_rating IS NOT NULL
         GROUP BY user_rating
         ORDER BY user_rating ASC",
    )
    .bind(profile_id)
    .fetch_all(pool);

    let user_ratings = sqlx::query_as::<_, UserRatingRow>(
        "SELECT media_id, media_type, user_rating AS rating
         FROM library_items
         WHERE profile_id = $1 AND user_rating IS NOT NULL",
    )
    .bind(profile_id)
    .fetch_all(pool);

    // The monthly averages read the watches inside the window, the yearly
    // ones the whole history; both only the titles currently seen (see
    // `active_events`), each in the period of its last active watch.
    let seen_titles = fetch_counted_watches(pool, profile_id, None, None);

    let (distribution, user_ratings, seen_titles) = tokio::try_join!(
        async { distribution.await.map_err(ApiError::from) },
        async { user_ratings.await.map_err(ApiError::from) },
        seen_titles
    )?;

    let rating_of: HashMap<(i64, &str), f64> = user_ratings
        .iter()
        .map(|row| ((row.media_id, row.media_type.as_str()), row.rating))
        .collect();

    // One sample per (period, title): a series watched over many episodes in
    // the same month still weighs once.
    let average_over = |periods: Vec<(String, i64, &str)>| -> Vec<RatingPeriodAverage> {
        let mut sums: BTreeMap<String, (f64, i64)> = BTreeMap::new();
        let unique: BTreeSet<(String, i64, &str)> = periods.into_iter().collect();
        for (period, media_id, media_type) in unique {
            if let Some(rating) = rating_of.get(&(media_id, media_type)) {
                let entry = sums.entry(period).or_insert((0.0, 0));
                entry.0 += rating;
                entry.1 += 1;
            }
        }
        sums.into_iter()
            .map(|(period, (sum, count))| RatingPeriodAverage {
                period,
                average: sum / count as f64,
                count,
            })
            .collect()
    };

    let mut month_samples = Vec::new();
    let mut year_samples = Vec::new();
    for event in &seen_titles {
        let month = clock.month_label(&event.watched_at)?;
        year_samples.push((
            month[..4].to_string(),
            event.media_id,
            event.media_type.as_str(),
        ));
        if event.watched_at.as_str() >= window_start {
            month_samples.push((month, event.media_id, event.media_type.as_str()));
        }
    }
    let average_by_month = average_over(month_samples);
    let average_by_year = average_over(year_samples);

    Ok(RatingDistribution {
        distribution: distribution
            .into_iter()
            .map(|row| RatingBucket {
                rating: row.rating,
                count: row.count,
            })
            .collect(),
        average_by_month,
        average_by_year,
    })
}
