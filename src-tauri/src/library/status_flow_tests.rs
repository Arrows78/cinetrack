//! The status behaviours the viewer actually sees, one scenario per rule, run
//! through the real commands on a migrated database. The rules themselves
//! (the table in `status.rs`) are covered exhaustively by that file's unit
//! tests, and the random-sequence test checks them against an independent
//! model; these read like the documentation in `docs/library-status.md`.

use sqlx::SqlitePool;
use tauri::{Manager, State};

use super::domain::{LibraryStatus, LibraryStatusOrigin};
use super::models::{LibraryItem, LibraryPatch, MediaSummaryInput};
use super::queries::get_impl;
use super::repository::{add_if_absent_impl, remove_impl, upsert_impl};
use super::status::reset_status_to_auto_impl;
use super::status_transitions_tests::{ep, migrated_pool, show, show_media};
use crate::models::MediaType;
use crate::progress::{apply_episodes_impl, refresh_tracked_series_status, toggle_movie_seen};

const SERIES: i64 = 9;
const MOVIE: i64 = 55;

async fn series_item(pool: &SqlitePool) -> Option<LibraryItem> {
    get_impl(pool, "default", SERIES, MediaType::Series)
        .await
        .unwrap()
}

async fn movie_item(pool: &SqlitePool) -> Option<LibraryItem> {
    get_impl(pool, "default", MOVIE, MediaType::Movie)
        .await
        .unwrap()
}

fn status_of(item: &Option<LibraryItem>) -> Option<LibraryStatus> {
    item.as_ref().map(|item| item.status)
}

async fn watch(pool: &SqlitePool, total: i64, tmdb_status: &str, episodes: &[i64], at: &str) {
    let picked: Vec<_> = episodes.iter().map(|n| ep(900 + n, *n)).collect();
    apply_episodes_impl(
        pool,
        "default",
        &show(SERIES, total, tmdb_status),
        &picked,
        true,
        at,
    )
    .await
    .unwrap();
}

async fn unwatch(pool: &SqlitePool, total: i64, tmdb_status: &str, episodes: &[i64], at: &str) {
    let picked: Vec<_> = episodes.iter().map(|n| ep(900 + n, *n)).collect();
    apply_episodes_impl(
        pool,
        "default",
        &show(SERIES, total, tmdb_status),
        &picked,
        false,
        at,
    )
    .await
    .unwrap();
}

async fn set_manual(pool: &SqlitePool, status: LibraryStatus) {
    upsert_impl(
        pool,
        show_media(SERIES),
        LibraryPatch {
            status: Some(status),
            ..Default::default()
        },
        "default",
    )
    .await
    .unwrap();
}

fn movie_media() -> MediaSummaryInput {
    MediaSummaryInput {
        media_type: MediaType::Movie,
        ..show_media(MOVIE)
    }
}

