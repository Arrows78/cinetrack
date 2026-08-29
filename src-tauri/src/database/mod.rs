pub mod migrations;

use std::fs::create_dir_all;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sqlx::SqlitePool;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use tauri::{AppHandle, Manager, Runtime};

use crate::error::ApiError;

const DB_FILE_NAME: &str = "app.db";

/// Every table that carries a direct
/// `profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE`
/// column (see migrations.rs's schema) — the single source of truth for
/// "which tables does deleting a profile clear," shared by the command
/// layer's cascade delete, backup import's pre-import purge, and the
/// migration runner's schema-completeness check, instead of each retyping
/// its own copy.
///
/// `custom_list_items` is deliberately NOT included: it has no `profile_id`
/// column of its own and scopes to a profile only transitively, through its
/// own `list_id TEXT NOT NULL REFERENCES custom_lists(uuid) ON DELETE CASCADE`.
/// Callers that need it too (a full-schema table list, a full-database
/// purge) add it alongside this const rather than folding it in here.
pub const PROFILE_SCOPED_TABLES: &[&str] = &[
    "activity_log",
    "availability_alerts",
    "custom_lists",
    "episode_progress",
    "library_items",
    "saved_filters",
    "seen_movies",
    "smart_lists",
    "tracked_series",
    "viewing_events",
];

/// Reported to the frontend (see `commands::boot::get_boot_recovery`) so it
/// can show a one-time notice and offer to restore the last automatic
/// backup, instead of the app silently starting from an empty database with
/// no explanation.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootRecovery {
    pub recovered: bool,
    /// A migration statement failed (see `init_pool_at`'s own comment) —
    /// the original database file was left untouched, at whatever schema
    /// version last committed successfully, but the app's command layer
    /// can't safely assume the latest schema is present. Unlike
    /// `recovered`, there is no "continue anyway" for this: the frontend
    /// gate must not render the rest of the app while this is true.
    pub blocked: bool,
    pub quarantined_path: Option<String>,
    pub original_error: Option<String>,
}

async fn open_pool(db_path: &Path) -> Result<SqlitePool, ApiError> {
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal);

    SqlitePoolOptions::new()
        .connect_with(options)
        .await
        .map_err(ApiError::from)
}

/// Renames the broken database file (and its WAL/SHM sidecars, if present)
/// aside instead of deleting it — a corrupt file might still hold data worth
/// hand-recovering later, and the user's real recovery path (restoring the
/// last automatic backup) doesn't need it. The pool that failed to migrate
/// must already be closed before this runs: on Windows a rename fails while
/// any connection still holds the file open.
fn quarantine_broken_database(db_path: &Path) -> Result<String, ApiError> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let quarantined: PathBuf = db_path.with_extension(format!("db.corrupt-{timestamp}"));

    std::fs::rename(db_path, &quarantined).map_err(|error| {
        ApiError::internal(format!(
            "Couldn't quarantine the broken database file: {error}"
        ))
    })?;

    for suffix in ["-wal", "-shm"] {
        let sidecar = db_path.with_file_name(format!("{DB_FILE_NAME}{suffix}"));
        if sidecar.exists() {
            let _ = std::fs::rename(
                &sidecar,
                quarantined.with_file_name(format!(
                    "{}{suffix}",
                    quarantined
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or(DB_FILE_NAME)
                )),
            );
        }
    }

    Ok(quarantined.to_string_lossy().into_owned())
}

/// Opens the same SQLite file `tauri-plugin-sql` uses today
/// (`sqlite:app.db`, resolved against the app's *config* dir — not the data
/// dir; that's what `tauri-plugin-sql` resolves relative sqlite URLs
/// against, see its `DbPool::connect`/`path_mapper`). Both drivers must
/// point at the identical file while domains are migrated one at a time.
///
/// `SqliteConnectOptions` applies `foreign_keys`/`journal_mode`/`synchronous`
/// to every connection the pool opens (not just the first one obtained),
/// which is stronger than a one-off `PRAGMA` execute right after connecting.
///
/// A broken database file no longer takes the whole process down with it —
/// but "broken" isn't one shape, so `init_pool_at` doesn't handle it one way.
/// A failing migration statement leaves the file untouched and reports the
/// boot as blocked (see that branch's own comment for why quarantining an
/// otherwise-intact file here would be wrong). Missing tables despite every
/// migration succeeding (corruption, an incomplete manual restore — see
/// `migrations::verify_critical_tables`) is the case this file has no earlier
/// valid state to recover to, so only *that* one quarantines the broken file
/// and retries once against a brand new one, which migrates cleanly since it
/// starts empty. Only if *that* also fails (disk full, permissions —
/// something no database-level recovery can route around) does this still
/// propagate an error, exactly like before.
pub async fn init_pool<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<(SqlitePool, BootRecovery), ApiError> {
    let app_config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| ApiError::internal(format!("No app config path was found: {error}")))?;
    create_dir_all(&app_config_dir)
        .map_err(|error| ApiError::internal(format!("Couldn't create app config dir: {error}")))?;

    init_pool_at(&app_config_dir.join(DB_FILE_NAME)).await
}

