//! Boundaries the happy-path stats tests skip: an empty profile, missing
//! runtimes and ratings, malformed genre JSON, a streak across a leap day or
//! a new year, and a local midnight that falls on the other side of UTC.

use sqlx::SqlitePool;
use sqlx::sqlite::SqlitePoolOptions;

use super::{
    get_activity_stats_impl, get_library_extras_impl, get_monthly_recap_impl,
    get_rating_distribution_impl, get_rewatch_stats_impl, get_stats_overview_impl,
    get_watch_forecast_impl, get_watch_milestones_impl, list_yearly_activity_impl,
};

async fn migrated_pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(2)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    crate::database::migrations::run_migrations(&pool)
        .await
        .unwrap();
    pool
}

const SINCE: &str = "2020-01-01T00:00:00.000Z";

/// One watched movie, one event per call, a distinct title each time.
async fn watch(pool: &SqlitePool, media_id: i64, at: &str, minutes: Option<i64>) {
    sqlx::query(
        "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, created_at)
         VALUES ($1, 'default', $2, 'movie', 'Movie', 'watched', $3, $4, $3)",
    )
    .bind(format!("ev-{media_id}-{at}"))
    .bind(media_id)
    .bind(at)
    .bind(minutes)
    .execute(pool)
    .await
    .unwrap();
}

async fn streaks(pool: &SqlitePool, today: &str, tz_offset_minutes: i64) -> (i64, i64) {
    let stats = get_activity_stats_impl(pool, "default", SINCE, today, tz_offset_minutes)
        .await
        .unwrap();
    (stats.current_streak_days, stats.longest_streak_days)
}

