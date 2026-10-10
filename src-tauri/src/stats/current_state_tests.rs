//! The statistics count the *current state* of what the viewer has seen: a
//! watch that was later cancelled (the title's most recent event is an
//! `unwatched`) is in no figure at all, and a watch -> unwatch -> watch cycle
//! is one watch, dated at the last active watch. Every view below is read
//! after the same real command sequence so that no view can drift from the
//! others (overview, monthly, yearly, recap, streaks, heatmap, binge day,
//! pace forecast, milestones, rating averages, "on this day", the events
//! lists behind the year summary).

use serde_json::json;
use sqlx::SqlitePool;
use sqlx::sqlite::SqlitePoolOptions;
use tauri::Manager;

use crate::progress::{EpisodeInput, SeriesInput};

const SINCE: &str = "2000-01-01T00:00:00.000Z";

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

fn app_with(pool: &SqlitePool) -> tauri::App<tauri::test::MockRuntime> {
    let app = tauri::test::mock_app();
    app.manage(pool.clone());
    app
}

async fn toggle_movie(app: &tauri::App<tauri::test::MockRuntime>, watched: bool, at: &str) {
    crate::progress::toggle_movie_seen(
        serde_json::from_value(json!({
            "id": 55, "title": "Movie 55", "runtime": 100, "year": 2020, "rating": 7.5, "genres": ["Drama"],
        }))
        .unwrap(),
        watched,
        at.to_string(),
        None,
        app.state(),
    )
    .await
    .unwrap();
}

async fn toggle_episode(app: &tauri::App<tauri::test::MockRuntime>, watched: bool, at: &str) {
    let series: SeriesInput = serde_json::from_value(json!({
        "id": 10, "title": "Series 10", "runtime": 40, "numberOfEpisodes": 5, "year": 2019,
        "rating": 8.0, "genres": ["Drama"], "status": "Returning Series",
    }))
    .unwrap();
    let episode = EpisodeInput {
        id: 1001,
        season_number: 1,
        episode_number: 1,
        runtime: Some(40),
        watched_at: None,
    };
    crate::progress::toggle_episodes_watched(
        series,
        vec![episode],
        watched,
        at.to_string(),
        None,
        None,
        app.state(),
    )
    .await
    .unwrap();
}

fn labels() -> Vec<String> {
    (1..=12).map(|month| format!("2026-{month:02}")).collect()
}