/// The path-only, `AppHandle`-free core of `init_pool` — split out so the
/// quarantine-and-retry behavior is directly unit-testable against a real,
/// file-backed SQLite database instead of only the in-memory pools the rest
/// of this codebase's tests use (quarantining is a filesystem rename, which
/// `sqlite::memory:` has none of).
async fn init_pool_at(db_path: &Path) -> Result<(SqlitePool, BootRecovery), ApiError> {
    let pool = open_pool(db_path).await?;

    if let Err(migration_error) = migrations::apply_pending_migrations(&pool).await {
        // A specific migration's SQL statement failed — almost always an
        // app-code bug (or a database created by a newer app version this
        // build doesn't fully understand yet), not corruption: every
        // migration before the failing one already committed in its own
        // transaction, so the file is left exactly at that last valid
        // schema version. Quarantining and replacing it here (the old,
        // uniform behavior) would silently wipe a perfectly intact
        // database over what's really a fixable app problem. Leave the
        // file untouched and surface a blocking state instead — see
        // `BootRecovery::blocked`'s doc comment for why the frontend must
        // not offer a "continue anyway" for this one.
        return Ok((
            pool,
            BootRecovery {
                recovered: false,
                blocked: true,
                quarantined_path: None,
                original_error: Some(migration_error.message),
            },
        ));
    }

    match migrations::verify_critical_tables(&pool).await {
        Ok(()) => Ok((pool, BootRecovery::default())),
        Err(integrity_error) => {
            // Missing tables despite every migration reporting success is a
            // different signal: the file itself looks broken (corruption,
            // an incomplete manual restore) rather than an app bug, and
            // there's no earlier valid state to fall back to within this
            // file — quarantining and starting fresh is still the right
            // call here.
            pool.close().await;
            let quarantined_path = quarantine_broken_database(db_path)?;

            let fresh_pool = open_pool(db_path).await?;
            migrations::run_migrations(&fresh_pool)
                .await
                .map_err(|fresh_error| {
                    ApiError::internal(format!(
                        "Recovery failed too, after quarantining {quarantined_path}: {fresh_error} \
                     (original error: {integrity_error})"
                    ))
                })?;

            Ok((
                fresh_pool,
                BootRecovery {
                    recovered: true,
                    blocked: false,
                    quarantined_path: Some(quarantined_path),
                    original_error: Some(integrity_error.message),
                },
            ))
        }
    }
}

/// Resolves the active profile id the same way every repository used to via
/// `preferencesRepository.getPreferences().activeProfileId`: read the
/// `activeProfileId` key from `preferences` (stored JSON-encoded), default to
/// `"default"` when absent or malformed.
pub async fn current_profile_id(pool: &SqlitePool) -> Result<String, ApiError> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT value FROM preferences WHERE key = 'activeProfileId'")
            .fetch_optional(pool)
            .await
            .map_err(ApiError::from)?;

    Ok(row
        .and_then(|(value,)| serde_json::from_str::<String>(&value).ok())
        .unwrap_or_else(|| "default".to_string()))
}

/// The app-wide ISO-8601 UTC "now" (`2026-01-01T00:00:00.123Z`), matching
/// the millisecond precision `new Date().toISOString()` produces on the
/// TypeScript side — `%f` gives fractional seconds (`ss.mmm`), unlike the
/// migration seed's hardcoded `.000Z`, which matters here: two events
/// logged within the same second must still get distinct, orderable
/// timestamps. Generated by SQLite itself rather than a Rust date/time
/// dependency, and generic over the executor so callers can run it inside
/// their own transaction (`&mut *tx`) or directly against the pool.
pub async fn now_iso<'e, E>(executor: E) -> Result<String, ApiError>
where
    E: sqlx::Executor<'e, Database = sqlx::Sqlite>,
{
    let (now,): (String,) = sqlx::query_as("SELECT strftime('%Y-%m-%dT%H:%M:%f', 'now') || 'Z'")
        .fetch_one(executor)
        .await
        .map_err(ApiError::from)?;
    Ok(now)
}

