use super::*;
use tauri::{Manager, State};

use crate::progress::{
    get_episode_progress, is_movie_seen, list_tracked_series, toggle_episodes_watched,
    toggle_movie_seen,
};

async fn migrated_pool() -> SqlitePool {
    crate::test_support::migrated_pool_with_connections(4).await
}

fn movie(id: i64) -> MovieInput {
    MovieInput {
        id,
        title: "Test Movie".to_string(),
        poster_path: None,
        backdrop_path: None,
        runtime: Some(118),
        year: Some(2020),
        rating: Some(7.5),
        genres: vec!["Drama".to_string()],
    }
}

fn series(id: i64, number_of_episodes: Option<i64>) -> SeriesInput {
    SeriesInput {
        id,
        title: "Test Show".to_string(),
        poster_path: None,
        backdrop_path: None,
        runtime: None,
        number_of_episodes,
        year: Some(2019),
        rating: Some(8.0),
        genres: vec!["Drama".to_string()],
        status: None,
    }
}

fn ended_series(id: i64, number_of_episodes: Option<i64>) -> SeriesInput {
    SeriesInput {
        status: Some("Ended".to_string()),
        ..series(id, number_of_episodes)
    }
}

fn episode(id: i64, episode_number: i64) -> EpisodeInput {
    EpisodeInput {
        id,
        season_number: 1,
        episode_number,
        runtime: None,
        watched_at: None,
    }
}