/// Reads every statistic that describes viewing activity and asserts it
/// shows exactly `expected` watches (0 or 1), all dated `at` (UTC), with
/// the given duration. `kind` is "movie" or "episode".
async fn assert_every_view_shows(
    app: &tauri::App<tauri::test::MockRuntime>,
    kind: &str,
    expected: i64,
    at: &str,
    minutes: i64,
    context: &str,
) {
    let (movies, episodes) = if kind == "movie" {
        (expected, 0)
    } else {
        (0, expected)
    };
    let month = &at[..7];
    let day = &at[..10];
    let year: i64 = at[..4].parse().unwrap();

    // Overview: totals and the monthly chart.
    let overview =
        crate::stats::get_stats_overview(SINCE.to_string(), labels(), 0, None, app.state())
            .await
            .unwrap();
    assert_eq!(
        overview.totals.movies_watched, movies,
        "{context}: overview movies"
    );
    assert_eq!(
        overview.totals.episodes_watched, episodes,
        "{context}: overview episodes"
    );
    assert_eq!(
        overview.totals.minutes_watched,
        minutes * expected,
        "{context}: overview minutes"
    );
    for bucket in &overview.monthly_activity {
        let want = if expected == 1 && bucket.month == month {
            1
        } else {
            0
        };
        assert_eq!(
            bucket.count, want,
            "{context}: monthly count for {}",
            bucket.month
        );
        assert_eq!(
            bucket.minutes,
            want * minutes,
            "{context}: monthly minutes for {}",
            bucket.month
        );
    }

    // Yearly activity.
    let yearly = crate::stats::list_yearly_activity(0, None, app.state())
        .await
        .unwrap();
    if expected == 0 {
        assert!(
            yearly.is_empty(),
            "{context}: yearly must be empty, got {yearly:?}"
        );
    } else {
        assert_eq!(yearly.len(), 1, "{context}: yearly years");
        assert_eq!(yearly[0].year, year, "{context}: yearly year");
        assert_eq!(yearly[0].movies_watched, movies, "{context}: yearly movies");
        assert_eq!(
            yearly[0].episodes_watched, episodes,
            "{context}: yearly episodes"
        );
        assert_eq!(
            yearly[0].minutes_watched, minutes,
            "{context}: yearly minutes"
        );
    }

    // Monthly recap, for every month of the year.
    for label in labels() {
        let (start, end) = month_range(&label);
        let recap =
            crate::stats::get_monthly_recap(label.clone(), start, end, 0, None, app.state())
                .await
                .unwrap();
        let in_month = expected == 1 && label == month;
        assert_eq!(
            recap.movies_watched,
            if in_month { movies } else { 0 },
            "{context}: recap {label} movies"
        );
        assert_eq!(
            recap.episodes_watched,
            if in_month { episodes } else { 0 },
            "{context}: recap {label} episodes"
        );
        assert_eq!(
            recap.minutes_watched,
            if in_month { minutes } else { 0 },
            "{context}: recap {label} minutes"
        );
        match (&recap.biggest_binge_day, in_month) {
            (Some(binge), true) => {
                assert_eq!(binge.day, day, "{context}: recap {label} binge day");
                assert_eq!(binge.count, 1, "{context}: recap {label} binge count");
            }
            (None, false) => {}
            other => panic!("{context}: recap {label} binge day {other:?}"),
        }
    }

    // Streaks, binge day, heatmap.
    let activity = crate::stats::get_activity_stats(
        SINCE.to_string(),
        format!("{}T23:00:00.000Z", day),
        0,
        None,
        app.state(),
    )
    .await
    .unwrap();
    assert_eq!(
        activity.longest_streak_days, expected,
        "{context}: longest streak"
    );
    assert_eq!(
        activity.current_streak_days, expected,
        "{context}: current streak"
    );
    assert_eq!(
        activity
            .heatmap
            .iter()
            .map(|bucket| bucket.count)
            .sum::<i64>(),
        expected,
        "{context}: heatmap total"
    );
    match (&activity.biggest_binge_day, expected) {
        (Some(binge), 1) => {
            assert_eq!(binge.day, day, "{context}: binge day");
            assert_eq!(binge.count, 1, "{context}: binge count");
        }
        (None, 0) => {}
        other => panic!("{context}: binge day {other:?}"),
    }
    if expected == 1 {
        // 2026-04-03 20:30 UTC is a Friday (5), hour 20.
        let hour: i64 = at[11..13].parse().unwrap();
        let bucket = activity
            .heatmap
            .iter()
            .find(|bucket| bucket.count > 0)
            .expect("one heatmap cell");
        assert_eq!(
            (bucket.day, bucket.hour),
            (5, hour),
            "{context}: heatmap cell"
        );
    }

    // Pace forecast: one watch inside a 60-day window = 1 / (60 / 7) a week.
    let forecast = crate::stats::get_watch_forecast(
        SINCE.to_string(),
        SINCE.to_string(),
        "2026-04-10T00:00:00.000Z".to_string(),
        app.state(),
    )
    .await
    .unwrap();
    let want_pace = if kind == "episode" {
        ((expected as f64 / (60.0 / 7.0)) * 10.0).round() / 10.0
    } else {
        0.0
    };
    assert!(
        (forecast.episodes_per_week - want_pace).abs() < 1e-9,
        "{context}: pace {} vs {want_pace}",
        forecast.episodes_per_week
    );

    // Milestones.
    let milestones = crate::stats::get_watch_milestones(app.state())
        .await
        .unwrap();
    for milestone in &milestones {
        let want = match milestone.id.split('-').next().unwrap() {
            "movies" => movies,
            "episodes" => episodes,
            "hours" => minutes * expected / 60,
            _ => continue,
        };
        assert_eq!(
            milestone.current_value, want,
            "{context}: milestone {}",
            milestone.id
        );
    }

    // Rating averages by month and year (the title is rated 8).
    let ratings = crate::stats::get_rating_distribution(SINCE.to_string(), 0, None, app.state())
        .await
        .unwrap();
    if expected == 0 {
        assert!(
            ratings.average_by_month.is_empty(),
            "{context}: rating months"
        );
        assert!(
            ratings.average_by_year.is_empty(),
            "{context}: rating years"
        );
    } else {
        assert_eq!(
            ratings.average_by_month.len(),
            1,
            "{context}: rating months"
        );
        assert_eq!(ratings.average_by_month[0].period, month);
        assert_eq!(ratings.average_by_year.len(), 1, "{context}: rating years");
        assert_eq!(ratings.average_by_year[0].period, year.to_string());
    }

    // Events lists behind the year summary and "on this day".
    let recent = crate::stats::list_recent_viewing_events(SINCE.to_string(), app.state())
        .await
        .unwrap();
    assert_eq!(recent.len() as i64, expected, "{context}: recent events");
    let for_year = crate::stats::list_viewing_events_for_year(
        format!("{year}-01-01T00:00:00.000Z"),
        format!("{}-01-01T00:00:00.000Z", year + 1),
        app.state(),
    )
    .await
    .unwrap();
    assert_eq!(for_year.len() as i64, expected, "{context}: year events");
    if expected == 1 {
        assert_eq!(
            recent[0].watched_at, at,
            "{context}: the event is the last active watch"
        );
    }
    let on_this_day = crate::stats::list_on_this_day_events(
        format!("{}-{}T12:00:00.000Z", year + 1, &at[5..10]),
        0,
        None,
        app.state(),
    )
    .await
    .unwrap();
    assert_eq!(on_this_day.len() as i64, expected, "{context}: on this day");
    // The cancelled watch's own day must show nothing.
    let cancelled_day = crate::stats::list_on_this_day_events(
        format!("{}-03-01T12:00:00.000Z", year + 1),
        0,
        None,
        app.state(),
    )
    .await
    .unwrap();
    assert!(
        cancelled_day.is_empty(),
        "{context}: on this day for the cancelled watch's date"
    );
}

