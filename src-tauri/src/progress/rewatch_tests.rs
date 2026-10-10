//! Rewatches: the app writes a `rewatched` viewing event when the viewer
//! explicitly watches an already-seen movie again, and when they raise a
//! title's rewatch count in the library editor — never by guessing from the
//! history. The rewatch statistics read those events under the same
//! current-state rule as every other statistic.

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

type App = tauri::App<tauri::test::MockRuntime>;

fn app_with(pool: &SqlitePool) -> App {
    let app = tauri::test::mock_app();
    app.manage(pool.clone());
    app
}

fn movie_json() -> serde_json::Value {
    json!({
        "id": 55, "title": "Movie 55", "runtime": 100, "year": 2020, "rating": 7.5, "genres": ["Drama"],
    })
}

async fn toggle_movie(app: &App, watched: bool, at: &str) {
    crate::progress::toggle_movie_seen(
        serde_json::from_value(movie_json()).unwrap(),
        watched,
        at.to_string(),
        None,
        app.state(),
    )
    .await
    .unwrap();
}

async fn rewatch_movie(app: &App, at: &str) -> Result<(), crate::error::ApiError> {
    crate::progress::rewatch_movie(
        serde_json::from_value(movie_json()).unwrap(),
        at.to_string(),
        None,
        app.state(),
    )
    .await
}

async fn count(pool: &SqlitePool, sql: &str) -> i64 {
    sqlx::query_scalar(sqlx::AssertSqlSafe(sql.to_string()))
        .fetch_one(pool)
        .await
        .unwrap()
}

async fn rewatch_events(pool: &SqlitePool) -> i64 {
    count(
        pool,
        "SELECT COUNT(*) FROM viewing_events WHERE event_type = 'rewatched'",
    )
    .await
}

async fn counter(pool: &SqlitePool, media_id: i64, media_type: &str) -> i64 {
    count(
        pool,
        &format!(
            "SELECT rewatch_count FROM library_items WHERE media_id = {media_id} AND media_type = '{media_type}'"
        ),
    )
    .await
}

/// The rewatch statistics as the frontend receives them (camelCase JSON).
async fn rewatch_stats(app: &App) -> serde_json::Value {
    serde_json::to_value(
        crate::stats::get_rewatch_stats(
            SINCE.to_string(),
            vec!["2026-01".to_string(), "2026-02".to_string()],
            0,
            app.state(),
        )
        .await
        .unwrap(),
    )
    .unwrap()
}

async fn total_rewatches(app: &App) -> i64 {
    rewatch_stats(app).await["totalRewatches"].as_i64().unwrap()
}

#[tokio::test]
async fn watching_a_seen_movie_again_logs_one_rewatch_and_the_movie_stays_one_watch() {
    let pool = migrated_pool().await;
    let app = app_with(&pool);
    toggle_movie(&app, true, "2026-01-10T20:00:00.000Z").await;

    rewatch_movie(&app, "2026-02-14T21:00:00.000Z")
        .await
        .unwrap();

    assert_eq!(rewatch_events(&pool).await, 1);
    // Still seen, still one watch dated at the first viewing — a rewatch is
    // not a second watch of the title in the overview or the year summary.
    let overview = crate::stats::get_stats_overview(SINCE.to_string(), vec![], 0, app.state())
        .await
        .unwrap();
    assert_eq!(overview.totals.movies_watched, 1);
    assert_eq!(overview.totals.minutes_watched, 100);
    let recent = crate::stats::list_recent_viewing_events(SINCE.to_string(), app.state())
        .await
        .unwrap();
    assert_eq!(recent.len(), 1);
    assert_eq!(recent[0].watched_at, "2026-01-10T20:00:00.000Z");
    assert!(
        crate::progress::is_movie_seen(55, app.state())
            .await
            .unwrap()
    );

    // The rewatch statistics.
    let stats = rewatch_stats(&app).await;
    assert_eq!(stats["totalRewatches"], 1);
    assert_eq!(stats["rewatchSharePercent"], 50);
    assert_eq!(
        stats["favouriteComfortTitles"],
        json!([{ "title": "Movie 55", "count": 1 }])
    );
    assert_eq!(
        stats["rewatchActivity"],
        json!([
            { "month": "2026-01", "count": 0, "minutes": 0 },
            { "month": "2026-02", "count": 1, "minutes": 100 },
        ])
    );
    let extras = crate::stats::get_library_extras(app.state()).await.unwrap();
    let most = extras.most_rewatched_title.unwrap();
    assert_eq!((most.title.as_str(), most.count), ("Movie 55", 1));

    // The library editor's counter follows.
    assert_eq!(counter(&pool, 55, "movie").await, 1);
}

