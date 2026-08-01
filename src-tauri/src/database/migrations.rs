use sqlx::SqlitePool;

use crate::error::ApiError;

pub struct Migration {
    pub version: i64,
    pub name: &'static str,
    pub statements: &'static [&'static str],
}

// Ported verbatim from src/db/migrations/001-initial-schema.ts (the
// TypeScript migration runner that created every already-installed
// database). Every data table uses UUID as PRIMARY KEY (stable public
// identifier, generated at insert time — no separate INTEGER id).
// `created_at`/`updated_at` are ISO-8601 strings supplied by the app.
//
// Exceptions:
// - `preferences`: singleton key/value store; `key` is already a stable PK.
// - `availability_snapshots`: TTL cache keyed by (media_id, media_type, region);
//   `checked_at` is enough temporal info, no created_at/updated_at needed.
// - `viewing_events`: append-only; gets `created_at` only (no `updated_at`).
// - `custom_list_items`: has business-meaningful `added_at`; gains `updated_at`
//   (for reordering) but not redundant `created_at`.
pub const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    name: "initial schema",
    statements: &[
        r#"CREATE TABLE profiles (
          uuid TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          avatar TEXT,
          supabase_user_id TEXT UNIQUE,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )"#,
        r#"CREATE TABLE library_items (
          uuid TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
          media_id INTEGER NOT NULL,
          media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
          title TEXT NOT NULL,
          poster_path TEXT,
          backdrop_path TEXT,
          year INTEGER CHECK (year IS NULL OR year > 1800),
          rating REAL CHECK (rating IS NULL OR (rating >= 0 AND rating <= 10)),
          genres TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'planned'
            CHECK (status IN ('planned','watching','paused','completed','dropped','rewatching')),
          favourite INTEGER NOT NULL DEFAULT 0 CHECK (favourite IN (0,1)),
          user_rating REAL CHECK (user_rating IS NULL OR (user_rating >= 1 AND user_rating <= 10)),
          notes TEXT,
          tags TEXT NOT NULL DEFAULT '[]',
          started_at TEXT,
          completed_at TEXT,
          rewatch_count INTEGER NOT NULL DEFAULT 0 CHECK (rewatch_count >= 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (profile_id, media_id, media_type)
        )"#,
        "CREATE INDEX idx_library_profile_status ON library_items(profile_id, status, updated_at DESC)",
        "CREATE INDEX idx_library_profile_updated ON library_items(profile_id, updated_at DESC)",
        "CREATE INDEX idx_library_media_id ON library_items(media_id, media_type)",
        r#"CREATE TABLE watchlist_items (
          uuid TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
          media_id INTEGER NOT NULL,
          media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
          title TEXT NOT NULL,
          poster_path TEXT,
          backdrop_path TEXT,
          year INTEGER CHECK (year IS NULL OR year > 1800),
          rating REAL CHECK (rating IS NULL OR (rating >= 0 AND rating <= 10)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (profile_id, media_id, media_type)
        )"#,
        "CREATE INDEX idx_watchlist_items_profile_created ON watchlist_items(profile_id, created_at DESC)",
        "CREATE INDEX idx_watchlist_media_id ON watchlist_items(media_id, media_type)",
        r#"CREATE TABLE seen_movies (
          uuid TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
          movie_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          poster_path TEXT,
          backdrop_path TEXT,
          watched_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (profile_id, movie_id)
        )"#,
        "CREATE INDEX idx_seen_movies_profile_watched ON seen_movies(profile_id, watched_at DESC)",
        "CREATE INDEX idx_seen_movies_movie_id ON seen_movies(movie_id)",
        r#"CREATE TABLE episode_progress (
          uuid TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
          series_id INTEGER NOT NULL,
          episode_id INTEGER NOT NULL,
          season_number INTEGER NOT NULL CHECK (season_number >= 0),
          episode_number INTEGER NOT NULL CHECK (episode_number >= 0),
          watched INTEGER NOT NULL DEFAULT 1 CHECK (watched IN (0,1)),
          watched_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (profile_id, series_id, episode_id)
        )"#,
        "CREATE INDEX idx_episode_progress_series_watched ON episode_progress(profile_id, series_id, watched)",
        "CREATE INDEX idx_episode_progress_episode_id ON episode_progress(episode_id)",
        r#"CREATE TABLE tracked_series (
          uuid TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
          series_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          poster_path TEXT,
          backdrop_path TEXT,
          total_episodes INTEGER NOT NULL DEFAULT 0 CHECK (total_episodes >= 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (profile_id, series_id)
        )"#,
        "CREATE INDEX idx_tracked_series_profile_updated ON tracked_series(profile_id, updated_at DESC)",
        "CREATE INDEX idx_tracked_series_series_id ON tracked_series(series_id)",
        r#"CREATE TABLE viewing_events (
          uuid TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
          media_id INTEGER NOT NULL,
          media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
          title TEXT NOT NULL,
          event_type TEXT NOT NULL CHECK (event_type IN ('watched','unwatched','rewatched')),
          watched_at TEXT NOT NULL,
          duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
          episode_id INTEGER,
          season_number INTEGER CHECK (season_number IS NULL OR season_number >= 0),
          episode_number INTEGER CHECK (episode_number IS NULL OR episode_number >= 0),
          created_at TEXT NOT NULL
        )"#,
        "CREATE INDEX idx_viewing_events_profile_date ON viewing_events(profile_id, watched_at DESC)",
        "CREATE INDEX idx_viewing_events_media_id ON viewing_events(media_id, media_type)",
        r#"CREATE TABLE activity_log (
          uuid TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
          media_id INTEGER NOT NULL,
          media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
          title TEXT NOT NULL,
          action TEXT NOT NULL CHECK (action IN (
            'movie:watched','movie:unwatched','episode:watched','episode:unwatched',
            'season:watched','season:unwatched','series:watched','series:unwatched',
            'watchlist:add','watchlist:remove','library:update','list:add','list:remove'
          )),
          season_number INTEGER CHECK (season_number IS NULL OR season_number >= 0),
          episode_number INTEGER CHECK (episode_number IS NULL OR episode_number >= 0),
          episode_title TEXT,
          metadata TEXT,
          timestamp TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )"#,
        "CREATE INDEX idx_activity_log_profile_timestamp ON activity_log(profile_id, timestamp DESC)",
        "CREATE INDEX idx_activity_log_media_id ON activity_log(media_id, media_type)",
        r#"CREATE TABLE custom_lists (
          uuid TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )"#,
        "CREATE INDEX idx_custom_lists_profile_updated ON custom_lists(profile_id, updated_at DESC)",
        r#"CREATE TABLE custom_list_items (
          uuid TEXT PRIMARY KEY,
          list_id TEXT NOT NULL REFERENCES custom_lists(uuid) ON DELETE CASCADE,
          media_id INTEGER NOT NULL,
          media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
          title TEXT NOT NULL,
          poster_path TEXT,
          position INTEGER NOT NULL CHECK (position >= 0),
          added_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (list_id, media_id, media_type)
        )"#,
        "CREATE INDEX idx_custom_list_items_position ON custom_list_items(list_id, position)",
        "CREATE INDEX idx_custom_list_items_media_id ON custom_list_items(media_id, media_type)",
        r#"CREATE TABLE availability_alerts (
          uuid TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
          media_id INTEGER NOT NULL,
          media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
          title TEXT NOT NULL,
          region TEXT NOT NULL,
          provider_ids TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )"#,
        "CREATE INDEX idx_availability_alerts_profile_created ON availability_alerts(profile_id, created_at DESC)",
        "CREATE INDEX idx_availability_alerts_enabled ON availability_alerts(enabled, profile_id)",
        r#"CREATE TABLE availability_snapshots (
          media_id INTEGER NOT NULL,
          media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
          region TEXT NOT NULL,
          provider_ids TEXT NOT NULL,
          checked_at TEXT NOT NULL,
          PRIMARY KEY (media_id, media_type, region)
        )"#,
        r#"CREATE TABLE preferences (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )"#,
        r#"INSERT OR IGNORE INTO profiles (uuid, name, created_at, updated_at)
         VALUES ('default', 'Principal', strftime('%Y-%m-%dT%H:%M:%S.000Z', 'now'), strftime('%Y-%m-%dT%H:%M:%S.000Z', 'now'))"#,
    ],
}];

