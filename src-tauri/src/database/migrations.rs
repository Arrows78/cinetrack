use sqlx::SqlitePool;

use crate::error::ApiError;

const STATEMENT_MARKER: &str = "-- cinetrack:statement";

const MIGRATION_SOURCES: &[&str] = &[
    include_str!("migrations/001-initial-schema.sql"),
    include_str!("migrations/009-availability-alerts-unique.sql"),
    include_str!("migrations/010-merge-watchlist-into-library.sql"),
    include_str!("migrations/011-add-status-to-tracked-series.sql"),
    include_str!("migrations/012-remove-rewatching-status.sql"),
    include_str!("migrations/013-add-note-to-viewing-events.sql"),
    include_str!("migrations/014-add-smart-lists.sql"),
    include_str!("migrations/015-add-saved-filters.sql"),
    include_str!("migrations/016-index-large-library-stats.sql"),
    include_str!("migrations/017-library-cursor-pagination-indexes.sql"),
    include_str!("migrations/018-add-sync-outbox.sql"),
];

#[derive(Debug)]
struct Migration {
    version: i64,
    name: &'static str,
    statements: Vec<&'static str>,
}

fn parse_migration(source: &'static str) -> Result<Migration, ApiError> {
    let header = source
        .split_once(STATEMENT_MARKER)
        .map(|(header, _)| header)
        .ok_or_else(|| ApiError::internal("Migration source has no statement marker"))?;

    let version = header
        .lines()
        .find_map(|line| line.strip_prefix("-- cinetrack:version "))
        .ok_or_else(|| ApiError::internal("Migration source has no version header"))?
        .parse::<i64>()
        .map_err(|error| ApiError::internal(format!("Invalid migration version: {error}")))?;
    let name = header
        .lines()
        .find_map(|line| line.strip_prefix("-- cinetrack:name "))
        .ok_or_else(|| ApiError::internal(format!("Migration {version} has no name header")))?;

    let statements: Vec<&'static str> = source
        .split(STATEMENT_MARKER)
        .skip(1)
        .map(str::trim)
        .filter(|statement| !statement.is_empty())
        .collect();
    if statements.is_empty() {
        return Err(ApiError::internal(format!(
            "Migration {version} ({name}) has no statements"
        )));
    }

    Ok(Migration {
        version,
        name,
        statements,
    })
}

fn migrations() -> Result<Vec<Migration>, ApiError> {
    let migrations: Vec<Migration> = MIGRATION_SOURCES
        .iter()
        .map(|source| parse_migration(source))
        .collect::<Result<_, _>>()?;

    let mut previous = 0;
    for migration in &migrations {
        if migration.version <= previous {
            return Err(ApiError::internal(format!(
                "Migration versions must strictly increase: {} follows {previous}",
                migration.version
            )));
        }
        previous = migration.version;
    }

    Ok(migrations)
}

#[cfg(test)]
pub(crate) fn latest_version() -> Result<i64, ApiError> {
    migrations()?
        .last()
        .map(|migration| migration.version)
        .ok_or_else(|| ApiError::internal("No database migrations are registered"))
}

fn is_tolerable_duplicate_column(statement: &str, error: &sqlx::Error) -> bool {
    let is_alter_table = statement.trim_start().starts_with("ALTER TABLE");
    let mentions_duplicate_column = error
        .to_string()
        .to_lowercase()
        .contains("duplicate column");
    is_alter_table && mentions_duplicate_column
}

fn expected_tables() -> Vec<&'static str> {
    let mut tables: Vec<&'static str> = super::PROFILE_SCOPED_TABLES.to_vec();
    tables.extend([
        "custom_list_items",
        "preferences",
        "profiles",
        "availability_snapshots",
        "sync_control",
        "sync_outbox",
        "sync_entity_state",
        "sync_metadata",
    ]);
    tables
}

