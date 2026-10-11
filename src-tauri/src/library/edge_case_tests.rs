//! Regression scenarios for edge cases of the status model that the random
//! sequences do not reach: a total TMDB never gave, shows seen through the
//! specials, several profiles in one database.

use sqlx::SqlitePool;
use tauri::{Manager, State};

use super::domain::LibraryStatus;
use super::queries::get_impl;
use super::status_transitions_tests::{ep, migrated_pool, show};
use crate::models::MediaType;
use crate::progress::{apply_episodes_impl, refresh_tracked_series_status};

const SERIES: i64 = 9;

async fn status(pool: &SqlitePool) -> Option<LibraryStatus> {
    get_impl(pool, "default", SERIES, MediaType::Series)
        .await
        .unwrap()
        .map(|item| item.status)
}

#[tokio::test]
async fn a_total_tmdb_never_gave_cannot_complete_a_series_through_a_refresh() {
    let pool = migrated_pool().await;
    let app = tauri::test::mock_app();
    app.manage(pool.clone());
    // The viewer watches two episodes while TMDB's episode count is unknown:
    // the cache has to remember it does not know the length.
    let mut unknown = show(SERIES, 0, "Returning Series");
    unknown.number_of_episodes = None;
    apply_episodes_impl(
        &pool,
        "default",
        &unknown,
        &[ep(901, 1), ep(902, 2)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();
    assert_eq!(status(&pool).await, Some(LibraryStatus::Watching));

    // The finale is reported, but still no episode count (the Today Hub and
    // the series page both can find themselves in that position).
    for total in [None, Some(0)] {
        let state: State<'_, SqlitePool> = app.state();
        refresh_tracked_series_status(SERIES, Some("Ended".to_string()), total, state)
            .await
            .unwrap();
        assert_eq!(
            status(&pool).await,
            Some(LibraryStatus::Watching),
            "an unknown length cannot complete a series (total {total:?})"
        );
    }
}

#[tokio::test]
async fn a_date_the_statistics_cannot_read_is_refused_before_anything_is_written() {
    let pool = migrated_pool().await;
    let app = tauri::test::mock_app();
    app.manage(pool.clone());
    let movie = || {
        serde_json::from_value(serde_json::json!({
            "id": 55, "title": "Movie", "posterPath": null, "backdropPath": null,
            "runtime": 100, "year": 2020, "rating": null, "genres": []
        }))
        .unwrap()
    };

    let refused = crate::progress::toggle_movie_seen(
        movie(),
        true,
        "yesterday".to_string(),
        None,
        app.state(),
    )
    .await
    .unwrap_err();
    assert_eq!(refused.status, Some(400));
    let refused = apply_episodes_impl(
        &pool,
        "default",
        &show(SERIES, 3, "Ended"),
        &[ep(901, 1)],
        true,
        "2026-13-45",
    )
    .await
    .unwrap_err();
    assert_eq!(refused.status, Some(400));
    let mut own_date = ep(902, 2);
    own_date.watched_at = Some("garbage".to_string());
    let refused = apply_episodes_impl(
        &pool,
        "default",
        &show(SERIES, 3, "Ended"),
        &[own_date],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap_err();
    assert_eq!(refused.status, Some(400));

    for table in [
        "viewing_events",
        "seen_movies",
        "episode_progress",
        "library_items",
    ] {
        let rows: i64 =
            sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT COUNT(*) FROM {table}")))
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(rows, 0, "{table}");
    }
}

#[tokio::test]
async fn a_negative_rewatch_count_is_a_bad_request_and_changes_nothing() {
    let pool = migrated_pool().await;
    let refused = super::repository::upsert_impl(
        &pool,
        super::status_transitions_tests::show_media(SERIES),
        super::models::LibraryPatch {
            rewatch_count: Some(-1),
            ..Default::default()
        },
        "default",
    )
    .await
    .unwrap_err();
    assert_eq!(refused.status, Some(400));
    assert_eq!(status(&pool).await, None);
}

#[tokio::test]
async fn a_total_that_decreases_is_the_same_total_for_a_watch_and_for_the_refresh_after_it() {
    let pool = migrated_pool().await;
    let app = tauri::test::mock_app();
    app.manage(pool.clone());
    apply_episodes_impl(
        &pool,
        "default",
        &show(SERIES, 5, "Returning Series"),
        &[ep(901, 1), ep(902, 2), ep(903, 3)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    // TMDB now counts four episodes and says the series is over; the viewer
    // watches the fourth.
    apply_episodes_impl(
        &pool,
        "default",
        &show(SERIES, 4, "Ended"),
        &[ep(904, 4)],
        true,
        "2026-01-02T00:00:00.000Z",
    )
    .await
    .unwrap();
    assert_eq!(status(&pool).await, Some(LibraryStatus::Completed));

    // A later refresh that brings no count must not take it back: the watch
    // and the refresh read the same total.
    let state: State<'_, SqlitePool> = app.state();
    refresh_tracked_series_status(SERIES, Some("Ended".to_string()), None, state)
        .await
        .unwrap();
    assert_eq!(status(&pool).await, Some(LibraryStatus::Completed));
}
