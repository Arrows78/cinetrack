//! The batch reads a screen uses instead of one call per row must answer
//! exactly what those per-row calls answer, for the active profile only.
//! Each test seeds a profile with data and a second profile with data on the
//! same ids, runs the per-row commands as the reference, and compares.

use sqlx::SqlitePool;
use sqlx::sqlite::SqlitePoolOptions;
use tauri::Manager;

use crate::library::{
    LibraryMediaKey, get_library_item, has_library_item, list_library_keys_among,
};
use crate::lists::{list_all_custom_list_items, list_custom_list_items, list_custom_lists};
use crate::models::MediaType;
use crate::progress::{
    get_episode_progress, get_episode_progress_batch, is_movie_seen, list_seen_movie_ids,
};

type App = tauri::App<tauri::test::MockRuntime>;

async fn seeded() -> (SqlitePool, App) {
    let pool = SqlitePoolOptions::new()
        .max_connections(2)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    crate::database::migrations::run_migrations(&pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('other', 'Other', '2026-01-01', '2026-01-01')",
    )
    .execute(&pool)
    .await
    .unwrap();
    let app = tauri::test::mock_app();
    app.manage(pool.clone());
    (pool, app)
}

async fn library_item(pool: &SqlitePool, profile: &str, media_id: i64, media_type: &str) {
    sqlx::query(
        "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'Title', '2026-01-01', '2026-01-01')",
    )
    .bind(format!("{profile}-{media_type}-{media_id}"))
    .bind(profile)
    .bind(media_id)
    .bind(media_type)
    .execute(pool)
    .await
    .unwrap();
}

fn key(media_id: i64, media_type: MediaType) -> LibraryMediaKey {
    LibraryMediaKey {
        media_id,
        media_type,
    }
}

#[tokio::test]
async fn library_keys_among_answers_what_has_library_item_answers_per_key() {
    let (pool, app) = seeded().await;
    library_item(&pool, "default", 1, "movie").await;
    library_item(&pool, "default", 2, "series").await;
    // Same id, other type: a different title.
    library_item(&pool, "default", 3, "movie").await;
    // Another profile's titles never count.
    library_item(&pool, "other", 4, "movie").await;
    library_item(&pool, "other", 2, "movie").await;

    let asked = vec![
        key(1, MediaType::Movie),
        key(1, MediaType::Series),
        key(2, MediaType::Series),
        key(2, MediaType::Movie),
        key(3, MediaType::Movie),
        key(4, MediaType::Movie),
        key(99, MediaType::Series),
        // Asked twice: answered once, like the per-key calls would agree.
        key(1, MediaType::Movie),
    ];
    let mut expected = Vec::new();
    for asked_key in &asked {
        if has_library_item(asked_key.media_id, asked_key.media_type, app.state())
            .await
            .unwrap()
            && !expected.contains(asked_key)
        {
            expected.push(*asked_key);
        }
    }

    let mut answered = list_library_keys_among(asked, app.state()).await.unwrap();
    let sort_key = |k: &LibraryMediaKey| (k.media_id, k.media_type.as_db_str().to_string());
    answered.sort_by_key(sort_key);
    expected.sort_by_key(sort_key);
    assert_eq!(answered, expected);
    assert_eq!(answered.len(), 3);
}

#[tokio::test]
async fn library_keys_among_is_empty_for_no_keys_and_bounded_for_many() {
    let (pool, app) = seeded().await;
    library_item(&pool, "default", 1, "movie").await;
    assert!(
        list_library_keys_among(Vec::new(), app.state())
            .await
            .unwrap()
            .is_empty()
    );

    // Past the cap the extra keys are ignored rather than building an
    // unbounded statement; the first keys are still answered.
    let mut many: Vec<LibraryMediaKey> = (1..=700).map(|id| key(id, MediaType::Movie)).collect();
    many.sort_by_key(|k| k.media_id);
    let answered = list_library_keys_among(many, app.state()).await.unwrap();
    assert_eq!(answered, vec![key(1, MediaType::Movie)]);
    // The reference (per-key) agrees on what is present.
    assert!(
        get_library_item(1, MediaType::Movie, app.state())
            .await
            .unwrap()
            .is_some()
    );
}