pub(crate) async fn verify_critical_tables(pool: &SqlitePool) -> Result<(), ApiError> {
    let existing: Vec<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    let missing: Vec<&str> = expected_tables()
        .into_iter()
        .filter(|table| !existing.iter().any(|name| name == table))
        .collect();

    if !missing.is_empty() {
        return Err(ApiError::internal(format!(
            "Database is missing expected tables ({}) despite reporting the latest migration version — \
             the file may be corrupted or was restored incompletely.",
            missing.join(", ")
        )));
    }
    Ok(())
}

pub async fn run_migrations(pool: &SqlitePool) -> Result<(), ApiError> {
    apply_pending_migrations(pool).await?;
    verify_critical_tables(pool).await
}

pub(crate) async fn apply_pending_migrations(pool: &SqlitePool) -> Result<(), ApiError> {
    let row: (i64,) = sqlx::query_as("PRAGMA user_version")
        .fetch_one(pool)
        .await
        .map_err(ApiError::from)?;
    let mut current_version = row.0;

    for migration in migrations()? {
        if migration.version <= current_version {
            continue;
        }

        let mut tx = pool.begin().await.map_err(ApiError::from)?;

        for statement in &migration.statements {
            if let Err(error) = sqlx::query(*statement).execute(&mut *tx).await
                && !is_tolerable_duplicate_column(statement, &error)
            {
                return Err(ApiError::internal(format!(
                    "Migration {} ({}) failed: {error}",
                    migration.version, migration.name
                )));
            }
        }

        sqlx::query(sqlx::AssertSqlSafe(format!(
            "PRAGMA user_version = {}",
            migration.version
        )))
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

    #[test]
    fn canonical_sources_preserve_the_migration_sequence() {
        let migrations = migrations().unwrap();
        assert_eq!(
            migrations
                .iter()
                .map(|migration| migration.version)
                .collect::<Vec<_>>(),
            vec![1, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
        );
        assert_eq!(
            migrations
                .iter()
                .map(|migration| migration.name)
                .collect::<Vec<_>>(),
            vec![
                "initial schema",
                "unique availability alert per profile and media",
                "merge watchlist_items into library_items",
                "add status to tracked_series",
                "remove the rewatching library status",
                "add note to viewing_events",
                "add smart lists",
                "add saved filters",
                "index large-library stats queries",
                "library cursor pagination indexes",
                "add cloud sync outbox and change capture",
            ]
        );
        assert!(
            migrations
                .iter()
                .all(|migration| !migration.statements.is_empty())
        );
    }

    #[test]
    fn parser_never_splits_sql_on_semicolons() {
        let migration = parse_migration(
            "-- cinetrack:version 99\n-- cinetrack:name parser test\n-- cinetrack:statement\nSELECT ';' AS value; SELECT 2",
        )
        .unwrap();
        assert_eq!(migration.statements, vec!["SELECT ';' AS value; SELECT 2"]);
    }

    #[tokio::test]
    async fn creates_every_expected_table_and_bumps_user_version() {
        let pool = in_memory_pool().await;
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .unwrap();

        run_migrations(&pool).await.unwrap();

        let version: (i64,) = sqlx::query_as("PRAGMA user_version")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(version.0, migrations().unwrap().last().unwrap().version);

        let existing: Vec<String> = sqlx::query_scalar(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        for table in expected_tables() {
            assert!(
                existing.iter().any(|name| name == table),
                "missing table {table}"
            );
        }
    }

    #[tokio::test]
    async fn running_migrations_twice_is_a_no_op() {
        let pool = in_memory_pool().await;
        run_migrations(&pool).await.unwrap();
        run_migrations(&pool).await.unwrap();
        let version: (i64,) = sqlx::query_as("PRAGMA user_version")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(version.0, 18);
    }

    #[tokio::test]
    async fn skips_migrations_already_applied_by_the_typescript_runner() {
        let pool = in_memory_pool().await;
        let migrations = migrations().unwrap();
        for statement in &migrations[0].statements {
            sqlx::query(*statement).execute(&pool).await.unwrap();
        }
        sqlx::query("PRAGMA user_version = 1")
            .execute(&pool)
            .await
            .unwrap();

        run_migrations(&pool).await.unwrap();
        let version: (i64,) = sqlx::query_as("PRAGMA user_version")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(version.0, 18);
    }

    #[tokio::test]
    async fn rejects_a_database_that_claims_latest_version_but_is_missing_tables() {
        let pool = in_memory_pool().await;
        sqlx::query("PRAGMA user_version = 17")
            .execute(&pool)
            .await
            .unwrap();
        assert!(run_migrations(&pool).await.is_err());
    }

    #[tokio::test]
    async fn enforces_foreign_keys_and_check_constraints() {
        let pool = in_memory_pool().await;
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .unwrap();
        run_migrations(&pool).await.unwrap();

        let orphan_insert = sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, created_at, updated_at)\n             VALUES ('a', 'missing-profile', 1, 'movie', 'Title', 'now', 'now')",
        )
        .execute(&pool)
        .await;
        assert!(orphan_insert.is_err());

        let bad_media_type = sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, created_at, updated_at)\n             VALUES ('a', 'default', 1, 'song', 'Title', 'now', 'now')",
        )
        .execute(&pool)
        .await;
        assert!(bad_media_type.is_err());
    }

    #[tokio::test]
    async fn merges_watchlist_rows_into_library_library_wins_on_conflict() {
        let pool = in_memory_pool().await;
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .unwrap();

        let migrations = migrations().unwrap();
        for statement in &migrations[0].statements {
            sqlx::query(*statement).execute(&pool).await.unwrap();
        }
        sqlx::query("PRAGMA user_version = 1")
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, favourite, created_at, updated_at)\n             VALUES ('lib-1', 'default', 1, 'movie', 'Already tracked', 'watching', 1, 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO watchlist_items (uuid, profile_id, media_id, media_type, title, created_at, updated_at)\n             VALUES ('wl-1', 'default', 1, 'movie', 'Stale copy', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO watchlist_items (uuid, profile_id, media_id, media_type, title, year, rating, created_at, updated_at)\n             VALUES ('wl-2', 'default', 2, 'movie', 'To watch', 2020, 7.5, 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();

        run_migrations(&pool).await.unwrap();

        let existing: (String, String, bool) =
            sqlx::query_as("SELECT title, status, favourite FROM library_items WHERE media_id = 1")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(
            existing,
            ("Already tracked".to_string(), "watching".to_string(), true)
        );

        let migrated: (String, String) =
            sqlx::query_as("SELECT title, status FROM library_items WHERE media_id = 2")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(migrated, ("To watch".to_string(), "planned".to_string()));

        let table_exists: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='watchlist_items'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(table_exists, 0);
    }

    #[tokio::test]
    async fn cascades_profile_deletion_into_dependent_tables() {
        let pool = in_memory_pool().await;
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .unwrap();
        run_migrations(&pool).await.unwrap();

        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, created_at, updated_at)\n             VALUES ('item-1', 'default', 1, 'movie', 'Title', 'now', 'now')",
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

    #[tokio::test]
    async fn tolerates_a_duplicate_column_error_left_by_the_old_ts_runner() {
        let pool = in_memory_pool().await;
        let migrations = migrations().unwrap();
        for migration in migrations
            .iter()
            .filter(|migration| migration.version <= 10)
        {
            for statement in &migration.statements {
                sqlx::query(*statement).execute(&pool).await.unwrap();
            }
        }
        sqlx::query("ALTER TABLE tracked_series ADD COLUMN status TEXT")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("PRAGMA user_version = 10")
            .execute(&pool)
            .await
            .unwrap();

        run_migrations(&pool).await.unwrap();

        let version: (i64,) = sqlx::query_as("PRAGMA user_version")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(version.0, 17);
    }
}