#[tokio::test]
async fn an_empty_profile_yields_zeroes_everywhere_without_an_error() {
    let pool = migrated_pool().await;
    let labels = vec!["2026-01".to_string()];

    let overview = get_stats_overview_impl(&pool, "default", SINCE, &labels, 0)
        .await
        .unwrap();
    assert_eq!(overview.totals.movies_watched, 0);
    assert_eq!(overview.totals.minutes_watched, 0);
    assert_eq!(overview.totals.library_completion_percent, 0);
    assert_eq!(overview.monthly_activity.len(), 1);

    assert!(
        list_yearly_activity_impl(&pool, "default", 0)
            .await
            .unwrap()
            .is_empty()
    );

    let activity = get_activity_stats_impl(&pool, "default", SINCE, "2026-01-01T00:00:00.000Z", 0)
        .await
        .unwrap();
    assert_eq!(
        (activity.current_streak_days, activity.longest_streak_days),
        (0, 0)
    );
    assert!(activity.biggest_binge_day.is_none());
    assert_eq!(activity.heatmap.len(), 7 * 24);

    let recap = get_monthly_recap_impl(
        &pool,
        "default",
        "2026-01",
        "2026-01-01T00:00:00.000Z",
        "2026-02-01T00:00:00.000Z",
        0,
    )
    .await
    .unwrap();
    assert_eq!(recap.movies_watched + recap.episodes_watched, 0);
    assert!(recap.top_rated_title.is_none() && recap.favourite_genre.is_none());

    let ratings = get_rating_distribution_impl(&pool, "default", SINCE, 0)
        .await
        .unwrap();
    assert!(ratings.distribution.is_empty() && ratings.average_by_year.is_empty());

    let extras = get_library_extras_impl(&pool, "default").await.unwrap();
    assert!(extras.average_user_rating.is_none());
    assert!(extras.favourite_genres.is_empty());

    let rewatch = get_rewatch_stats_impl(&pool, "default", SINCE, &labels, 0)
        .await
        .unwrap();
    assert_eq!(rewatch.total_rewatches, 0);
    assert_eq!(rewatch.rewatch_share_percent, 0);

    let forecast = get_watch_forecast_impl(
        &pool,
        "default",
        SINCE,
        "2025-11-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();
    assert_eq!(forecast.backlog_episodes, 0);
    assert!(forecast.catch_up_date.is_none());

    let milestones = get_watch_milestones_impl(&pool, "default").await.unwrap();
    assert!(
        milestones
            .iter()
            .all(|m| !m.achieved && m.current_value == 0)
    );
}

#[tokio::test]
async fn watches_without_a_runtime_count_as_watches_with_zero_minutes() {
    let pool = migrated_pool().await;
    watch(&pool, 1, "2026-01-10T20:00:00.000Z", None).await;
    watch(&pool, 2, "2026-01-11T20:00:00.000Z", Some(90)).await;

    let labels = vec!["2026-01".to_string()];
    let overview = get_stats_overview_impl(&pool, "default", SINCE, &labels, 0)
        .await
        .unwrap();
    assert_eq!(overview.totals.movies_watched, 2);
    assert_eq!(overview.totals.minutes_watched, 90);
    assert_eq!(overview.monthly_activity[0].count, 2);
    assert_eq!(overview.monthly_activity[0].minutes, 90);

    let yearly = list_yearly_activity_impl(&pool, "default", 0)
        .await
        .unwrap();
    assert_eq!(yearly.len(), 1);
    assert_eq!(
        (yearly[0].movies_watched, yearly[0].minutes_watched),
        (2, 90)
    );

    let milestones = get_watch_milestones_impl(&pool, "default").await.unwrap();
    let hours = milestones.iter().find(|m| m.id == "hours-10").unwrap();
    assert_eq!(hours.current_value, 1);
    assert!(!hours.achieved);
}

#[tokio::test]
async fn malformed_or_empty_genres_and_missing_ratings_never_break_the_aggregates() {
    let pool = migrated_pool().await;
    for (uuid, id, genres, rating) in [
        ("a", 1, "[]", None),
        ("b", 2, "not json at all", Some(8.0)),
        ("c", 3, r#"["Drama","Comedy"]"#, Some(6.0)),
        ("d", 4, r#"["Drama"]"#, None),
    ] {
        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, genres, status, user_rating, created_at, updated_at)
             VALUES ($1, 'default', $2, 'movie', $1, $3, 'completed', $4, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .bind(uuid)
        .bind(id)
        .bind(genres)
        .bind(rating)
        .execute(&pool)
        .await
        .unwrap();
        watch(&pool, id, "2026-01-10T20:00:00.000Z", Some(100)).await;
    }

    let extras = get_library_extras_impl(&pool, "default").await.unwrap();
    assert_eq!(extras.average_user_rating, Some(7.0));
    assert_eq!(extras.favourite_genres[0].name, "Drama");
    assert_eq!(extras.favourite_genres[0].count, 2);
    assert_eq!(extras.favourite_genre_by_rating.as_deref(), Some("Comedy"));

    let recap = get_monthly_recap_impl(
        &pool,
        "default",
        "2026-01",
        "2026-01-01T00:00:00.000Z",
        "2026-02-01T00:00:00.000Z",
        0,
    )
    .await
    .unwrap();
    assert_eq!(recap.favourite_genre.as_deref(), Some("Drama"));
    assert_eq!(recap.top_rated_title.unwrap().rating, 8.0);
}

#[tokio::test]
async fn a_streak_runs_through_a_leap_day_and_across_a_new_year() {
    let pool = migrated_pool().await;
    // 2024 is a leap year: Feb 28, Feb 29, Mar 1 are three consecutive days.
    for (id, at) in [
        (1, "2024-02-28T12:00:00.000Z"),
        (2, "2024-02-29T12:00:00.000Z"),
        (3, "2024-03-01T12:00:00.000Z"),
    ] {
        watch(&pool, id, at, Some(30)).await;
    }
    // Dec 31 -> Jan 1 across a year boundary.
    for (id, at) in [
        (4, "2025-12-30T12:00:00.000Z"),
        (5, "2025-12-31T12:00:00.000Z"),
        (6, "2026-01-01T12:00:00.000Z"),
        (7, "2026-01-02T12:00:00.000Z"),
    ] {
        watch(&pool, id, at, Some(30)).await;
    }

    assert_eq!(streaks(&pool, "2026-01-02T18:00:00.000Z", 0).await, (4, 4));
    // Two days after the last watch the current streak is over, the longest
    // one is kept.
    assert_eq!(streaks(&pool, "2026-01-04T18:00:00.000Z", 0).await, (0, 4));

    // 2023 is not a leap year: there is no Feb 29, so Feb 28 and Mar 1 are
    // consecutive days.
    let pool = migrated_pool().await;
    watch(&pool, 1, "2023-02-28T12:00:00.000Z", None).await;
    watch(&pool, 2, "2023-03-01T12:00:00.000Z", None).await;
    assert_eq!(streaks(&pool, "2023-03-01T20:00:00.000Z", 0).await, (2, 2));
}

#[tokio::test]
async fn the_streak_follows_the_viewers_local_midnight_not_utc() {
    let pool = migrated_pool().await;
    // UTC+2 (offset -120): 22:30Z on the 10th is 00:30 on the 11th locally,
    // so these two watches are on the 11th and the 12th, not the 10th/11th.
    watch(&pool, 1, "2026-01-10T22:30:00.000Z", None).await;
    watch(&pool, 2, "2026-01-11T21:59:00.000Z", None).await;
    // 21:59Z on the 11th is 23:59 on the 11th locally: same local day as
    // the first watch, so it does not extend the streak.
    assert_eq!(
        streaks(&pool, "2026-01-11T22:30:00.000Z", -120).await,
        (1, 1)
    );
    // The same instants in UTC are two different days.
    assert_eq!(streaks(&pool, "2026-01-11T22:30:00.000Z", 0).await, (2, 2));

    // 22:00Z on the 11th is 00:00 on the 12th locally: a second local day.
    watch(&pool, 3, "2026-01-11T22:00:00.000Z", None).await;
    assert_eq!(
        streaks(&pool, "2026-01-11T22:30:00.000Z", -120).await,
        (2, 2)
    );
}

#[tokio::test]
async fn a_year_and_month_boundary_is_bucketed_in_the_viewers_local_time() {
    let pool = migrated_pool().await;
    // UTC-5 (offset +300): 03:00Z on Jan 1 is 22:00 on Dec 31 locally.
    watch(&pool, 1, "2026-01-01T03:00:00.000Z", Some(60)).await;

    let yearly = list_yearly_activity_impl(&pool, "default", 300)
        .await
        .unwrap();
    assert_eq!(yearly.len(), 1);
    assert_eq!(yearly[0].year, 2025);

    let labels = vec!["2025-12".to_string(), "2026-01".to_string()];
    let overview = get_stats_overview_impl(&pool, "default", SINCE, &labels, 300)
        .await
        .unwrap();
    assert_eq!(overview.monthly_activity[0].count, 1);
    assert_eq!(overview.monthly_activity[1].count, 0);
}

#[tokio::test]
async fn a_tracked_series_with_more_watched_than_announced_never_goes_negative() {
    let pool = migrated_pool().await;
    // TMDB lowered the episode count below what was already watched.
    sqlx::query(
        "INSERT INTO tracked_series (uuid, profile_id, series_id, title, total_episodes, created_at, updated_at)
         VALUES ('t', 'default', 5, 'Show', 2, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    )
    .execute(&pool)
    .await
    .unwrap();
    for episode in 1..=4 {
        sqlx::query(
            "INSERT INTO episode_progress (uuid, profile_id, series_id, episode_id, season_number, episode_number, watched, watched_at, created_at, updated_at)
             VALUES ($1, 'default', 5, $2, 1, $2, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .bind(format!("p{episode}"))
        .bind(episode)
        .execute(&pool)
        .await
        .unwrap();
    }

    let forecast = get_watch_forecast_impl(
        &pool,
        "default",
        SINCE,
        "2025-11-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();
    assert_eq!(forecast.backlog_episodes, 0);
}