// Seeded directly with SQL rather than through library::upsert_impl
// (private to that module) — these tests only care about the status
// column an existing entry starts with and ends up at.
async fn seed_library_status(pool: &SqlitePool, media_id: i64, media_type: &str, status: &str) {
    sqlx::query(
        "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at)
         VALUES ($1,'default',$2,$3,'Test',$4,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')",
    )
    .bind(new_uuid())
    .bind(media_id)
    .bind(media_type)
    .bind(status)
    .execute(pool)
    .await
    .unwrap();
}

async fn library_status(pool: &SqlitePool, media_id: i64, media_type: &str) -> Option<String> {
    sqlx::query_scalar("SELECT status FROM library_items WHERE media_id = $1 AND media_type = $2")
        .bind(media_id)
        .bind(media_type)
        .fetch_optional(pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn marking_a_movie_seen_auto_completes_an_existing_library_entry() {
    let pool = migrated_pool().await;
    seed_library_status(&pool, 55, "movie", "planned").await;

    toggle_movie_seen_impl(
        &pool,
        "default",
        movie(55),
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    assert_eq!(
        library_status(&pool, 55, "movie").await,
        Some("completed".to_string())
    );
}

#[tokio::test]
async fn marking_a_movie_unseen_never_touches_the_library_status() {
    let pool = migrated_pool().await;
    seed_library_status(&pool, 55, "movie", "completed").await;

    toggle_movie_seen_impl(
        &pool,
        "default",
        movie(55),
        false,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    assert_eq!(
        library_status(&pool, 55, "movie").await,
        Some("completed".to_string())
    );
}

#[tokio::test]
async fn marking_a_movie_seen_creates_a_library_entry_if_none_exists() {
    let pool = migrated_pool().await;

    toggle_movie_seen_impl(
        &pool,
        "default",
        movie(55),
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    assert_eq!(
        library_status(&pool, 55, "movie").await,
        Some("completed".to_string())
    );
}

#[tokio::test]
async fn marking_a_movie_seen_with_a_note_stores_it_on_the_viewing_event_and_history() {
    let pool = migrated_pool().await;

    toggle_movie_seen_with_note_impl(
        &pool,
        "default",
        movie(55),
        true,
        "2026-01-01T00:00:00.000Z",
        Some("Loved the twist ending".to_string()),
    )
    .await
    .unwrap();

    let event_note: Option<String> =
        sqlx::query_scalar("SELECT note FROM viewing_events WHERE media_id = 55")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(event_note.as_deref(), Some("Loved the twist ending"));

    let metadata_raw: String =
        sqlx::query_scalar("SELECT metadata FROM activity_log WHERE media_id = 55")
            .fetch_one(&pool)
            .await
            .unwrap();
    let metadata: serde_json::Value = serde_json::from_str(&metadata_raw).unwrap();
    assert_eq!(metadata["note"], "Loved the twist ending");
}

#[tokio::test]
async fn a_movie_toggle_keeps_a_catalogue_snapshot_in_its_history_entry() {
    let pool = migrated_pool().await;
    let mut input = movie(56);
    input.runtime = Some(111);
    input.genres = vec!["Drama".to_string()];

    for watched in [true, false] {
        toggle_movie_seen_impl(
            &pool,
            "default",
            input.clone(),
            watched,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();
    }

    let rows: Vec<String> = sqlx::query_scalar(
        "SELECT metadata FROM activity_log WHERE media_id = 56 AND action LIKE 'movie:%'",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(rows.len(), 2);
    for raw in rows {
        let metadata: serde_json::Value = serde_json::from_str(&raw).unwrap();
        let snapshot = &metadata["media"];
        assert_eq!(snapshot["title"], input.title.as_str());
        assert_eq!(snapshot["runtime"], 111);
        assert_eq!(snapshot["genres"], serde_json::json!(["Drama"]));
    }
}

#[tokio::test]
async fn unwatching_a_movie_never_stores_a_note_even_if_one_is_passed() {
    let pool = migrated_pool().await;
    toggle_movie_seen_impl(
        &pool,
        "default",
        movie(55),
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    toggle_movie_seen_with_note_impl(
        &pool,
        "default",
        movie(55),
        false,
        "2026-01-02T00:00:00.000Z",
        Some("should be ignored".to_string()),
    )
    .await
    .unwrap();

    let event_note: Option<String> = sqlx::query_scalar(
        "SELECT note FROM viewing_events WHERE media_id = 55 AND event_type = 'unwatched'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(event_note, None);
}

#[tokio::test]
async fn watching_the_first_episode_auto_sets_an_existing_library_entry_to_watching() {
    let pool = migrated_pool().await;
    seed_library_status(&pool, 9, "series", "planned").await;
    let s = series(9, Some(3));

    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(1, 1)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    assert_eq!(
        library_status(&pool, 9, "series").await,
        Some("watching".to_string())
    );
}

#[tokio::test]
async fn finishing_every_episode_auto_completes_an_existing_library_entry() {
    let pool = migrated_pool().await;
    seed_library_status(&pool, 9, "series", "watching").await;
    let s = ended_series(9, Some(2));

    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(1, 1), episode(2, 2)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    assert_eq!(
        library_status(&pool, 9, "series").await,
        Some("completed".to_string())
    );
}

#[tokio::test]
async fn a_zero_runtime_from_tmdb_still_marks_the_title_watched() {
    // TMDB reports 0 for an unknown runtime; viewing_events only takes
    // NULL or a positive duration.
    let pool = migrated_pool().await;
    toggle_movie_seen_impl(
        &pool,
        "default",
        MovieInput {
            runtime: Some(0),
            ..movie(55)
        },
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();
    apply_episodes_impl(
        &pool,
        "default",
        &SeriesInput {
            runtime: Some(0),
            ..series(9, Some(2))
        },
        &[EpisodeInput {
            runtime: Some(0),
            ..episode(1, 1)
        }],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    let durations: Vec<(Option<i64>,)> =
        sqlx::query_as("SELECT duration_minutes FROM viewing_events")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(durations, vec![(None,), (None,)]);
}

#[tokio::test]
async fn specials_never_count_toward_completing_a_series() {
    let pool = migrated_pool().await;
    seed_library_status(&pool, 9, "series", "watching").await;
    let special = |id, episode_number| EpisodeInput {
        season_number: 0,
        ..episode(id, episode_number)
    };

    apply_episodes_impl(
        &pool,
        "default",
        &ended_series(9, Some(2)),
        &[episode(1, 1), special(50, 1)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    assert_eq!(
        library_status(&pool, 9, "series").await,
        Some("watching".to_string())
    );
    let tracked = list_tracked_series_impl(&pool, "default").await.unwrap();
    assert_eq!(tracked[0].watched_episodes, 1);
}

#[tokio::test]
async fn catching_up_on_an_ongoing_series_does_not_complete_it() {
    let pool = migrated_pool().await;
    seed_library_status(&pool, 9, "series", "watching").await;
    let s = SeriesInput {
        status: Some("Returning Series".to_string()),
        ..series(9, Some(2))
    };

    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(1, 1), episode(2, 2)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    assert_eq!(
        library_status(&pool, 9, "series").await,
        Some("watching".to_string())
    );
}

#[tokio::test]
async fn auto_sync_never_downgrades_a_manually_completed_series() {
    let pool = migrated_pool().await;
    seed_library_status(&pool, 9, "series", "completed").await;
    let s = series(9, Some(3));

    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(1, 1)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    assert_eq!(
        library_status(&pool, 9, "series").await,
        Some("completed".to_string())
    );
}

#[tokio::test]
async fn watching_the_first_episode_with_no_prior_library_entry_creates_one_as_watching() {
    let pool = migrated_pool().await;
    let s = series(9, Some(3));

    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(1, 1)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    assert_eq!(
        library_status(&pool, 9, "series").await,
        Some("watching".to_string())
    );
}

#[tokio::test]
async fn a_series_with_unknown_episode_count_never_auto_completes_from_watched_count_alone() {
    let pool = migrated_pool().await;
    // number_of_episodes: None — must never auto-complete purely from
    // the watched count. Status advances to Watching, never straight to
    // Completed, regardless of how many episodes get marked watched.
    let s = series(9, None);

    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(1, 1), episode(2, 2), episode(3, 3)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    assert_eq!(
        library_status(&pool, 9, "series").await,
        Some("watching".to_string())
    );
}

#[tokio::test]
async fn a_series_reporting_zero_total_episodes_registers_as_watching_not_completed() {
    let pool = migrated_pool().await;
    // number_of_episodes: Some(0) — distinct from the `None` case above:
    // here the TMDB count is known but degenerate. `total > 0` must
    // still gate the Completed branch, or a single watched episode
    // would read as "0/0 = already done".
    let s = series(9, Some(0));

    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(1, 1)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    assert_eq!(
        library_status(&pool, 9, "series").await,
        Some("watching".to_string())
    );
}

#[tokio::test]
async fn a_later_call_with_a_smaller_or_unknown_episode_count_never_regresses_total_episodes() {
    let pool = migrated_pool().await;
    // First call reports the real total (20). A later call passing None
    // (e.g. a caller that never fetched full series details) must not
    // shrink total_episodes back down to whatever's watched so far —
    // that previously let watched_episodes end up exceeding the stored
    // total and show as a >100% progress bar.
    let s20 = series(9, Some(20));
    apply_episodes_impl(
        &pool,
        "default",
        &s20,
        &[episode(1, 1), episode(2, 2)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    let s_unknown = series(9, None);
    apply_episodes_impl(
        &pool,
        "default",
        &s_unknown,
        &[episode(3, 3)],
        true,
        "2026-01-02T00:00:00.000Z",
    )
    .await
    .unwrap();

    let tracked = list_tracked_series_impl(&pool, "default").await.unwrap();
    let entry = tracked.iter().find(|item| item.series_id == 9).unwrap();
    assert_eq!(entry.watched_episodes, 3);
    assert_eq!(entry.total_episodes, 20);
}

#[tokio::test]
async fn unwatching_an_episode_never_auto_advances_an_existing_planned_status() {
    let pool = migrated_pool().await;
    let s = series(9, Some(3));
    // Two episodes already watched via some independent path (seeded
    // directly, bypassing apply_episodes_impl so this doesn't itself
    // trigger an auto-sync) while the library entry is "planned".
    for episode_id in [1, 2] {
        sqlx::query(
            "INSERT INTO episode_progress (uuid, profile_id, series_id, episode_id, season_number, episode_number, watched, watched_at, created_at, updated_at)
             VALUES ($1, 'default', 9, $2, 1, $2, 1, 'now', 'now', 'now')",
        )
        .bind(new_uuid())
        .bind(episode_id)
        .execute(&pool)
        .await
        .unwrap();
    }
    seed_library_status(&pool, 9, "series", "planned").await;

    // Unwatching one episode still leaves one watched, which alone
    // computes target=Watching (rank 1) — higher than the current
    // Planned rank (0). This must not silently advance the status as a
    // side effect of an unwatch action; it must stay untouched.
    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(1, 1)],
        false,
        "2026-01-01T00:00:01.000Z",
    )
    .await
    .unwrap();

    assert_eq!(
        library_status(&pool, 9, "series").await,
        Some("planned".to_string())
    );
}

#[tokio::test]
async fn unwatching_an_episode_takes_an_automatic_completed_back_to_watching() {
    let pool = migrated_pool().await;
    let s = ended_series(9, Some(2));
    // Watching both episodes of a finished series auto-creates the
    // library entry as "completed" (2/2 watched).
    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(1, 1), episode(2, 2)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();
    assert_eq!(
        library_status(&pool, 9, "series").await,
        Some("completed".to_string())
    );

    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(1, 1)],
        false,
        "2026-01-01T00:00:01.000Z",
    )
    .await
    .unwrap();
    // 1/2 watched: the automatic Completed no longer holds.
    assert_eq!(
        library_status(&pool, 9, "series").await,
        Some("watching".to_string())
    );

    // Nothing watched at all: back to Planned, like a title never started.
    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(2, 2)],
        false,
        "2026-01-01T00:00:02.000Z",
    )
    .await
    .unwrap();
    assert_eq!(
        library_status(&pool, 9, "series").await,
        Some("planned".to_string())
    );

    // Watching again follows it forward once more.
    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(1, 1), episode(2, 2)],
        true,
        "2026-01-01T00:00:03.000Z",
    )
    .await
    .unwrap();
    assert_eq!(
        library_status(&pool, 9, "series").await,
        Some("completed".to_string())
    );
}

#[tokio::test]
async fn unwatching_never_touches_a_completed_status_the_viewer_chose() {
    let pool = migrated_pool().await;
    let s = ended_series(9, Some(2));
    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(1, 1), episode(2, 2)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();
    // The viewer sets Completed by hand: from now on it is a decision.
    sqlx::query("UPDATE library_items SET status_origin = 'manual' WHERE media_id = 9")
        .execute(&pool)
        .await
        .unwrap();

    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(1, 1)],
        false,
        "2026-01-01T00:00:01.000Z",
    )
    .await
    .unwrap();

    assert_eq!(
        library_status(&pool, 9, "series").await,
        Some("completed".to_string())
    );
}

#[tokio::test]
async fn toggles_a_movie_seen_through_a_real_insert_delete_round_trip() {
    let pool = migrated_pool().await;

    toggle_movie_seen_impl(
        &pool,
        "default",
        movie(55),
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();
    assert!(is_movie_seen_impl(&pool, "default", 55).await.unwrap());

    let rows: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM seen_movies WHERE movie_id = 55")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(rows.0, 1);

    toggle_movie_seen_impl(
        &pool,
        "default",
        movie(55),
        false,
        "2026-01-01T00:00:01.000Z",
    )
    .await
    .unwrap();
    assert!(!is_movie_seen_impl(&pool, "default", 55).await.unwrap());
    let rows: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM seen_movies WHERE movie_id = 55")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(rows.0, 0);
}

#[tokio::test]
async fn records_a_viewing_event_and_history_entry_alongside_the_seen_toggle() {
    let pool = migrated_pool().await;
    toggle_movie_seen_impl(
        &pool,
        "default",
        movie(55),
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    let event: (String, Option<i64>) = sqlx::query_as(
        "SELECT event_type, duration_minutes FROM viewing_events WHERE media_id = 55",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(event.0, "watched");
    assert_eq!(event.1, Some(118));

    let history_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM activity_log WHERE action = 'movie:watched'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(history_count.0, 1);
}

#[tokio::test]
async fn does_not_reapply_an_already_applied_movie_toggle() {
    let pool = migrated_pool().await;
    toggle_movie_seen_impl(
        &pool,
        "default",
        movie(55),
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();
    // Repeating the same "watched" call (retry, double invoke) must be a
    // no-op — not a second viewing_events/activity_log row.
    toggle_movie_seen_impl(
        &pool,
        "default",
        movie(55),
        true,
        "2026-01-01T00:00:01.000Z",
    )
    .await
    .unwrap();

    let event_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM viewing_events WHERE media_id = 55")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(event_count.0, 1);

    let history_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM activity_log WHERE action = 'movie:watched'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(history_count.0, 1);

    // Repeating "unwatched" while already unwatched is likewise a no-op.
    toggle_movie_seen_impl(
        &pool,
        "default",
        movie(55),
        false,
        "2026-01-01T00:00:02.000Z",
    )
    .await
    .unwrap();
    toggle_movie_seen_impl(
        &pool,
        "default",
        movie(55),
        false,
        "2026-01-01T00:00:03.000Z",
    )
    .await
    .unwrap();

    let unwatched_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM viewing_events WHERE media_id = 55 AND event_type = 'unwatched'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(unwatched_count.0, 1);
}

// Unlike the sequential no-op test above (each call awaited to
// completion before the next starts), this fires both calls at once so
// their BEGIN IMMEDIATE transactions genuinely contend for SQLite's
// write lock — the scenario the sequential test can't exercise. Before
// moving the idempotency check inside a BEGIN IMMEDIATE transaction,
// both calls could read "not yet watched" off their own snapshot before
// either took the write lock, and both would insert their own
// viewing_events/activity_log row for what's really one logical
// transition.
#[tokio::test]
async fn two_concurrent_movie_toggles_produce_only_one_viewing_event() {
    let pool = migrated_pool().await;

    let (first, second) = tokio::join!(
        toggle_movie_seen_impl(
            &pool,
            "default",
            movie(77),
            true,
            "2026-01-01T00:00:00.000Z"
        ),
        toggle_movie_seen_impl(
            &pool,
            "default",
            movie(77),
            true,
            "2026-01-01T00:00:00.001Z"
        ),
    );
    first.unwrap();
    second.unwrap();

    let event_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM viewing_events WHERE media_id = 77")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(event_count.0, 1);

    let history_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM activity_log WHERE action = 'movie:watched'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(history_count.0, 1);
}

#[tokio::test]
async fn marks_an_episode_watched_and_reflects_it_in_progress_and_tracked_series() {
    let pool = migrated_pool().await;
    let s = series(9, None);

    let changed = apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(100, 1)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();
    assert_eq!(changed, 1);

    let progress = get_episode_progress_impl(&pool, "default", 9)
        .await
        .unwrap();
    assert_eq!(progress.len(), 1);
    assert_eq!(progress[0].episode_id, 100);

    let tracked = list_tracked_series_impl(&pool, "default").await.unwrap();
    let entry = tracked.iter().find(|item| item.series_id == 9).unwrap();
    assert_eq!(entry.watched_episodes, 1);
}

#[tokio::test]
async fn a_series_removed_from_the_library_leaves_the_tracked_list_but_keeps_its_progress() {
    let pool = migrated_pool().await;
    let s = series(9, None);
    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(100, 1)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();
    assert!(
        list_tracked_series_impl(&pool, "default")
            .await
            .unwrap()
            .iter()
            .any(|item| item.series_id == 9)
    );

    sqlx::query("DELETE FROM library_items WHERE media_id = 9 AND media_type = 'series'")
        .execute(&pool)
        .await
        .unwrap();

    assert!(
        !list_tracked_series_impl(&pool, "default")
            .await
            .unwrap()
            .iter()
            .any(|item| item.series_id == 9),
        "a series the viewer no longer follows must not feed reminders or Watch Next"
    );
    assert_eq!(
        get_episode_progress_impl(&pool, "default", 9)
            .await
            .unwrap()
            .len(),
        1,
        "the episode tracking is kept"
    );

    seed_library_status(&pool, 9, "series", "planned").await;
    let back = list_tracked_series_impl(&pool, "default").await.unwrap();
    assert_eq!(
        back.iter()
            .find(|item| item.series_id == 9)
            .map(|i| i.watched_episodes),
        Some(1),
        "re-adding the series brings its progress back"
    );
}

#[tokio::test]
async fn watch_dates_are_stored_in_canonical_utc_form() {
    let pool = migrated_pool().await;
    toggle_movie_seen_impl(
        &pool,
        "default",
        movie(1),
        true,
        "2026-03-01T11:00:00+01:00",
    )
    .await
    .unwrap();
    apply_episodes_impl(
        &pool,
        "default",
        &series(9, None),
        &[episode(100, 1)],
        true,
        "2026-03-02",
    )
    .await
    .unwrap();

    let dates: Vec<(String,)> =
        sqlx::query_as("SELECT watched_at FROM viewing_events ORDER BY media_type")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(
        dates.iter().map(|d| d.0.as_str()).collect::<Vec<_>>(),
        ["2026-03-01T10:00:00.000Z", "2026-03-02T00:00:00.000Z"]
    );
    let seen: String = sqlx::query_scalar("SELECT watched_at FROM seen_movies")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(seen, "2026-03-01T10:00:00.000Z");
    let progress: String = sqlx::query_scalar("SELECT watched_at FROM episode_progress")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(progress, "2026-03-02T00:00:00.000Z");
}

#[tokio::test]
async fn does_not_reapply_an_already_applied_episode() {
    let pool = migrated_pool().await;
    let s = series(9, None);
    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(100, 1)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    let changed = apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(100, 1)],
        true,
        "2026-01-01T00:00:01.000Z",
    )
    .await
    .unwrap();
    assert_eq!(changed, 0);
}

// Same scenario as two_concurrent_movie_toggles_produce_only_one_viewing_event
// above, for the episode/season/series-marking path (apply_episodes_impl
// is a thin wrapper over apply_episodes_and_log_impl, so this covers
// "mark whole season/series watched" too, not just a single episode).
#[tokio::test]
async fn two_concurrent_episode_applies_produce_only_one_viewing_event() {
    let pool = migrated_pool().await;
    let s = series(9, None);
    let episodes = [episode(100, 1)];

    let (first, second) = tokio::join!(
        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &episodes,
            true,
            "2026-01-01T00:00:00.000Z"
        ),
        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &episodes,
            true,
            "2026-01-01T00:00:00.001Z"
        ),
    );
    let changed = first.unwrap() + second.unwrap();
    assert_eq!(changed, 1);

    let event_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM viewing_events WHERE episode_id = 100")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(event_count.0, 1);
}

#[tokio::test]
async fn computes_watched_episodes_via_the_tracked_series_join_not_a_stored_counter() {
    let pool = migrated_pool().await;
    let s = series(9, Some(3));

    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(1, 1)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();
    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(2, 2)],
        true,
        "2026-01-01T00:00:01.000Z",
    )
    .await
    .unwrap();

    let tracked = list_tracked_series_impl(&pool, "default").await.unwrap();
    let entry = tracked.iter().find(|item| item.series_id == 9).unwrap();
    assert_eq!(entry.total_episodes, 3);
    assert_eq!(entry.watched_episodes, 2);

    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(1, 1)],
        false,
        "2026-01-01T00:00:02.000Z",
    )
    .await
    .unwrap();
    let updated = list_tracked_series_impl(&pool, "default").await.unwrap();
    let entry = updated.iter().find(|item| item.series_id == 9).unwrap();
    assert_eq!(entry.watched_episodes, 1);
}

#[tokio::test]
async fn apply_episodes_only_writes_rows_that_actually_changed_state() {
    let pool = migrated_pool().await;
    let s = series(9, None);

    let first = apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(1, 1), episode(2, 2)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();
    assert_eq!(first, 2);

    let second = apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(1, 1), episode(2, 2)],
        true,
        "2026-01-01T00:00:01.000Z",
    )
    .await
    .unwrap();
    assert_eq!(second, 0);

    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM episode_progress WHERE series_id = 9")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count.0, 2);
}