fn is_tolerable_duplicate_column(statement: &str, error: &sqlx::Error) -> bool {
    let is_alter_table = statement.trim_start().starts_with("ALTER TABLE");
    let mentions_duplicate_column = error.to_string().to_lowercase().contains("duplicate column");
    is_alter_table && mentions_duplicate_column
}

/// Version-gated migration runner, ported from src/db/migrations/index.ts so
/// it behaves identically against databases the old TypeScript runner
/// already created (same `PRAGMA user_version` bookkeeping, same tolerance
/// for `duplicate column` errors on `ALTER TABLE`). On an existing database
/// already at the latest version this is a no-op.
pub async fn run_migrations(pool: &SqlitePool) -> Result<(), ApiError> {
    let row: (i64,) = sqlx::query_as("PRAGMA user_version")
        .fetch_one(pool)
        .await
        .map_err(ApiError::from)?;
    let mut current_version = row.0;

    for migration in MIGRATIONS {
        if migration.version <= current_version {
            continue;
        }

        let mut tx = pool.begin().await.map_err(ApiError::from)?;

        for statement in migration.statements {
            if let Err(error) = sqlx::query(statement).execute(&mut *tx).await
                && !is_tolerable_duplicate_column(statement, &error)
            {
                return Err(ApiError::internal(format!(
                    "Migration {} ({}) failed: {error}",
                    migration.version, migration.name
                )));
            }
        }

        sqlx::query(&format!("PRAGMA user_version = {}", migration.version))
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from)?;

        tx.commit().await.map_err(ApiError::from)?;
        current_version = migration.version;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn in_memory_pool() -> SqlitePool {
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("failed to open in-memory sqlite pool")
    }

    #[tokio::test]
    async fn versions_are_unique_and_ascending() {
        let mut previous = 0;
        for migration in MIGRATIONS {
            assert!(migration.version > previous, "migration versions must strictly increase");
            assert!(!migration.statements.is_empty(), "migration must have statements");
            previous = migration.version;
        }
    }

    #[tokio::test]
    async fn creates_every_expected_table_and_bumps_user_version() {
        let pool = in_memory_pool().await;
        sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.unwrap();

        run_migrations(&pool).await.unwrap();

        let version: (i64,) = sqlx::query_as("PRAGMA user_version").fetch_one(&pool).await.unwrap();
        assert_eq!(version.0, 1);

        let mut tables: Vec<String> = sqlx::query_scalar(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        tables.sort();

        assert_eq!(
            tables,
            vec![
                "activity_log",
                "availability_alerts",
                "availability_snapshots",
                "custom_list_items",
                "custom_lists",
                "episode_progress",
                "library_items",
                "preferences",
                "profiles",
                "seen_movies",
                "tracked_series",
                "viewing_events",
                "watchlist_items",
            ]
        );

        let default_profile: (String,) = sqlx::query_as("SELECT name FROM profiles WHERE uuid = 'default'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(default_profile.0, "Principal");
    }

    #[tokio::test]
    async fn running_migrations_twice_is_a_no_op() {
        let pool = in_memory_pool().await;
        run_migrations(&pool).await.unwrap();
        run_migrations(&pool).await.unwrap();

        let version: (i64,) = sqlx::query_as("PRAGMA user_version").fetch_one(&pool).await.unwrap();
        assert_eq!(version.0, 1);
    }

    #[tokio::test]
    async fn skips_migrations_already_applied_by_the_typescript_runner() {
        let pool = in_memory_pool().await;
        // Simulate an existing database where the old TS runner already
        // bumped user_version without the Rust runner having created any
        // table — running migrations must not attempt to re-create them.
        sqlx::query("PRAGMA user_version = 1").execute(&pool).await.unwrap();

        run_migrations(&pool).await.unwrap();

        let tables: Vec<String> =
            sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert!(tables.is_empty());
    }

    #[tokio::test]
    async fn enforces_foreign_keys_and_check_constraints() {
        let pool = in_memory_pool().await;
        sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.unwrap();
        run_migrations(&pool).await.unwrap();

        let orphan_insert = sqlx::query(
            "INSERT INTO watchlist_items (uuid, profile_id, media_id, media_type, title, created_at, updated_at)
             VALUES ('a', 'missing-profile', 1, 'movie', 'Title', 'now', 'now')",
        )
        .execute(&pool)
        .await;
        assert!(orphan_insert.is_err());

        let bad_media_type = sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, created_at, updated_at)
             VALUES ('a', 'default', 1, 'song', 'Title', 'now', 'now')",
        )
        .execute(&pool)
        .await;
        assert!(bad_media_type.is_err());
    }

    #[tokio::test]
    async fn cascades_profile_deletion_into_dependent_tables() {
        let pool = in_memory_pool().await;
        sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.unwrap();
        run_migrations(&pool).await.unwrap();

        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, created_at, updated_at)
             VALUES ('item-1', 'default', 1, 'movie', 'Title', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query("DELETE FROM profiles WHERE uuid = 'default'")
            .execute(&pool)
            .await
            .unwrap();

        let remaining: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM library_items")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(remaining.0, 0);
    }
}
