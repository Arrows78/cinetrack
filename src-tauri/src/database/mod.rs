pub mod migrations;

use std::fs::create_dir_all;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager, Runtime};

use crate::error::ApiError;

const DB_FILE_NAME: &str = "app.db";

/// Opens the same SQLite file `tauri-plugin-sql` uses today
/// (`sqlite:app.db`, resolved against the app's *config* dir — not the data
/// dir; that's what `tauri-plugin-sql` resolves relative sqlite URLs
/// against, see its `DbPool::connect`/`path_mapper`). Both drivers must
/// point at the identical file while domains are migrated one at a time.
///
/// `SqliteConnectOptions` applies `foreign_keys`/`journal_mode`/`synchronous`
/// to every connection the pool opens (not just the first one obtained),
/// which is stronger than a one-off `PRAGMA` execute right after connecting.
pub async fn init_pool<R: Runtime>(app: &AppHandle<R>) -> Result<SqlitePool, ApiError> {
    let app_config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| ApiError::internal(format!("No app config path was found: {error}")))?;
    create_dir_all(&app_config_dir)
        .map_err(|error| ApiError::internal(format!("Couldn't create app config dir: {error}")))?;

    let db_path = app_config_dir.join(DB_FILE_NAME);
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal);

    let pool = SqlitePoolOptions::new()
        .connect_with(options)
        .await
        .map_err(ApiError::from)?;

    migrations::run_migrations(&pool).await?;

    Ok(pool)
}

/// Resolves the active profile id the same way every repository used to via
/// `preferencesRepository.getPreferences().activeProfileId`: read the
/// `activeProfileId` key from `preferences` (stored JSON-encoded), default to
/// `"default"` when absent or malformed.
pub async fn current_profile_id(pool: &SqlitePool) -> Result<String, ApiError> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM preferences WHERE key = 'activeProfileId'")
        .fetch_optional(pool)
        .await
        .map_err(ApiError::from)?;

    Ok(row
        .and_then(|(value,)| serde_json::from_str::<String>(&value).ok())
        .unwrap_or_else(|| "default".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

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
    async fn reads_the_stored_active_profile() {
        let pool = in_memory_pool().await;
        sqlx::query("INSERT INTO preferences (key, value, updated_at) VALUES ('activeProfileId', '\"guest\"', 'now')")
            .execute(&pool)
            .await
            .unwrap();

        assert_eq!(current_profile_id(&pool).await.unwrap(), "guest");
    }
}