fn month_range(label: &str) -> (String, String) {
    let year: i32 = label[..4].parse().unwrap();
    let month: u32 = label[5..7].parse().unwrap();
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    (
        format!("{year}-{month:02}-01T00:00:00.000Z"),
        format!("{next_year}-{next_month:02}-01T00:00:00.000Z"),
    )
}

async fn rate_library_item(
    app: &tauri::App<tauri::test::MockRuntime>,
    media_id: i64,
    media_type: &str,
) {
    crate::library::save_library_item(
        serde_json::from_value(json!({
            "id": media_id, "mediaType": media_type, "title": "Rated", "posterPath": null,
            "backdropPath": null, "year": 2020, "rating": 7.0, "genres": ["Drama"],
        }))
        .unwrap(),
        Some(serde_json::from_value(json!({ "userRating": 8.0 })).unwrap()),
        app.state(),
    )
    .await
    .unwrap();
}

const MARCH_WATCH: &str = "2026-03-01T10:00:00.000Z";
const MARCH_UNWATCH: &str = "2026-03-02T10:00:00.000Z";
const APRIL_WATCH: &str = "2026-04-03T20:30:00.000Z";

#[tokio::test]
async fn a_cancelled_movie_watch_is_in_no_statistic() {
    let pool = migrated_pool().await;
    let app = app_with(&pool);
    toggle_movie(&app, true, MARCH_WATCH).await;
    toggle_movie(&app, false, MARCH_UNWATCH).await;
    rate_library_item(&app, 55, "movie").await;

    assert_every_view_shows(&app, "movie", 0, MARCH_WATCH, 100, "cancelled movie").await;
}

#[tokio::test]
async fn a_cancelled_episode_watch_is_in_no_statistic() {
    let pool = migrated_pool().await;
    let app = app_with(&pool);
    toggle_episode(&app, true, MARCH_WATCH).await;
    toggle_episode(&app, false, MARCH_UNWATCH).await;
    rate_library_item(&app, 10, "series").await;

    assert_every_view_shows(&app, "episode", 0, MARCH_WATCH, 40, "cancelled episode").await;
}