/// Generates a fresh UUID for a new row's primary key. UUIDv7 (not v4):
/// its leading bits encode the creation timestamp, so `ORDER BY uuid DESC`
/// — the tiebreaker `list_history_impl` uses when two rows share the exact
/// same `timestamp` — resolves to insertion order instead of the coin-flip
/// a random v4 would give (this is what made
/// `remove_if_planned_removes_and_logs_when_status_is_still_planned` flaky
/// on Windows CI, where two same-millisecond activity_log rows sorted in
/// the wrong order often enough to fail the assertion).
pub fn new_uuid() -> String {
    uuid::Uuid::now_v7().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    /// A fresh, unique path under the OS temp dir — a real file, not
    /// `sqlite::memory:`, since quarantining is a filesystem rename that an
    /// in-memory database has nothing to exercise. Not cleaned up
    /// automatically (no extra dev-dependency just for that); OS temp
    /// cleanup handles it eventually, and each test gets its own path so
    /// leftovers never collide with a later run.
    fn temp_db_path(label: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("cinetrack-test-{label}-{unique}.db"))
    }

    async fn in_memory_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        migrations::run_migrations(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn defaults_to_default_profile_when_unset() {
        let pool = in_memory_pool().await;
        assert_eq!(current_profile_id(&pool).await.unwrap(), "default");
    }

    #[tokio::test]
    async fn now_iso_returns_an_iso8601_utc_timestamp() {
        let pool = in_memory_pool().await;
        let value = now_iso(&pool).await.unwrap();
        assert!(
            value.ends_with('Z'),
            "expected an ISO-8601 UTC timestamp, got {value}"
        );
        assert_eq!(value.len(), "2026-01-01T00:00:00.000Z".len());
    }

    #[test]
    fn new_uuid_returns_distinct_values() {
        assert_ne!(new_uuid(), new_uuid());
    }

    #[tokio::test]
    async fn reads_the_stored_active_profile() {
        let pool = in_memory_pool().await;
        sqlx::query("INSERT INTO preferences (key, value, updated_at) VALUES ('activeProfileId', '\"guest\"', 'now')")
            .execute(&pool)
            .await
            .unwrap();

        assert_eq!(current_profile_id(&pool).await.unwrap(), "guest");
    }

    #[tokio::test]
    async fn init_pool_at_is_a_clean_no_op_success_on_a_healthy_database() {
        let path = temp_db_path("healthy");

        let (pool, boot_recovery) = init_pool_at(&path).await.unwrap();
        assert!(!boot_recovery.recovered);
        assert!(boot_recovery.quarantined_path.is_none());
        assert_eq!(current_profile_id(&pool).await.unwrap(), "default");

        pool.close().await;
        let _ = std::fs::remove_file(&path);
    }

    #[tokio::test]
    async fn init_pool_at_quarantines_a_broken_database_and_starts_fresh() {
        let path = temp_db_path("broken");

        // Simulates exactly the corruption verify_critical_tables exists to
        // catch (see migrations.rs): a pragma claiming every migration
        // already ran, but none of the tables actually exist. Reading the
        // real highest version (rather than hardcoding one) keeps this
        // fixture from silently drifting stale as new migrations are added
        // — a hardcoded version below the true latest would instead make
        // apply_pending_migrations try (and fail) to run the newer
        // migrations against a schema-less database, which exercises the
        // blocked path this test isn't about.
        let latest_version = crate::database::migrations::latest_version()
            .expect("database migrations are registered");
        let broken = SqlitePoolOptions::new()
            .connect(&format!("sqlite://{}?mode=rwc", path.display()))
            .await
            .unwrap();
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "PRAGMA user_version = {latest_version}"
        )))
        .execute(&broken)
        .await
        .unwrap();
        broken.close().await;

        let (pool, boot_recovery) = init_pool_at(&path).await.unwrap();

        assert!(boot_recovery.recovered);
        let quarantined_path = boot_recovery
            .quarantined_path
            .clone()
            .expect("a quarantined path");
        assert!(
            std::path::Path::new(&quarantined_path).exists(),
            "the broken file should still exist, just moved"
        );
        assert!(boot_recovery.original_error.is_some());

        // The fresh database is fully usable.
        assert_eq!(current_profile_id(&pool).await.unwrap(), "default");

        pool.close().await;
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(&quarantined_path);
    }

    #[test]
    fn quarantine_broken_database_fails_when_the_source_file_does_not_exist() {
        let path = temp_db_path("quarantine-missing-source");
        // Never created on disk: std::fs::rename on a nonexistent source
        // fails deterministically (ENOENT) regardless of OS, so this
        // exercises quarantine_broken_database's rename error-mapping
        // closure without relying on any real corruption/permission setup.
        let result = quarantine_broken_database(&path);
        assert!(
            result.is_err(),
            "quarantining a file that was never created should fail"
        );
    }

    #[test]
    fn quarantine_broken_database_also_renames_wal_and_shm_sidecars() {
        let path = temp_db_path("quarantine-sidecars");
        std::fs::write(&path, b"").unwrap();

        // quarantine_broken_database's sidecar loop looks for sidecars named
        // after the DB_FILE_NAME constant ("app.db-wal"/"app.db-shm"), not
        // after db_path's own file name — see the function's suffix loop.
        // temp_db_path names files "cinetrack-test-<label>-<unique>.db", so
        // to make the `sidecar.exists()` check true we have to create files
        // under the literal "app.db-wal"/"app.db-shm" names, in the same
        // directory, rather than mirroring `path`'s own name.
        let wal_sidecar = path.with_file_name(format!("{DB_FILE_NAME}-wal"));
        let shm_sidecar = path.with_file_name(format!("{DB_FILE_NAME}-shm"));
        std::fs::write(&wal_sidecar, b"").unwrap();
        std::fs::write(&shm_sidecar, b"").unwrap();

        let quarantined = quarantine_broken_database(&path).unwrap();
        let quarantined_path = PathBuf::from(&quarantined);
        let quarantined_name = quarantined_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap()
            .to_string();
        let quarantined_wal = quarantined_path.with_file_name(format!("{quarantined_name}-wal"));
        let quarantined_shm = quarantined_path.with_file_name(format!("{quarantined_name}-shm"));

        assert!(
            quarantined_wal.exists(),
            "the -wal sidecar should have been renamed alongside the db file"
        );
        assert!(
            quarantined_shm.exists(),
            "the -shm sidecar should have been renamed alongside the db file"
        );
        assert!(!wal_sidecar.exists());
        assert!(!shm_sidecar.exists());

        let _ = std::fs::remove_file(&quarantined_path);
        let _ = std::fs::remove_file(&quarantined_wal);
        let _ = std::fs::remove_file(&quarantined_shm);
    }

    #[tokio::test]
    async fn init_pool_at_blocks_without_touching_the_file_when_a_migration_statement_fails() {
        let path = temp_db_path("migration-failure");

        // A `user_version` claiming migration 1 already ran, on a database
        // where none of migration 1's tables actually exist, makes
        // apply_pending_migrations skip migration 1 (version <= current)
        // and attempt migration 9 next — whose statements reference tables
        // only migration 1 creates, so it fails with a real SQL error.
        // This is the "app-code bug" scenario, distinct from
        // verify_critical_tables's "claims fully migrated but tables
        // missing" scenario covered above — see init_pool_at's own comment
        // for why these two get different treatment.
        let broken = SqlitePoolOptions::new()
            .connect(&format!("sqlite://{}?mode=rwc", path.display()))
            .await
            .unwrap();
        sqlx::query("PRAGMA user_version = 1")
            .execute(&broken)
            .await
            .unwrap();
        broken.close().await;

        let (pool, boot_recovery) = init_pool_at(&path).await.unwrap();

        assert!(boot_recovery.blocked);
        assert!(!boot_recovery.recovered);
        assert!(boot_recovery.quarantined_path.is_none());
        assert!(boot_recovery.original_error.is_some());

        // The file was left completely untouched: no quarantine sidecar
        // appeared, and the original file is still exactly the one we
        // opened (still just the `PRAGMA user_version` write, no tables).
        let entries: Vec<String> = sqlx::query_scalar(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert!(
            entries.is_empty(),
            "no migration should have committed: {entries:?}"
        );

        pool.close().await;
        let _ = std::fs::remove_file(&path);
    }
}