#[tokio::test]
async fn watching_an_unseen_movie_again_is_refused_and_writes_nothing() {
    let pool = migrated_pool().await;
    let app = app_with(&pool);

    let refused = rewatch_movie(&app, "2026-02-14T21:00:00.000Z").await;
    assert!(refused.is_err());

    // A movie that was seen and then unwatched is not seen either.
    toggle_movie(&app, true, "2026-01-10T20:00:00.000Z").await;
    toggle_movie(&app, false, "2026-01-11T20:00:00.000Z").await;
    assert!(
        rewatch_movie(&app, "2026-02-14T21:00:00.000Z")
            .await
            .is_err()
    );

    assert_eq!(rewatch_events(&pool).await, 0);
}

#[tokio::test]
async fn repeating_the_same_rewatch_is_a_no_op_but_a_new_viewing_counts() {
    let pool = migrated_pool().await;
    let app = app_with(&pool);
    toggle_movie(&app, true, "2026-01-10T20:00:00.000Z").await;

    rewatch_movie(&app, "2026-02-14T21:00:00.000Z")
        .await
        .unwrap();
    // A retry or a double invocation of the very same call.
    rewatch_movie(&app, "2026-02-14T21:00:00.000Z")
        .await
        .unwrap();
    assert_eq!(rewatch_events(&pool).await, 1);
    assert_eq!(counter(&pool, 55, "movie").await, 1);

    rewatch_movie(&app, "2026-02-20T21:00:00.000Z")
        .await
        .unwrap();
    assert_eq!(rewatch_events(&pool).await, 2);
    assert_eq!(counter(&pool, 55, "movie").await, 2);
}

#[tokio::test]
async fn unwatching_cancels_the_rewatches_and_resets_the_counter() {
    let pool = migrated_pool().await;
    let app = app_with(&pool);
    toggle_movie(&app, true, "2026-01-10T20:00:00.000Z").await;
    rewatch_movie(&app, "2026-02-01T20:00:00.000Z")
        .await
        .unwrap();
    rewatch_movie(&app, "2026-02-02T20:00:00.000Z")
        .await
        .unwrap();
    assert_eq!(total_rewatches(&app).await, 2);

    toggle_movie(&app, false, "2026-02-05T20:00:00.000Z").await;

    assert_eq!(total_rewatches(&app).await, 0);
    assert!(
        crate::stats::get_library_extras(app.state())
            .await
            .unwrap()
            .most_rewatched_title
            .is_none()
    );
    assert_eq!(counter(&pool, 55, "movie").await, 0);

    // Watching it again starts from scratch: the cancelled rewatches stay
    // cancelled, and a new rewatch counts as the first.
    toggle_movie(&app, true, "2026-02-10T20:00:00.000Z").await;
    assert_eq!(total_rewatches(&app).await, 0);
    rewatch_movie(&app, "2026-02-12T20:00:00.000Z")
        .await
        .unwrap();
    assert_eq!(total_rewatches(&app).await, 1);
    assert_eq!(counter(&pool, 55, "movie").await, 1);
}

async fn save_counter(app: &App, media_id: i64, media_type: &str, rewatch_count: i64) {
    crate::library::save_library_item(
        serde_json::from_value(json!({
            "id": media_id, "mediaType": media_type, "title": format!("Title {media_id}"),
            "posterPath": null, "backdropPath": null, "year": 2020, "rating": 7.0, "genres": ["Drama"],
        }))
        .unwrap(),
        Some(serde_json::from_value(json!({ "rewatchCount": rewatch_count })).unwrap()),
        app.state(),
    )
    .await
    .unwrap();
}