#[tokio::test]
async fn seen_movie_ids_answer_what_is_movie_seen_answers_per_id() {
    let (pool, app) = seeded().await;
    for (profile, movie_id) in [
        ("default", 10),
        ("default", 11),
        ("other", 12),
        ("other", 10),
    ] {
        sqlx::query(
            "INSERT INTO seen_movies (uuid, profile_id, movie_id, title, watched_at, created_at, updated_at)
             VALUES ($1, $2, $3, 'Movie', '2026-01-01', '2026-01-01', '2026-01-01')",
        )
        .bind(format!("{profile}-{movie_id}"))
        .bind(profile)
        .bind(movie_id)
        .execute(&pool)
        .await
        .unwrap();
    }

    let asked = vec![10, 11, 12, 13, 10];
    let mut expected = Vec::new();
    for movie_id in &asked {
        if is_movie_seen(*movie_id, app.state()).await.unwrap() && !expected.contains(movie_id) {
            expected.push(*movie_id);
        }
    }
    let mut answered = list_seen_movie_ids(asked, app.state()).await.unwrap();
    answered.sort_unstable();
    expected.sort_unstable();
    assert_eq!(answered, expected);
    assert_eq!(answered, vec![10, 11]);
    assert!(
        list_seen_movie_ids(Vec::new(), app.state())
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn episode_progress_batch_is_the_per_series_reads_put_together() {
    let (pool, app) = seeded().await;
    let rows = [
        // (profile, series, episode, season, episode number, watched)
        ("default", 5, 501, 1, 1, 1),
        ("default", 5, 502, 1, 2, 1),
        ("default", 5, 503, 1, 3, 0),
        ("default", 5, 500, 0, 1, 1),
        ("default", 6, 601, 2, 1, 1),
        ("default", 8, 801, 1, 1, 1),
        ("other", 5, 504, 1, 4, 1),
        ("other", 6, 602, 1, 1, 1),
    ];
    for (profile, series, episode, season, number, watched) in rows {
        sqlx::query(
            "INSERT INTO episode_progress (uuid, profile_id, series_id, episode_id, season_number, episode_number, watched, watched_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, '2026-01-01', '2026-01-01', '2026-01-01')",
        )
        .bind(format!("{profile}-{episode}"))
        .bind(profile)
        .bind(series)
        .bind(episode)
        .bind(season)
        .bind(number)
        .bind(watched)
        .execute(&pool)
        .await
        .unwrap();
    }

    // 7 has no progress at all; 8 is not asked for.
    let asked = vec![5, 6, 7];
    let mut expected = Vec::new();
    for series_id in &asked {
        expected.extend(get_episode_progress(*series_id, app.state()).await.unwrap());
    }
    let mut answered = get_episode_progress_batch(asked, app.state())
        .await
        .unwrap();
    let order = |progress: &crate::progress::EpisodeProgress| progress.id.clone();
    answered.sort_by_key(order);
    expected.sort_by_key(order);

    assert_eq!(
        serde_json::to_value(&answered).unwrap(),
        serde_json::to_value(&expected).unwrap()
    );
    assert_eq!(
        answered.len(),
        4,
        "the unwatched row and the other profile's are left out"
    );
    assert!(answered.iter().all(|progress| progress.series_id != 8));
    assert!(
        get_episode_progress_batch(Vec::new(), app.state())
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn all_custom_list_items_are_the_per_list_reads_put_together() {
    let (pool, app) = seeded().await;
    for (list, profile) in [
        ("list-a", "default"),
        ("list-b", "default"),
        ("list-c", "other"),
    ] {
        sqlx::query(
            "INSERT INTO custom_lists (uuid, profile_id, name, created_at, updated_at)
             VALUES ($1, $2, $1, '2026-01-01', '2026-01-01')",
        )
        .bind(list)
        .bind(profile)
        .execute(&pool)
        .await
        .unwrap();
    }
    // Position order differs from insertion order on purpose.
    for (item, list, media_id, position) in [
        ("i1", "list-a", 1, 2),
        ("i2", "list-a", 2, 0),
        ("i3", "list-a", 3, 1),
        ("i4", "list-b", 1, 0),
        ("i5", "list-c", 1, 0),
    ] {
        sqlx::query(
            "INSERT INTO custom_list_items (uuid, list_id, media_id, media_type, title, position, added_at, updated_at)
             VALUES ($1, $2, $3, 'movie', 'Title', $4, '2026-01-01', '2026-01-01')",
        )
        .bind(item)
        .bind(list)
        .bind(media_id)
        .bind(position)
        .execute(&pool)
        .await
        .unwrap();
    }

    let lists = list_custom_lists(app.state()).await.unwrap();
    let mut expected = Vec::new();
    for list in &lists {
        expected.extend(
            list_custom_list_items(list.id.clone(), app.state())
                .await
                .unwrap(),
        );
    }
    let answered = list_all_custom_list_items(app.state()).await.unwrap();

    let by_id = |items: &[crate::lists::custom::CustomListItem]| {
        let mut ids: Vec<(String, i64)> = items
            .iter()
            .map(|item| (item.id.clone(), item.position))
            .collect();
        ids.sort();
        ids
    };
    assert_eq!(by_id(&answered), by_id(&expected));
    assert_eq!(answered.len(), 4, "the other profile's list is not reached");
    // Within one list, the items come in position order, as the per-list read gives them.
    let list_a: Vec<i64> = answered
        .iter()
        .filter(|item| item.list_id == "list-a")
        .map(|item| item.position)
        .collect();
    assert_eq!(list_a, vec![0, 1, 2]);
}

async fn tracked_series_with_progress(pool: &SqlitePool) {
    // Two followed series: one finished and caught up (automatic Completed),
    // one partly watched.
    for (series_id, status, total, status_origin, library_status) in [
        (30_i64, "Returning Series", 2_i64, "auto", "completed"),
        (31, "Returning Series", 5, "auto", "watching"),
    ] {
        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, status_origin, completed_at, created_at, updated_at)
             VALUES ($1, 'default', $2, 'series', 'Series', $3, $4, '2026-01-01', '2026-01-01', '2026-01-01')",
        )
        .bind(format!("lib-{series_id}"))
        .bind(series_id)
        .bind(library_status)
        .bind(status_origin)
        .execute(pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO tracked_series (uuid, profile_id, series_id, title, total_episodes, status, created_at, updated_at)
             VALUES ($1, 'default', $2, 'Series', $3, $4, '2026-01-01', '2026-01-01')",
        )
        .bind(format!("ts-{series_id}"))
        .bind(series_id)
        .bind(total)
        .bind(status)
        .execute(pool)
        .await
        .unwrap();
        for episode in 1..=2 {
            sqlx::query(
                "INSERT INTO episode_progress (uuid, profile_id, series_id, episode_id, season_number, episode_number, watched, watched_at, created_at, updated_at)
                 VALUES ($1, 'default', $2, $3, 1, $4, 1, '2026-01-01', '2026-01-01', '2026-01-01')",
            )
            .bind(format!("ep-{series_id}-{episode}"))
            .bind(series_id)
            .bind(series_id * 100 + episode)
            .bind(episode)
            .execute(pool)
            .await
            .unwrap();
        }
    }
}

async fn snapshot(pool: &SqlitePool) -> Vec<(i64, String, i64, String, String)> {
    sqlx::query_as(
        "SELECT t.series_id, COALESCE(t.status, ''), t.total_episodes, l.status, l.status_origin
         FROM tracked_series t JOIN library_items l ON l.media_id = t.series_id AND l.media_type = 'series'
         ORDER BY t.series_id",
    )
    .fetch_all(pool)
    .await
    .unwrap()
}

#[tokio::test]
async fn refreshing_many_series_at_once_leaves_what_refreshing_them_one_by_one_leaves() {
    // TMDB announced more episodes for the finished series (reopens it),
    // reports the other one over, and knows a third nobody tracks.
    let refreshes = [
        (30_i64, Some("Returning Series"), Some(4_i64)),
        (31, Some("Ended"), Some(2)),
        (32, Some("Ended"), Some(10)),
    ];

    let (single_pool, single_app) = seeded().await;
    tracked_series_with_progress(&single_pool).await;
    for (series_id, status, total) in refreshes {
        crate::progress::refresh_tracked_series_status(
            series_id,
            status.map(str::to_string),
            total,
            single_app.state(),
        )
        .await
        .unwrap();
    }

    let (batch_pool, batch_app) = seeded().await;
    tracked_series_with_progress(&batch_pool).await;
    let failed = crate::progress::refresh_tracked_series_statuses(
        serde_json::from_value(serde_json::json!([
            { "seriesId": 30, "status": "Returning Series", "totalEpisodes": 4 },
            { "seriesId": 31, "status": "Ended", "totalEpisodes": 2 },
            { "seriesId": 32, "status": "Ended", "totalEpisodes": 10 },
        ]))
        .unwrap(),
        batch_app.state(),
    )
    .await
    .unwrap();

    assert!(failed.is_empty());
    let after_batch = snapshot(&batch_pool).await;
    assert_eq!(after_batch, snapshot(&single_pool).await);
    // And the batch really did something: the reopened series is back to watching.
    assert_eq!(after_batch[0].3, "watching");
    assert_eq!(after_batch[1].3, "completed");
}
