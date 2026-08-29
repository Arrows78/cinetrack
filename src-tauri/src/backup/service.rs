use sqlx::SqlitePool;

use super::PortableData;
use super::export::export_backup;
use super::filesystem;
use super::import::import_backup;
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
        export_backup(self.pool).await
    }

    pub(super) async fn import(&self, data: PortableData) -> Result<(), ApiError> {
        import_backup(self.pool, data).await
    }

    pub(super) async fn check_integrity(&self) -> Result<DataIntegrityCheck, ApiError> {
        check(self.pool).await
    }

    pub(super) async fn write_file(path: String, contents: String) -> Result<(), ApiError> {
        filesystem::write(path, contents).await
    }

    pub(super) async fn read_file(path: String) -> Result<Option<String>, ApiError> {
        filesystem::read(path).await
    }

    pub(super) async fn list_directory(directory: String) -> Result<Vec<String>, ApiError> {
        filesystem::list(directory).await
    }

    pub(super) async fn remove_file(path: String) -> Result<(), ApiError> {
        filesystem::remove(path).await
    }
}