#[tokio::test]
async fn raising_the_library_counter_of_a_seen_movie_logs_one_rewatch_per_step() {
    let pool = migrated_pool().await;
    let app = app_with(&pool);
    toggle_movie(&app, true, "2026-01-10T20:00:00.000Z").await;

    save_counter(&app, 55, "movie", 2).await;
    assert_eq!(rewatch_events(&pool).await, 2);
    assert_eq!(counter(&pool, 55, "movie").await, 2);

    // The editor re-saving the same value (retry, unchanged form) logs nothing.
    save_counter(&app, 55, "movie", 2).await;
    assert_eq!(rewatch_events(&pool).await, 2);

    save_counter(&app, 55, "movie", 3).await;
    assert_eq!(rewatch_events(&pool).await, 3);
    assert_eq!(total_rewatches(&app).await, 3);
    // The rewatches carry the movie's runtime, like the watch they follow.
    let minutes = count(
        &pool,
        "SELECT SUM(duration_minutes) FROM viewing_events WHERE event_type = 'rewatched'",
    )
    .await;
    assert_eq!(minutes, 300);
    // Never a second watch of the movie.
    let overview = crate::stats::get_stats_overview(SINCE.to_string(), vec![], 0, app.state())
        .await
        .unwrap();
    assert_eq!(overview.totals.movies_watched, 1);
}

#[tokio::test]
async fn lowering_the_library_counter_takes_back_the_most_recent_rewatches() {
    let pool = migrated_pool().await;
    let app = app_with(&pool);
    toggle_movie(&app, true, "2026-01-10T20:00:00.000Z").await;
    save_counter(&app, 55, "movie", 3).await;

    save_counter(&app, 55, "movie", 1).await;
    assert_eq!(rewatch_events(&pool).await, 1);
    assert_eq!(total_rewatches(&app).await, 1);

    save_counter(&app, 55, "movie", 0).await;
    assert_eq!(rewatch_events(&pool).await, 0);
    assert_eq!(total_rewatches(&app).await, 0);
    // The first watch is untouched.
    assert!(
        crate::progress::is_movie_seen(55, app.state())
            .await
            .unwrap()
    );
}

#[tokio::test]
async fn a_counter_set_on_a_title_that_is_not_seen_is_not_a_viewing() {
    let pool = migrated_pool().await;
    let app = app_with(&pool);

    save_counter(&app, 55, "movie", 3).await;

    // Only the editor's own field changes: no event, and in particular the
    // movie must not become "seen" in the statistics.
    assert_eq!(counter(&pool, 55, "movie").await, 3);
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM viewing_events").await, 0);
    let overview = crate::stats::get_stats_overview(SINCE.to_string(), vec![], 0, app.state())
        .await
        .unwrap();
    assert_eq!(overview.totals.movies_watched, 0);
}

#[tokio::test]
async fn a_series_counter_logs_title_level_rewatches_that_never_count_as_episode_watches() {
    let pool = migrated_pool().await;
    let app = app_with(&pool);
    let series: SeriesInput = serde_json::from_value(json!({
        "id": 10, "title": "Title 10", "runtime": 40, "numberOfEpisodes": 5, "year": 2019,
        "rating": 8.0, "genres": ["Drama"], "status": "Returning Series",
    }))
    .unwrap();
    crate::progress::toggle_episodes_watched(
        series,
        vec![EpisodeInput {
            id: 1001,
            season_number: 1,
            episode_number: 1,
            runtime: Some(40),
            watched_at: None,
        }],
        true,
        "2026-01-10T20:00:00.000Z".to_string(),
        None,
        None,
        app.state(),
    )
    .await
    .unwrap();

    save_counter(&app, 10, "series", 2).await;

    assert_eq!(rewatch_events(&pool).await, 2);
    let overview = crate::stats::get_stats_overview(SINCE.to_string(), vec![], 0, app.state())
        .await
        .unwrap();
    assert_eq!(overview.totals.episodes_watched, 1);
    assert_eq!(overview.totals.minutes_watched, 40);
    assert_eq!(total_rewatches(&app).await, 2);
    let most = crate::stats::get_library_extras(app.state())
        .await
        .unwrap()
        .most_rewatched_title
        .unwrap();
    assert_eq!((most.title.as_str(), most.count), ("Title 10", 2));

    // A series nobody watched has nothing to rewatch.
    save_counter(&app, 11, "series", 4).await;
    assert_eq!(rewatch_events(&pool).await, 2);
}