#[tokio::test]
async fn marking_a_whole_season_watched_applies_every_episode_in_one_transaction() {
    let pool = migrated_pool().await;
    let s = series(9, None);
    let season_episodes = vec![episode(1, 1), episode(2, 2), episode(3, 3)];

    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &season_episodes,
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    let progress = get_episode_progress_impl(&pool, "default", 9)
        .await
        .unwrap();
    assert_eq!(progress.len(), 3);
}

#[tokio::test]
async fn apply_episodes_does_not_log_history() {
    let pool = migrated_pool().await;
    // Pre-seed the library entry so watching an episode doesn't also
    // auto-create one (which would log its own LibraryAdd entry,
    // unrelated to what this test checks).
    seed_library_status(&pool, 9, "series", "planned").await;
    let s = series(9, None);
    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(1, 1)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    let history_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM activity_log")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(history_count.0, 0);
}

#[tokio::test]
async fn apply_episodes_and_log_impl_writes_the_history_entry_in_the_same_transaction() {
    let pool = migrated_pool().await;
    // Pre-seed so the auto-create's own LibraryAdd entry doesn't also
    // land in activity_log and interfere with the single-row fetch below.
    seed_library_status(&pool, 9, "series", "planned").await;
    let s = series(9, None);
    let history = EpisodeHistoryInput {
        action: HistoryAction::EpisodeWatched,
        season_number: Some(1),
        episode_number: Some(1),
        episode_title: Some("Pilot".to_string()),
    };

    let changed = apply_episodes_and_log_impl(
        &pool,
        "default",
        &s,
        &[episode(100, 1)],
        true,
        "2026-01-01T00:00:00.000Z",
        Some(history),
        Some("Great pilot!".to_string()),
    )
    .await
    .unwrap();
    assert_eq!(changed, 1);

    let row: (String, Option<String>, Option<String>) = sqlx::query_as(
        "SELECT action, episode_title, metadata FROM activity_log WHERE media_id = 9",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(row.0, "episode:watched");
    assert_eq!(row.1.as_deref(), Some("Pilot"));
    let metadata: serde_json::Value = serde_json::from_str(&row.2.unwrap()).unwrap();
    assert_eq!(metadata["episodeCount"], 1);
    assert_eq!(metadata["note"], "Great pilot!");

    let event_note: Option<String> =
        sqlx::query_scalar("SELECT note FROM viewing_events WHERE media_id = 9")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(event_note.as_deref(), Some("Great pilot!"));
}

#[tokio::test]
async fn apply_episodes_and_log_impl_skips_history_when_nothing_changed() {
    let pool = migrated_pool().await;
    seed_library_status(&pool, 9, "series", "planned").await;
    let s = series(9, None);
    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(100, 1)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    let history = EpisodeHistoryInput {
        action: HistoryAction::EpisodeWatched,
        season_number: Some(1),
        episode_number: Some(1),
        episode_title: Some("Pilot".to_string()),
    };
    let changed = apply_episodes_and_log_impl(
        &pool,
        "default",
        &s,
        &[episode(100, 1)],
        true,
        "2026-01-01T00:00:01.000Z",
        Some(history),
        None,
    )
    .await
    .unwrap();
    assert_eq!(changed, 0);

    let history_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM activity_log")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(history_count.0, 0);
}

#[tokio::test]
async fn refresh_tracked_series_status_writes_back_a_fresh_tmdb_status() {
    let pool = migrated_pool().await;
    let mut s = series(9, None);
    s.status = Some("Returning Series".to_string());
    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(100, 1)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    refresh_tracked_series_status_impl(&pool, "default", 9, Some("Ended".to_string()), None)
        .await
        .unwrap();

    let tracked = list_tracked_series_impl(&pool, "default").await.unwrap();
    let entry = tracked.iter().find(|item| item.series_id == 9).unwrap();
    assert_eq!(entry.status.as_deref(), Some("Ended"));
}

#[tokio::test]
async fn a_refresh_without_a_status_keeps_the_cached_one() {
    let pool = migrated_pool().await;
    apply_episodes_impl(
        &pool,
        "default",
        &ended_series(9, Some(3)),
        &[episode(1, 1)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    refresh_tracked_series_status_impl(&pool, "default", 9, None, Some(3))
        .await
        .unwrap();

    let tracked = list_tracked_series_impl(&pool, "default").await.unwrap();
    let entry = tracked.iter().find(|item| item.series_id == 9).unwrap();
    assert_eq!(entry.status.as_deref(), Some("Ended"));
}

#[tokio::test]
async fn refresh_reopens_a_completed_series_when_more_episodes_than_watched_exist() {
    let pool = migrated_pool().await;
    apply_episodes_impl(
        &pool,
        "default",
        &ended_series(9, Some(2)),
        &[episode(1, 1), episode(2, 2)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();
    assert_eq!(
        library_status(&pool, 9, "series").await,
        Some("completed".to_string())
    );

    refresh_tracked_series_status_impl(&pool, "default", 9, None, Some(3))
        .await
        .unwrap();
    assert_eq!(
        library_status(&pool, 9, "series").await,
        Some("watching".to_string())
    );

    // A later manual Completed is not reopened while nothing new exists.
    refresh_tracked_series_status_impl(&pool, "default", 9, None, Some(2))
        .await
        .unwrap();
    sqlx::query(
        "UPDATE library_items SET status = 'completed', status_origin = 'manual' WHERE media_id = 9",
    )
    .execute(&pool)
        .await
        .unwrap();
    refresh_tracked_series_status_impl(&pool, "default", 9, None, Some(2))
        .await
        .unwrap();
    assert_eq!(
        library_status(&pool, 9, "series").await,
        Some("completed".to_string())
    );
}

#[tokio::test]
async fn reopening_a_completed_series_clears_its_completion_date() {
    let pool = migrated_pool().await;
    apply_episodes_impl(
        &pool,
        "default",
        &ended_series(9, Some(2)),
        &[episode(1, 1), episode(2, 2)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();
    let completed_at: Option<String> =
        sqlx::query_scalar("SELECT completed_at FROM library_items WHERE media_id = 9")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(completed_at.is_some());

    refresh_tracked_series_status_impl(&pool, "default", 9, None, Some(3))
        .await
        .unwrap();

    let (status, completed_at): (String, Option<String>) =
        sqlx::query_as("SELECT status, completed_at FROM library_items WHERE media_id = 9")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(status, "watching");
    assert_eq!(
        completed_at, None,
        "a series that is Watching again must not keep its completion date"
    );
}

async fn status_origin(pool: &SqlitePool, media_id: i64) -> String {
    sqlx::query_scalar("SELECT status_origin FROM library_items WHERE media_id = $1")
        .bind(media_id)
        .fetch_one(pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn refresh_never_reopens_a_completed_status_the_viewer_chose() {
    let pool = migrated_pool().await;
    // Two of three episodes watched, then the viewer sets "Completed"
    // by hand (e.g. they dropped the last one but consider it done).
    apply_episodes_impl(
        &pool,
        "default",
        &series(9, Some(3)),
        &[episode(1, 1), episode(2, 2)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();
    sqlx::query(
        "UPDATE library_items SET status = 'completed', status_origin = 'manual' WHERE media_id = 9",
    )
    .execute(&pool)
    .await
    .unwrap();

    refresh_tracked_series_status_impl(&pool, "default", 9, None, Some(3))
        .await
        .unwrap();
    refresh_tracked_series_status_impl(&pool, "default", 9, None, Some(8))
        .await
        .unwrap();

    assert_eq!(
        library_status(&pool, 9, "series").await,
        Some("completed".to_string()),
        "a status the viewer picked is not an automatic one, so a TMDB refresh must not reopen it"
    );
}

#[tokio::test]
async fn refresh_reopens_an_auto_completed_series_and_keeps_it_automatic() {
    let pool = migrated_pool().await;
    apply_episodes_impl(
        &pool,
        "default",
        &ended_series(9, Some(2)),
        &[episode(1, 1), episode(2, 2)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();
    assert_eq!(status_origin(&pool, 9).await, "auto");

    refresh_tracked_series_status_impl(&pool, "default", 9, None, Some(3))
        .await
        .unwrap();

    assert_eq!(
        library_status(&pool, 9, "series").await,
        Some("watching".to_string())
    );
    assert_eq!(status_origin(&pool, 9).await, "auto");
}

#[tokio::test]
async fn refresh_leaves_a_completed_entry_without_tracked_progress_alone() {
    let pool = migrated_pool().await;
    seed_library_status(&pool, 9, "series", "completed").await;
    sqlx::query(
        "INSERT INTO tracked_series (uuid, profile_id, series_id, title, total_episodes, created_at, updated_at)
         VALUES ('t', 'default', 9, 'Show', 2, 'now', 'now')",
    )
    .execute(&pool)
    .await
    .unwrap();

    refresh_tracked_series_status_impl(&pool, "default", 9, None, Some(5))
        .await
        .unwrap();
    assert_eq!(
        library_status(&pool, 9, "series").await,
        Some("completed".to_string())
    );
}

#[tokio::test]
async fn refresh_tracked_series_status_is_a_no_op_when_the_status_is_unchanged() {
    let pool = migrated_pool().await;
    let mut s = series(9, None);
    s.status = Some("Returning Series".to_string());
    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(100, 1)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    // Same status passed again, no total_episodes correction — should
    // hit the early "nothing changed" return rather than issuing a write.
    refresh_tracked_series_status_impl(
        &pool,
        "default",
        9,
        Some("Returning Series".to_string()),
        None,
    )
    .await
    .unwrap();

    let tracked = list_tracked_series_impl(&pool, "default").await.unwrap();
    let entry = tracked.iter().find(|item| item.series_id == 9).unwrap();
    assert_eq!(entry.status.as_deref(), Some("Returning Series"));
}

#[tokio::test]
async fn refresh_tracked_series_status_is_a_no_op_for_an_untracked_series() {
    let pool = migrated_pool().await;
    // No tracked_series row exists for series 404 — must not create one.
    refresh_tracked_series_status_impl(&pool, "default", 404, Some("Ended".to_string()), None)
        .await
        .unwrap();

    let tracked = list_tracked_series_impl(&pool, "default").await.unwrap();
    assert!(tracked.iter().all(|item| item.series_id != 404));
}

#[tokio::test]
async fn refresh_tracked_series_status_corrects_total_episodes_downward_unlike_the_toggle_time_max_upsert()
 {
    let pool = migrated_pool().await;
    // TMDB's number_of_episodes (10) inflates total_episodes even though
    // only 1 episode is actually watched/aired so far.
    let mut s = series(9, Some(10));
    s.status = Some("Returning Series".to_string());
    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(100, 1)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    // The series detail page recomputed the real aired count (2) and
    // writes it back — a plain correction, not blocked by the ratchet
    // that ordinary toggles are subject to.
    refresh_tracked_series_status_impl(
        &pool,
        "default",
        9,
        Some("Returning Series".to_string()),
        Some(2),
    )
    .await
    .unwrap();

    let tracked = list_tracked_series_impl(&pool, "default").await.unwrap();
    let entry = tracked.iter().find(|item| item.series_id == 9).unwrap();
    assert_eq!(entry.total_episodes, 2);
}

#[tokio::test]
async fn refresh_never_stores_a_total_below_the_episodes_already_watched() {
    let pool = migrated_pool().await;
    let mut s = series(9, Some(10));
    s.status = Some("Returning Series".to_string());
    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(100, 1), episode(101, 2), episode(102, 3)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    // A degraded TMDB response (a season that came back with no
    // episodes) makes the page recompute a total of 0: no count at all,
    // so the total TMDB gave before is kept rather than replaced by the
    // watched count (which would read as "caught up").
    refresh_tracked_series_status_impl(
        &pool,
        "default",
        9,
        Some("Returning Series".to_string()),
        Some(0),
    )
    .await
    .unwrap();

    let tracked = list_tracked_series_impl(&pool, "default").await.unwrap();
    let entry = tracked.iter().find(|item| item.series_id == 9).unwrap();
    assert_eq!(entry.total_episodes, 10);

    // A real count below what is watched is lifted to the watched count.
    refresh_tracked_series_status_impl(
        &pool,
        "default",
        9,
        Some("Returning Series".to_string()),
        Some(2),
    )
    .await
    .unwrap();
    let tracked = list_tracked_series_impl(&pool, "default").await.unwrap();
    let entry = tracked.iter().find(|item| item.series_id == 9).unwrap();
    assert_eq!(entry.total_episodes, 3);
}

// --- tauri::command wrapper coverage -----------------------------
//
// The wrappers above (toggle_movie_seen, toggle_episodes_watched) and a
// couple of the profile_scoped_command!-generated ones just resolve the
// active profile and delegate straight to an already-tested `_impl`
// function, so these are thin happy-path checks that the wrapper wiring
// itself (tauri::State extraction, profile resolution) works — not a
// re-test of the underlying business logic.

#[tokio::test]
async fn toggle_movie_seen_command_marks_a_movie_watched() {
    let pool = migrated_pool().await;
    let app = tauri::test::mock_app();
    app.manage(pool);
    let state: State<'_, SqlitePool> = app.state();

    toggle_movie_seen(
        movie(1),
        true,
        "2026-01-01T00:00:00.000Z".to_string(),
        None,
        state.clone(),
    )
    .await
    .unwrap();

    assert!(is_movie_seen(1, state).await.unwrap());
}

#[tokio::test]
async fn toggle_episodes_watched_command_marks_episodes_watched_and_logs_history() {
    let pool = migrated_pool().await;
    let app = tauri::test::mock_app();
    app.manage(pool);
    let state: State<'_, SqlitePool> = app.state();

    let history = EpisodeHistoryInput {
        action: HistoryAction::EpisodeWatched,
        season_number: Some(1),
        episode_number: Some(1),
        episode_title: Some("Pilot".to_string()),
    };

    let changed = toggle_episodes_watched(
        series(9, None),
        vec![episode(100, 1)],
        true,
        "2026-01-01T00:00:00.000Z".to_string(),
        Some(history),
        None,
        state.clone(),
    )
    .await
    .unwrap();

    assert_eq!(changed, 1);
    let progress = get_episode_progress(9, state).await.unwrap();
    assert_eq!(progress.len(), 1);
}

#[tokio::test]
async fn list_tracked_series_command_returns_a_series_tracked_via_the_toggle_command() {
    let pool = migrated_pool().await;
    let app = tauri::test::mock_app();
    app.manage(pool);
    let state: State<'_, SqlitePool> = app.state();

    toggle_episodes_watched(
        series(9, None),
        vec![episode(100, 1)],
        true,
        "2026-01-01T00:00:00.000Z".to_string(),
        None,
        None,
        state.clone(),
    )
    .await
    .unwrap();

    let tracked = list_tracked_series(state).await.unwrap();
    assert!(tracked.iter().any(|item| item.series_id == 9));
}

/// Every `_impl` fn in this file takes `profile_id` as a plain parameter
/// with no further check of its own — the same pattern flagged in
/// lists::custom's/availability's own cross-profile tests. Unlike
/// those two files, nothing in this one previously proved that marking a
/// movie/episode watched for one profile is actually invisible to
/// another, despite `seen_movies`/`episode_progress`/`tracked_series`
/// all being scoped by a `profile_id` column read from the same
/// untrusted caller-supplied string as everywhere else.
#[tokio::test]
async fn marking_a_movie_and_episodes_watched_is_invisible_to_another_profile() {
    let pool = migrated_pool().await;
    sqlx::query(
        "INSERT INTO profiles (uuid, name, created_at, updated_at)
         VALUES ('other', 'Other', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    )
    .execute(&pool)
    .await
    .unwrap();

    toggle_movie_seen_impl(&pool, "default", movie(1), true, "2026-01-01T00:00:00.000Z")
        .await
        .unwrap();
    let s = series(9, Some(3));
    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(1, 1)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    assert!(is_movie_seen_impl(&pool, "default", 1).await.unwrap());
    assert!(!is_movie_seen_impl(&pool, "other", 1).await.unwrap());

    assert_eq!(
        get_episode_progress_impl(&pool, "default", 9)
            .await
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        get_episode_progress_impl(&pool, "other", 9)
            .await
            .unwrap()
            .len(),
        0
    );

    assert!(
        list_tracked_series_impl(&pool, "default")
            .await
            .unwrap()
            .iter()
            .any(|item| item.series_id == 9)
    );
    assert!(
        !list_tracked_series_impl(&pool, "other")
            .await
            .unwrap()
            .iter()
            .any(|item| item.series_id == 9)
    );
}

#[tokio::test]
async fn sets_and_clears_a_rating_on_a_watched_episode() {
    let pool = migrated_pool().await;
    let s = series(9, None);
    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(100, 1)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    set_episode_rating_impl(&pool, "default", 9, 100, Some(4))
        .await
        .unwrap();
    let progress = get_episode_progress_impl(&pool, "default", 9)
        .await
        .unwrap();
    assert_eq!(progress[0].rating, Some(4));

    set_episode_rating_impl(&pool, "default", 9, 100, None)
        .await
        .unwrap();
    let progress = get_episode_progress_impl(&pool, "default", 9)
        .await
        .unwrap();
    assert_eq!(progress[0].rating, None);
}

#[tokio::test]
async fn rejects_a_rating_outside_1_to_5() {
    let pool = migrated_pool().await;

    let result = set_episode_rating_impl(&pool, "default", 9, 100, Some(0)).await;
    assert!(result.is_err());

    let result = set_episode_rating_impl(&pool, "default", 9, 100, Some(6)).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn rating_a_never_watched_episode_is_a_harmless_no_op() {
    let pool = migrated_pool().await;

    // No episode_progress row exists for (default, 9, 100) — the UPDATE
    // affects zero rows, and that's fine: the frontend only shows the
    // rating control once an episode is already marked watched.
    let result = set_episode_rating_impl(&pool, "default", 9, 100, Some(3)).await;
    assert!(result.is_ok());
    assert!(
        get_episode_progress_impl(&pool, "default", 9)
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn a_rating_never_leaks_across_profiles() {
    let pool = migrated_pool().await;
    let s = series(9, None);
    apply_episodes_impl(
        &pool,
        "default",
        &s,
        &[episode(100, 1)],
        true,
        "2026-01-01T00:00:00.000Z",
    )
    .await
    .unwrap();

    set_episode_rating_impl(&pool, "other", 9, 100, Some(5))
        .await
        .unwrap();

    let progress = get_episode_progress_impl(&pool, "default", 9)
        .await
        .unwrap();
    assert_eq!(progress[0].rating, None);
}

/// Random but reproducible sequences of watch/unwatch actions (single
/// episodes, a whole season, specials, movies), checking after every
/// step the invariants the rest of the app relies on:
/// - an episode/movie is "seen" exactly when its latest viewing event
///   is a watch, and the event log never repeats the same transition;
/// - the stats overview counts what is actually seen;
/// - a tracked series' watched count ignores specials;
/// - the library status follows auto-sync's rules and never goes down.
#[tokio::test]
async fn random_watch_sequences_keep_progress_events_stats_and_status_consistent() {
    use std::collections::{BTreeSet, HashMap};

    fn rank(status: Option<&str>) -> u8 {
        match status {
            None | Some("planned") => 0,
            Some("watching") => 1,
            Some("completed") => 2,
            Some(other) => panic!("unexpected auto status {other}"),
        }
    }

    // (series id, TMDB status, regular episode count, episodes)
    let catalogue: Vec<(i64, &str, i64, Vec<EpisodeInput>)> = vec![
        (
            9,
            "Ended",
            4,
            vec![
                episode(901, 1),
                episode(902, 2),
                episode(903, 3),
                episode(904, 4),
                EpisodeInput {
                    season_number: 0,
                    ..episode(950, 1)
                },
            ],
        ),
        (
            10,
            "Returning Series",
            3,
            vec![episode(1001, 1), episode(1002, 2), episode(1003, 3)],
        ),
    ];
    let movies = [55_i64, 56];

    for seed in [1_u64, 7, 42, 2026] {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool.clone());
        let mut state = seed;
        let mut next = |bound: u64| {
            state = state
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            (state >> 33) % bound
        };

        let mut seen_episodes: BTreeSet<(i64, i64)> = BTreeSet::new();
        let mut seen_movies: BTreeSet<i64> = BTreeSet::new();
        // Titles that have a library entry (created by their first watch).
        // Every entry here is automatic, so its status must equal the
        // status derived from what is watched right now, in both
        // directions (see library/status.rs).
        let mut in_library: BTreeSet<(i64, &str)> = BTreeSet::new();

        for step in 0..60_u64 {
            let at = format!("2026-01-01T{:02}:{:02}:00.000Z", step / 60, step % 60);
            let watched = next(3) != 0;
            match next(4) {
                0 | 1 => {
                    let (id, status, total, episodes) =
                        &catalogue[next(catalogue.len() as u64) as usize];
                    // One episode, or the whole list (a season/series mark).
                    let picked: Vec<EpisodeInput> = if next(2) == 0 {
                        vec![episodes[next(episodes.len() as u64) as usize].clone()]
                    } else {
                        episodes.clone()
                    };
                    let input = SeriesInput {
                        status: Some(status.to_string()),
                        ..series(*id, Some(*total))
                    };
                    let changed = picked
                        .iter()
                        .any(|ep| seen_episodes.contains(&(*id, ep.id)) != watched);
                    for ep in &picked {
                        if watched {
                            seen_episodes.insert((*id, ep.id));
                        } else {
                            seen_episodes.remove(&(*id, ep.id));
                        }
                    }
                    apply_episodes_impl(&pool, "default", &input, &picked, watched, &at)
                        .await
                        .unwrap();
                    if watched && changed {
                        in_library.insert((*id, "series"));
                    }
                }
                _ => {
                    let id = movies[next(movies.len() as u64) as usize];
                    let changed = seen_movies.contains(&id) != watched;
                    if watched {
                        seen_movies.insert(id);
                    } else {
                        seen_movies.remove(&id);
                    }
                    toggle_movie_seen_impl(&pool, "default", movie(id), watched, &at)
                        .await
                        .unwrap();
                    if watched && changed {
                        in_library.insert((id, "movie"));
                    }
                }
            }

            let context = format!("seed {seed}, step {step}");

            // Seen state == model == latest event, and no repeated transition.
            let events: Vec<(i64, Option<i64>, String)> = sqlx::query_as(
                "SELECT media_id, episode_id, event_type FROM viewing_events
                 ORDER BY watched_at ASC, created_at ASC",
            )
            .fetch_all(&pool)
            .await
            .unwrap();
            let mut last: HashMap<(i64, Option<i64>), String> = HashMap::new();
            for (media_id, episode_id, event_type) in events {
                let previous = last.insert((media_id, episode_id), event_type.clone());
                assert_ne!(
                    previous.as_deref(),
                    Some(event_type.as_str()),
                    "{context}: repeated {event_type} for {media_id}/{episode_id:?}"
                );
            }
            let stored_episodes: BTreeSet<(i64, i64)> = sqlx::query_as(
                "SELECT series_id, episode_id FROM episode_progress WHERE watched = 1",
            )
            .fetch_all(&pool)
            .await
            .unwrap()
            .into_iter()
            .collect();
            assert_eq!(
                stored_episodes, seen_episodes,
                "{context}: episode_progress"
            );
            for (key, event_type) in &last {
                if let (series_id, Some(episode_id)) = key {
                    assert_eq!(
                        event_type == "watched",
                        seen_episodes.contains(&(*series_id, *episode_id)),
                        "{context}: latest event for episode {episode_id}"
                    );
                } else {
                    assert_eq!(
                        event_type == "watched",
                        seen_movies.contains(&key.0),
                        "{context}: latest event for movie {}",
                        key.0
                    );
                }
            }

            // Stats overview counts exactly what's seen.
            let pool_state: State<'_, SqlitePool> = app.state();
            let overview = crate::stats::get_stats_overview(
                "2025-01-01T00:00:00.000Z".to_string(),
                vec![],
                0,
                None,
                pool_state,
            )
            .await
            .unwrap();
            assert_eq!(
                overview.totals.episodes_watched,
                seen_episodes.len() as i64,
                "{context}: stats episodes"
            );
            assert_eq!(
                overview.totals.movies_watched,
                seen_movies.len() as i64,
                "{context}: stats movies"
            );

            // Tracked series ignore specials.
            for tracked in list_tracked_series_impl(&pool, "default").await.unwrap() {
                let regular = seen_episodes
                    .iter()
                    .filter(|(series_id, episode_id)| {
                        *series_id == tracked.series_id && *episode_id != 950
                    })
                    .count() as i64;
                assert_eq!(
                    tracked.watched_episodes, regular,
                    "{context}: tracked series {}",
                    tracked.series_id
                );
            }

            // The library status is the derived status of what is watched
            // now: up when watching, back down when un-marking.
            for (id, media_type) in [(9, "series"), (10, "series"), (55, "movie"), (56, "movie")] {
                let actual = library_status(&pool, id, media_type).await;
                if !in_library.contains(&(id, media_type)) {
                    assert_eq!(actual, None, "{context}: {media_type} {id} not in library");
                    continue;
                }
                let expected = if media_type == "movie" {
                    if seen_movies.contains(&id) { 2 } else { 0 }
                } else {
                    let (_, status, total, episodes) =
                        catalogue.iter().find(|entry| entry.0 == id).unwrap();
                    let regular = episodes
                        .iter()
                        .filter(|ep| ep.season_number > 0 && seen_episodes.contains(&(id, ep.id)))
                        .count() as i64;
                    if regular >= 1 && regular >= *total && *status == "Ended" {
                        2
                    } else if regular >= 1 {
                        1
                    } else {
                        0
                    }
                };
                assert_eq!(
                    rank(actual.as_deref()),
                    expected,
                    "{context}: library status of {media_type} {id} ({actual:?})"
                );
            }
        }
    }
}

#[tokio::test]
async fn a_backdated_rewatch_or_unwatch_never_moves_updated_at_backwards() {
    let pool = migrated_pool().await;
    toggle_movie_seen_impl(&pool, "default", movie(7), true, "2024-06-01T00:00:00.000Z")
        .await
        .unwrap();
    let read = || async {
        sqlx::query_scalar::<_, String>("SELECT updated_at FROM library_items WHERE media_id = 7")
            .fetch_one(&pool)
            .await
            .unwrap()
    };
    let before = read().await;

    rewatch_movie_impl(&pool, "default", movie(7), "2020-01-01T00:00:00.000Z", None)
        .await
        .unwrap();

    assert!(
        read().await >= before,
        "a rewatch dated before the last edit must not make the entry look older than it is"
    );
}

#[tokio::test]
async fn a_double_clicked_rewatch_is_logged_once() {
    let pool = migrated_pool().await;
    toggle_movie_seen_impl(&pool, "default", movie(8), true, "2024-06-01T00:00:00.000Z")
        .await
        .unwrap();

    // Two clicks stamp two different milliseconds.
    for at in ["2025-01-01T20:00:00.000Z", "2025-01-01T20:00:00.431Z"] {
        rewatch_movie_impl(&pool, "default", movie(8), at, None)
            .await
            .unwrap();
    }
    // A real second viewing, much later, still counts.
    rewatch_movie_impl(&pool, "default", movie(8), "2025-02-01T20:00:00.000Z", None)
        .await
        .unwrap();

    let (events, count): (i64, i64) = sqlx::query_as(
        "SELECT (SELECT COUNT(*) FROM viewing_events WHERE media_id = 8 AND event_type = 'rewatched'),
                (SELECT rewatch_count FROM library_items WHERE media_id = 8)",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!((events, count), (2, 2));
}

#[tokio::test]
async fn the_commands_refuse_a_viewing_dated_in_the_future_and_an_oversized_note() {
    let pool = migrated_pool().await;
    let app = tauri::test::mock_app();
    app.manage(pool);
    let state: State<'_, SqlitePool> = app.state();

    let future = toggle_movie_seen(
        movie(5),
        true,
        "2999-01-01T00:00:00.000Z".to_string(),
        None,
        state.clone(),
    )
    .await
    .unwrap_err();
    assert_eq!(future.status, Some(400));

    let long_note = toggle_movie_seen(
        movie(5),
        true,
        "2026-01-01T00:00:00.000Z".to_string(),
        Some("x".repeat(2001)),
        state.clone(),
    )
    .await
    .unwrap_err();
    assert_eq!(long_note.status, Some(400));

    assert!(
        !is_movie_seen(5, state).await.unwrap(),
        "nothing was written"
    );
}
