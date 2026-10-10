use std::collections::{HashMap, HashSet};

use sqlx::SqlitePool;

use super::active_events::fetch_counted_watches;
use super::local_time::LocalClock;
use super::{BiggestBingeDay, MonthlyRecap, TitleRating};
use crate::error::ApiError;

#[derive(sqlx::FromRow)]
struct LibraryRecapRow {
    media_id: i64,
    media_type: String,
    title: String,
    genres: String,
    user_rating: Option<f64>,
}

/// The recap of one local calendar month (`month` = `YYYY-MM`): the titles
/// currently seen whose last active watch falls in that month, in the
/// viewer's local time — so its figures add up to the monthly chart's bucket
/// for the same month and a watch cancelled later is not in it.
///
/// `range_start`/`range_end` (the client's local month bounds, as ISO
/// instants, end exclusive) only narrow the rows read; the month a watch
/// belongs to is decided here from the local calendar.
pub(in crate::stats) async fn get_monthly_recap_impl(
    pool: &SqlitePool,
    profile_id: &str,
    month: &str,
    range_start: &str,
    range_end: &str,
    clock: impl Into<LocalClock>,
) -> Result<MonthlyRecap, ApiError> {
    let clock = clock.into();

    // A local month is at most a day wider than the same UTC range on each
    // side for any real offset, so widen the read by two days and let the
    // local-month filter below decide.
    let from = shift_days(range_start, -2)?;
    let until = shift_days(range_end, 2)?;
    let candidates = fetch_counted_watches(pool, profile_id, Some(&from), Some(&until)).await?;

    let mut events = Vec::new();
    for event in candidates {
        if clock.month_label(&event.watched_at)? == month {
            events.push(event);
        }
    }

    let movies_watched = events
        .iter()
        .filter(|row| row.media_type == "movie")
        .count() as i64;
    let episodes_watched = events.iter().filter(|row| row.episode_id.is_some()).count() as i64;
    let minutes_watched: i64 = events.iter().filter_map(|row| row.duration_minutes).sum();

    // The viewer's local day, like get_activity_stats_impl: a UTC day splits
    // an evening session in two, and the month's first local day could read
    // as the previous month's last. Ties go to the more recent day.
    let mut per_day: HashMap<chrono::NaiveDate, i64> = HashMap::new();
    for event in &events {
        *per_day.entry(clock.day(&event.watched_at)?).or_insert(0) += 1;
    }
    let biggest_binge_day = per_day
        .iter()
        .max_by(|a, b| a.1.cmp(b.1).then_with(|| a.0.cmp(b.0)))
        .map(|(day, count)| BiggestBingeDay {
            day: day.format("%Y-%m-%d").to_string(),
            count: *count,
        });

    let watched_titles: HashSet<(i64, &str)> = events
        .iter()
        .map(|row| (row.media_id, row.media_type.as_str()))
        .collect();

    let library_rows: Vec<LibraryRecapRow> = sqlx::query_as(
        "SELECT media_id, media_type, title, genres, user_rating
         FROM library_items WHERE profile_id = $1",
    )
    .bind(profile_id)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;
    let watched_library: Vec<&LibraryRecapRow> = library_rows
        .iter()
        .filter(|row| watched_titles.contains(&(row.media_id, row.media_type.as_str())))
        .collect();

    // Highest rating first, then alphabetical.
    let top_rated = watched_library
        .iter()
        .filter_map(|row| row.user_rating.map(|rating| (row, rating)))
        .min_by(|a, b| {
            b.1.partial_cmp(&a.1)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.0.title.cmp(&b.0.title))
        });

    let mut genre_counts: HashMap<String, i64> = HashMap::new();
    for row in &watched_library {
        let genres: Vec<String> = serde_json::from_str(&row.genres).unwrap_or_default();
        for genre in genres {
            *genre_counts.entry(genre).or_insert(0) += 1;
        }
    }
    let favourite_genre = genre_counts
        .into_iter()
        .max_by(|a, b| a.1.cmp(&b.1).then_with(|| b.0.cmp(&a.0)))
        .map(|(genre, _)| genre);

    Ok(MonthlyRecap {
        month: month.to_string(),
        movies_watched,
        episodes_watched,
        minutes_watched,
        top_rated_title: top_rated.map(|(row, rating)| TitleRating {
            title: row.title.clone(),
            rating,
        }),
        favourite_genre,
        biggest_binge_day,
    })
}

fn shift_days(instant: &str, days: i64) -> Result<String, ApiError> {
    use super::local_time::parse_instant;
    Ok((parse_instant(instant)? + chrono::Duration::days(days))
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
}