async fn toggle_movie(app: &tauri::App<tauri::test::MockRuntime>, watched: bool, at: &str) {
    let movie = serde_json::from_value(serde_json::json!({
        "id": MOVIE, "title": "Movie", "posterPath": null, "backdropPath": null,
        "runtime": 100, "year": 2020, "rating": 7.0, "genres": []
    }))
    .unwrap();
    let pool: State<'_, SqlitePool> = app.state();
    toggle_movie_seen(movie, watched, at.to_string(), None, pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn a_movie_is_completed_when_seen_and_goes_back_to_planned_when_taken_back() {
    let pool = migrated_pool().await;
    let app = tauri::test::mock_app();
    app.manage(pool.clone());

    toggle_movie(&app, true, "2026-01-01T00:00:00.000Z").await;
    let seen = movie_item(&pool).await.unwrap();
    assert_eq!(seen.status, LibraryStatus::Completed);
    assert_eq!(seen.status_origin, Some(LibraryStatusOrigin::Auto));
    assert!(seen.completed_at.is_some());

    toggle_movie(&app, false, "2026-01-01T01:00:00.000Z").await;
    let taken_back = movie_item(&pool).await.unwrap();
    assert_eq!(taken_back.status, LibraryStatus::Planned);
    assert_eq!(taken_back.completed_at, None);

    toggle_movie(&app, true, "2026-01-01T02:00:00.000Z").await;
    assert_eq!(
        status_of(&movie_item(&pool).await),
        Some(LibraryStatus::Completed)
    );
}

#[tokio::test]
async fn a_completed_movie_the_viewer_chose_stays_completed_when_taken_back() {
    let pool = migrated_pool().await;
    let app = tauri::test::mock_app();
    app.manage(pool.clone());
    toggle_movie(&app, true, "2026-01-01T00:00:00.000Z").await;
    // Picked by hand: a different value and back, so the status is a decision
    // (setting the value it already has leaves the origin automatic).
    for status in [LibraryStatus::Dropped, LibraryStatus::Completed] {
        upsert_impl(
            &pool,
            movie_media(),
            LibraryPatch {
                status: Some(status),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
    }
    assert_eq!(
        movie_item(&pool).await.unwrap().status_origin,
        Some(LibraryStatusOrigin::Manual)
    );

    toggle_movie(&app, false, "2026-01-01T01:00:00.000Z").await;

    assert_eq!(
        status_of(&movie_item(&pool).await),
        Some(LibraryStatus::Completed)
    );
}

#[tokio::test]
async fn a_series_follows_its_progress_up_and_back_down() {
    let pool = migrated_pool().await;
    watch(&pool, 3, "Ended", &[1], "2026-01-01T00:00:00.000Z").await;
    assert_eq!(
        status_of(&series_item(&pool).await),
        Some(LibraryStatus::Watching)
    );
    watch(&pool, 3, "Ended", &[2, 3], "2026-01-01T01:00:00.000Z").await;
    assert_eq!(
        status_of(&series_item(&pool).await),
        Some(LibraryStatus::Completed)
    );

    unwatch(&pool, 3, "Ended", &[3], "2026-01-01T02:00:00.000Z").await;
    let item = series_item(&pool).await.unwrap();
    assert_eq!(item.status, LibraryStatus::Watching);
    assert_eq!(item.completed_at, None, "leaving Completed clears the date");
    assert!(item.started_at.is_some());

    unwatch(&pool, 3, "Ended", &[1, 2], "2026-01-01T03:00:00.000Z").await;
    assert_eq!(
        status_of(&series_item(&pool).await),
        Some(LibraryStatus::Planned)
    );
}

#[tokio::test]
async fn an_ongoing_series_that_is_caught_up_stays_watching() {
    let pool = migrated_pool().await;
    watch(
        &pool,
        3,
        "Returning Series",
        &[1, 2, 3],
        "2026-01-01T00:00:00.000Z",
    )
    .await;
    assert_eq!(
        status_of(&series_item(&pool).await),
        Some(LibraryStatus::Watching)
    );
}

#[tokio::test]
async fn watching_resumes_a_paused_or_dropped_series() {
    for parked in [LibraryStatus::Paused, LibraryStatus::Dropped] {
        let pool = migrated_pool().await;
        watch(&pool, 5, "Ended", &[1], "2026-01-01T00:00:00.000Z").await;
        set_manual(&pool, parked).await;
        assert_eq!(status_of(&series_item(&pool).await), Some(parked));

        watch(&pool, 5, "Ended", &[2], "2026-01-01T01:00:00.000Z").await;

        let item = series_item(&pool).await.unwrap();
        assert_eq!(item.status, LibraryStatus::Watching, "{parked:?}");
        assert_eq!(item.status_origin, Some(LibraryStatusOrigin::Auto));
    }
}

#[tokio::test]
async fn finishing_a_series_while_paused_completes_it() {
    let pool = migrated_pool().await;
    watch(&pool, 2, "Ended", &[1], "2026-01-01T00:00:00.000Z").await;
    set_manual(&pool, LibraryStatus::Paused).await;
    watch(&pool, 2, "Ended", &[2], "2026-01-01T01:00:00.000Z").await;
    assert_eq!(
        status_of(&series_item(&pool).await),
        Some(LibraryStatus::Completed)
    );
}

#[tokio::test]
async fn a_caught_up_series_completes_once_tmdb_reports_that_it_ended() {
    let pool = migrated_pool().await;
    let app = tauri::test::mock_app();
    app.manage(pool.clone());
    // Everything aired is watched, but the series is still running.
    watch(
        &pool,
        3,
        "Returning Series",
        &[1, 2, 3],
        "2026-01-01T00:00:00.000Z",
    )
    .await;
    assert_eq!(
        status_of(&series_item(&pool).await),
        Some(LibraryStatus::Watching)
    );

    // Nobody opens the series: the Today Hub's refresh brings TMDB's verdict.
    let state: State<'_, SqlitePool> = app.state();
    refresh_tracked_series_status(SERIES, Some("Ended".to_string()), Some(3), state)
        .await
        .unwrap();

    let item = series_item(&pool).await.unwrap();
    assert_eq!(item.status, LibraryStatus::Completed);
    assert!(item.completed_at.is_some());

    // And a later announcement of more episodes reopens it.
    let state: State<'_, SqlitePool> = app.state();
    refresh_tracked_series_status(SERIES, Some("Returning Series".to_string()), Some(5), state)
        .await
        .unwrap();
    assert_eq!(
        status_of(&series_item(&pool).await),
        Some(LibraryStatus::Watching)
    );
}

#[tokio::test]
async fn a_refresh_never_moves_a_status_the_viewer_chose() {
    let pool = migrated_pool().await;
    let app = tauri::test::mock_app();
    app.manage(pool.clone());
    watch(&pool, 3, "Ended", &[1], "2026-01-01T00:00:00.000Z").await;
    set_manual(&pool, LibraryStatus::Dropped).await;
    watch(&pool, 3, "Ended", &[2, 3], "2026-01-01T01:00:00.000Z").await;
    // That completed it; the viewer then picks Paused on purpose.
    set_manual(&pool, LibraryStatus::Paused).await;

    let state: State<'_, SqlitePool> = app.state();
    refresh_tracked_series_status(SERIES, Some("Ended".to_string()), Some(3), state)
        .await
        .unwrap();

    assert_eq!(
        status_of(&series_item(&pool).await),
        Some(LibraryStatus::Paused)
    );
}

#[tokio::test]
async fn re_adding_a_series_with_progress_brings_its_status_back_from_the_progress() {
    let pool = migrated_pool().await;
    watch(&pool, 3, "Ended", &[1, 2], "2026-01-01T00:00:00.000Z").await;
    remove_impl(&pool, "default", SERIES, MediaType::Series)
        .await
        .unwrap();
    assert!(series_item(&pool).await.is_none());

    assert!(
        add_if_absent_impl(&pool, show_media(SERIES), "default")
            .await
            .unwrap()
    );

    let item = series_item(&pool).await.unwrap();
    assert_eq!(item.status, LibraryStatus::Watching);
    assert_eq!(item.status_origin, Some(LibraryStatusOrigin::Auto));
    assert!(item.started_at.is_some());
}

#[tokio::test]
async fn adding_a_title_with_no_progress_is_a_plain_planned_entry() {
    let pool = migrated_pool().await;
    assert!(
        add_if_absent_impl(&pool, show_media(SERIES), "default")
            .await
            .unwrap()
    );
    let item = series_item(&pool).await.unwrap();
    assert_eq!(item.status, LibraryStatus::Planned);
    assert_eq!(item.status_origin, Some(LibraryStatusOrigin::Manual));
}

#[tokio::test]
async fn automatic_gives_the_status_back_to_the_viewing() {
    let pool = migrated_pool().await;
    watch(&pool, 4, "Ended", &[1, 2], "2026-01-01T00:00:00.000Z").await;
    set_manual(&pool, LibraryStatus::Dropped).await;
    let chosen = series_item(&pool).await.unwrap();
    assert_eq!(chosen.status, LibraryStatus::Dropped);
    assert_eq!(chosen.status_origin, Some(LibraryStatusOrigin::Manual));

    assert!(
        reset_status_to_auto_impl(&pool, "default", SERIES, MediaType::Series)
            .await
            .unwrap()
    );

    let item = series_item(&pool).await.unwrap();
    assert_eq!(item.status, LibraryStatus::Watching);
    assert_eq!(item.status_origin, Some(LibraryStatusOrigin::Auto));

    // From then on it follows again.
    watch(&pool, 4, "Ended", &[3, 4], "2026-01-01T01:00:00.000Z").await;
    assert_eq!(
        status_of(&series_item(&pool).await),
        Some(LibraryStatus::Completed)
    );
    unwatch(&pool, 4, "Ended", &[4], "2026-01-01T02:00:00.000Z").await;
    assert_eq!(
        status_of(&series_item(&pool).await),
        Some(LibraryStatus::Watching)
    );
}

#[tokio::test]
async fn automatic_on_a_title_that_is_not_in_the_library_does_nothing() {
    let pool = migrated_pool().await;
    assert!(
        !reset_status_to_auto_impl(&pool, "default", SERIES, MediaType::Series)
            .await
            .unwrap()
    );
}

#[tokio::test]
async fn repeating_a_viewing_action_never_moves_the_status_again() {
    let pool = migrated_pool().await;
    watch(&pool, 2, "Ended", &[1, 2], "2026-01-01T00:00:00.000Z").await;
    let first = series_item(&pool).await.unwrap();
    // The same call again (a retry, a double click): a no-op end to end.
    watch(&pool, 2, "Ended", &[1, 2], "2026-01-01T05:00:00.000Z").await;
    let second = series_item(&pool).await.unwrap();
    assert_eq!(second.status, LibraryStatus::Completed);
    assert_eq!(second.completed_at, first.completed_at);
    assert_eq!(second.updated_at, first.updated_at);
}
