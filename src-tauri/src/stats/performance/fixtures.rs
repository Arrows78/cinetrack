use sqlx::SqlitePool;
use sqlx::sqlite::SqlitePoolOptions;

pub(super) async fn migrated_pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("failed to open in-memory sqlite pool");
    crate::database::migrations::run_migrations(&pool)
        .await
        .expect("failed to migrate benchmark database");
    pool
}

pub(super) async fn seed_scale_fixture(pool: &SqlitePool, library_items: i64, viewing_events: i64) {
    let mut tx = pool.begin().await.unwrap();

    for index in 0..library_items {
        let media_type = if index % 5 == 0 { "series" } else { "movie" };
        let completed = index % 4 == 0;
        let status = if completed { "completed" } else { "watching" };
        let completed_at = completed.then_some("2026-06-15T00:00:00.000Z");
        let rating = ((index % 10) + 1) as f64;

        sqlx::query(
            "INSERT INTO library_items (
               uuid, profile_id, media_id, media_type, title, genres, status,
               user_rating, completed_at, created_at, updated_at
             ) VALUES ($1, 'default', $2, $3, $4, '[\"Drama\"]', $5, $6, $7, $8, $8)",
        )
        .bind(format!("scale-library-{index}"))
        .bind(index + 1)
        .bind(media_type)
        .bind(format!("Scale title {index}"))
        .bind(status)
        .bind(rating)
        .bind(completed_at)
        .bind("2026-01-01T00:00:00.000Z")
        .execute(&mut *tx)
        .await
        .unwrap();

        if media_type == "series" {
            sqlx::query(
                "INSERT INTO tracked_series (
                   uuid, profile_id, series_id, title, total_episodes, status, created_at, updated_at
                 ) VALUES ($1, 'default', $2, $3, 24, 'Returning Series', $4, $4)",
            )
            .bind(format!("scale-series-{index}"))
            .bind(index + 1)
            .bind(format!("Scale title {index}"))
            .bind("2026-01-01T00:00:00.000Z")
            .execute(&mut *tx)
            .await
            .unwrap();

            for episode in 1..=4 {
                sqlx::query(
                    "INSERT INTO episode_progress (
                       uuid, profile_id, series_id, episode_id, season_number, episode_number,
                       watched, watched_at, created_at, updated_at
                     ) VALUES ($1, 'default', $2, $3, 1, $4, 1, $5, $5, $5)",
                )
                .bind(format!("scale-progress-{index}-{episode}"))
                .bind(index + 1)
                .bind((index + 1) * 100 + episode)
                .bind(episode)
                .bind("2026-06-15T00:00:00.000Z")
                .execute(&mut *tx)
                .await
                .unwrap();
            }
        }
    }

    for index in 0..viewing_events {
        let media_id = (index % library_items) + 1;
        let is_series = (media_id - 1) % 5 == 0;
        let media_type = if is_series { "series" } else { "movie" };
        let episode_id = is_series.then_some(index + 1);
        let event_type = if index % 7 == 0 {
            "rewatched"
        } else {
            "watched"
        };
        let month = (index % 12) + 1;
        let day = (index % 28) + 1;
        let hour = index % 24;
        let watched_at = format!("2026-{month:02}-{day:02}T{hour:02}:00:00.000Z");

        sqlx::query(
            "INSERT INTO viewing_events (
               uuid, profile_id, media_id, media_type, title, event_type,
               watched_at, duration_minutes, episode_id, created_at
             ) VALUES ($1, 'default', $2, $3, $4, $5, $6, $7, $8, $6)",
        )
        .bind(format!("scale-event-{index}"))
        .bind(media_id)
        .bind(media_type)
        .bind(format!("Scale title {}", media_id - 1))
        .bind(event_type)
        .bind(watched_at)
        .bind(if is_series { 45 } else { 110 })
        .bind(episode_id)
        .execute(&mut *tx)
        .await
        .unwrap();
    }

    tx.commit().await.unwrap();
}
