use std::collections::HashMap;

use sqlx::SqlitePool;

use super::{FavouriteGenre, LibraryExtras, RewatchedTitle};
use crate::error::ApiError;

#[derive(sqlx::FromRow)]
struct LibraryExtrasRow {
    genres: String,
    user_rating: Option<f64>,
    title: String,
    rewatch_count: i64,
}

pub(in crate::stats) async fn get_library_extras_impl(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<LibraryExtras, ApiError> {
    // ORDER BY makes row iteration below deterministic (a bare SELECT's row
    // order is otherwise unspecified) — matters for most_rewatched_title's
    // tie-break, which keeps whichever row it sees first on an exact count
    // tie.
    let rows: Vec<LibraryExtrasRow> = sqlx::query_as(
        "SELECT genres, user_rating, title, rewatch_count FROM library_items WHERE profile_id = $1 ORDER BY title ASC",
    )
    .bind(profile_id)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    let mut genre_counts: HashMap<String, i64> = HashMap::new();
    // Sum + count per genre from rated items only, so an unrated item can't
    // silently drag a genre's average down to a misleading number.
    let mut genre_rating_sums: HashMap<String, (f64, i64)> = HashMap::new();
    let mut ratings: Vec<f64> = Vec::new();
    let mut most_rewatched: Option<RewatchedTitle> = None;

    for row in &rows {
        let genres: Vec<String> = serde_json::from_str(&row.genres).unwrap_or_default();
        for genre in &genres {
            *genre_counts.entry(genre.clone()).or_insert(0) += 1;
        }
        if let Some(rating) = row.user_rating {
            ratings.push(rating);
            for genre in &genres {
                let entry = genre_rating_sums.entry(genre.clone()).or_insert((0.0, 0));
                entry.0 += rating;
                entry.1 += 1;
            }
        }
        if row.rewatch_count > 0
            && most_rewatched
                .as_ref()
                .is_none_or(|current| row.rewatch_count > current.count)
        {
            most_rewatched = Some(RewatchedTitle {
                title: row.title.clone(),
                count: row.rewatch_count,
            });
        }
    }

    let mut favourite_genres: Vec<FavouriteGenre> = genre_counts
        .into_iter()
        .map(|(name, count)| FavouriteGenre { name, count })
        .collect();
    favourite_genres.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));
    favourite_genres.truncate(8);

    // HashMap iteration order isn't guaranteed, so an exact-average tie
    // needs an explicit deterministic tie-break (alphabetical) rather than
    // whatever order max_by happens to see first.
    let mut genre_averages: Vec<(String, f64)> = genre_rating_sums
        .into_iter()
        .map(|(genre, (sum, count))| (genre, sum / count as f64))
        .collect();
    genre_averages.sort_by(|a, b| {
        b.1.partial_cmp(&a.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.0.cmp(&b.0))
    });
    let favourite_genre_by_rating = genre_averages.into_iter().next().map(|(genre, _)| genre);

    let average_user_rating = if ratings.is_empty() {
        None
    } else {
        Some(ratings.iter().sum::<f64>() / ratings.len() as f64)
    };

    Ok(LibraryExtras {
        favourite_genres,
        average_user_rating,
        favourite_genre_by_rating,
        most_rewatched_title: most_rewatched,
    })
}