#[tokio::test]
async fn a_watch_unwatch_watch_cycle_on_a_movie_is_one_watch_at_the_last_watch_date() {
    let pool = migrated_pool().await;
    let app = app_with(&pool);
    toggle_movie(&app, true, MARCH_WATCH).await;
    toggle_movie(&app, false, MARCH_UNWATCH).await;
    toggle_movie(&app, true, APRIL_WATCH).await;
    rate_library_item(&app, 55, "movie").await;

    assert_every_view_shows(&app, "movie", 1, APRIL_WATCH, 100, "movie cycle").await;
}

#[tokio::test]
async fn a_watch_unwatch_watch_cycle_on_an_episode_is_one_watch_at_the_last_watch_date() {
    let pool = migrated_pool().await;
    let app = app_with(&pool);
    toggle_episode(&app, true, MARCH_WATCH).await;
    toggle_episode(&app, false, MARCH_UNWATCH).await;
    toggle_episode(&app, true, APRIL_WATCH).await;
    rate_library_item(&app, 10, "series").await;

    assert_every_view_shows(&app, "episode", 1, APRIL_WATCH, 40, "episode cycle").await;
}

/// Logs one event for movie 7, in call order (which is the order the app
/// logged it in, whatever date it carries).
async fn log_event(pool: &SqlitePool, uuid: &str, kind: &str, at: &str) {
    sqlx::query(
        "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, created_at)
         VALUES ($1, 'default', 7, 'movie', 'Movie 7', $2, $3, 90, $3)",
    )
    .bind(uuid)
    .bind(kind)
    .bind(at)
    .execute(pool)
    .await
    .unwrap();
}

async fn seen_movie_dates(app: &tauri::App<tauri::test::MockRuntime>) -> Vec<String> {
    let overview =
        crate::stats::get_stats_overview(SINCE.to_string(), labels(), 0, None, app.state())
            .await
            .unwrap();
    let recent = crate::stats::list_recent_viewing_events(SINCE.to_string(), app.state())
        .await
        .unwrap();
    assert_eq!(overview.totals.movies_watched as usize, recent.len());
    recent.into_iter().map(|event| event.watched_at).collect()
}

#[tokio::test]
async fn a_watch_dated_before_an_earlier_unwatch_but_logged_after_it_leaves_the_title_seen() {
    let pool = migrated_pool().await;
    let app = app_with(&pool);
    log_event(&pool, "w1", "watched", "2026-03-05T10:00:00.000Z").await;
    log_event(&pool, "u1", "unwatched", "2026-03-06T10:00:00.000Z").await;
    // An import (or a clock that ran late) logs a watch dated before the unwatch.
    log_event(&pool, "w2", "watched", "2026-03-01T10:00:00.000Z").await;

    assert_eq!(
        seen_movie_dates(&app).await,
        vec!["2026-03-01T10:00:00.000Z"]
    );
}

#[tokio::test]
async fn an_unwatch_logged_after_a_later_dated_watch_still_cancels_it() {
    let pool = migrated_pool().await;
    let app = app_with(&pool);
    log_event(&pool, "w1", "watched", "2026-03-06T10:00:00.000Z").await;
    // Dated earlier than the watch it undoes, but logged after it.
    log_event(&pool, "u1", "unwatched", "2026-03-05T10:00:00.000Z").await;

    assert!(seen_movie_dates(&app).await.is_empty());
}

#[tokio::test]
async fn events_with_identical_dates_are_ordered_by_when_they_were_logged() {
    let at = "2026-03-05T10:00:00.000Z";

    let pool = migrated_pool().await;
    let app = app_with(&pool);
    log_event(&pool, "w", "watched", at).await;
    log_event(&pool, "u", "unwatched", at).await;
    assert!(
        seen_movie_dates(&app).await.is_empty(),
        "watch then unwatch"
    );

    // Uuids sort the other way round on purpose: the order is not the uuid's.
    let pool = migrated_pool().await;
    let app = app_with(&pool);
    log_event(&pool, "z-u", "unwatched", at).await;
    log_event(&pool, "a-w", "watched", at).await;
    assert_eq!(seen_movie_dates(&app).await, vec![at], "unwatch then watch");
}
