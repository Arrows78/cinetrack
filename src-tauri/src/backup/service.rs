use std::path::PathBuf;

use sqlx::SqlitePool;

use super::PortableData;
use super::export::export_impl;
use super::filesystem;
use super::import::import_impl;
use super::integrity::{DataIntegrityCheck, check};
use crate::error::ApiError;

pub(super) struct BackupService<'a> {
    pool: &'a SqlitePool,
}

impl<'a> BackupService<'a> {
    pub(super) fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub(super) async fn export(&self) -> Result<PortableData, ApiError> {
        export_impl(self.pool).await
    }

    pub(super) async fn import(&self, data: PortableData) -> Result<(), ApiError> {
        import_impl(self.pool, data).await
    }

    pub(super) async fn check_integrity(&self) -> Result<DataIntegrityCheck, ApiError> {
        check(self.pool).await
    }

    /// The only folder the file commands may touch: `backups/` inside the
    /// backup directory the user chose. Without a configured directory the
    /// frontend uses the app data folder through the fs plugin, never these
    /// commands, so there is nothing to allow.
    async fn allowed_root(&self) -> Result<PathBuf, ApiError> {
        let stored: Option<(String,)> =
            sqlx::query_as("SELECT value FROM preferences WHERE key = 'backupDirectory'")
                .fetch_optional(self.pool)
                .await
                .map_err(ApiError::from)?;
        let directory = stored
            .and_then(|(value,)| {
                serde_json::from_str::<Option<String>>(&value)
                    .ok()
                    .flatten()
            })
            .filter(|directory| !directory.trim().is_empty())
            .ok_or_else(|| ApiError::forbidden("No custom backup directory is configured"))?;
        Ok(PathBuf::from(directory).join("backups"))
    }

    pub(super) async fn write_file(&self, path: String, contents: String) -> Result<(), ApiError> {
        filesystem::write(path, contents, &self.allowed_root().await?).await
    }

    pub(super) async fn read_file(&self, path: String) -> Result<Option<String>, ApiError> {
        filesystem::read(path, &self.allowed_root().await?).await
    }

    pub(super) async fn list_directory(&self, directory: String) -> Result<Vec<String>, ApiError> {
        filesystem::list(directory, &self.allowed_root().await?).await
    }

    pub(super) async fn remove_file(&self, path: String) -> Result<(), ApiError> {
        filesystem::remove(path, &self.allowed_root().await?).await
    }
}
