use sqlx::SqlitePool;

use super::{BiggestBingeDay, MonthlyRecap, TitleRating};
use crate::error::ApiError;

#[derive(sqlx::FromRow)]
struct MonthEventRow {
    media_type: String,
    episode_id: Option<i64>,
    duration_minutes: Option<i64>,
}

#[derive(sqlx::FromRow)]
struct BingeDayRow {
    day: String,
    count: i64,
}

#[derive(sqlx::FromRow)]
struct TitleRatingRow {
    title: String,
    rating: f64,
}

#[derive(sqlx::FromRow)]
struct GenresRow {
    genres: String,
}

pub(super) async fn get_monthly_recap_impl(
    pool: &SqlitePool,
    profile_id: &str,
    month: &str,
    range_start: &str,
    range_end: &str,
) -> Result<MonthlyRecap, ApiError> {
    let events: Vec<MonthEventRow> = sqlx::query_as(
        "SELECT media_type, episode_id, duration_minutes
         FROM viewing_events
         WHERE profile_id = $1 AND event_type IN ('watched','rewatched')
           AND watched_at >= $2 AND watched_at < $3",
    )
    .bind(profile_id)
    .bind(range_start)
    .bind(range_end)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    let movies_watched = events.iter().filter(|row| row.media_type == "movie").count() as i64;
    let episodes_watched = events.iter().filter(|row| row.episode_id.is_some()).count() as i64;
    let minutes_watched: i64 = events.iter().filter_map(|row| row.duration_minutes).sum();

    let binge_row: Option<BingeDayRow> = sqlx::query_as(
        "SELECT strftime('%Y-%m-%d', watched_at) AS day, COUNT(*) AS count
         FROM viewing_events
         WHERE profile_id = $1 AND event_type IN ('watched','rewatched')
           AND watched_at >= $2 AND watched_at < $3
         GROUP BY day
         ORDER BY count DESC, day DESC
         LIMIT 1",
    )
    .bind(profile_id)
    .bind(range_start)
    .bind(range_end)
    .fetch_optional(pool)
    .await
    .map_err(ApiError::from)?;

    let top_rated: Option<TitleRatingRow> = sqlx::query_as(
        "SELECT li.title AS title, li.user_rating AS rating
         FROM library_items li
         WHERE li.profile_id = $1 AND li.user_rating IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM viewing_events ve
             WHERE ve.profile_id = li.profile_id AND ve.media_id = li.media_id AND ve.media_type = li.media_type
               AND ve.event_type IN ('watched','rewatched')
               AND ve.watched_at >= $2 AND ve.watched_at < $3
           )
         ORDER BY li.user_rating DESC, li.title ASC
         LIMIT 1",
    )
    .bind(profile_id)
    .bind(range_start)
    .bind(range_end)
    .fetch_optional(pool)
    .await
    .map_err(ApiError::from)?;

    let genre_rows: Vec<GenresRow> = sqlx::query_as(
        "SELECT li.genres AS genres
         FROM library_items li
         WHERE li.profile_id = $1
           AND EXISTS (
             SELECT 1 FROM viewing_events ve
             WHERE ve.profile_id = li.profile_id AND ve.media_id = li.media_id AND ve.media_type = li.media_type
               AND ve.event_type IN ('watched','rewatched')
               AND ve.watched_at >= $2 AND ve.watched_at < $3
           )",
    )
    .bind(profile_id)
    .bind(range_start)
    .bind(range_end)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    let mut genre_counts: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    for row in &genre_rows {
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
        top_rated_title: top_rated.map(|row| TitleRating { title: row.title, rating: row.rating }),
        favourite_genre,
        biggest_binge_day: binge_row.map(|row| BiggestBingeDay { day: row.day, count: row.count }),
    })
}
