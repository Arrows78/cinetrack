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
