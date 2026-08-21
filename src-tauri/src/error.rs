use std::fmt;

use serde::Serialize;

/// A structured, serializable error shared by every Tauri command in this
/// app. Tauri serializes the `Err` variant of a command's `Result` to JSON
/// when it implements `Serialize`, so the frontend receives `{ message,
/// status }` directly from `invoke()`'s rejection instead of having to
/// regex-parse a formatted string. `status` mirrors HTTP status codes so the
/// same shape can later back a real HTTP API without changing callers.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    pub message: String,
    pub status: Option<u16>,
}

impl ApiError {
    pub fn with_status(message: impl Into<String>, status: u16) -> Self {
        Self {
            message: message.into(),
            status: Some(status),
        }
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::with_status(message, 400)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::with_status(message, 404)
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::with_status(message, 403)
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::with_status(message, 409)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::with_status(message, 500)
    }
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ApiError {}

impl From<sqlx::Error> for ApiError {
    fn from(error: sqlx::Error) -> Self {
        if let sqlx::Error::Database(db_error) = &error
            && db_error.is_unique_violation()
        {
            return Self::conflict(db_error.message().to_string());
        }
        Self::internal(error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use sqlx::SqlitePool;
    use sqlx::sqlite::SqlitePoolOptions;

    use super::*;

    #[test]
    fn displays_the_message() {
        let error = ApiError::bad_request("some message");
        assert_eq!(error.to_string(), "some message");
    }

    #[test]
    fn non_database_sqlx_errors_fall_back_to_an_internal_error() {
        let error = ApiError::from(sqlx::Error::RowNotFound);
        assert_eq!(error.status, Some(500));
    }

    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database::migrations::run_migrations(&pool)
            .await
            .unwrap();
        pool
    }

    #[tokio::test]
    async fn a_database_error_that_is_not_a_unique_violation_falls_back_to_an_internal_error() {
        let pool = migrated_pool().await;

        // A FOREIGN KEY violation (library_items.profile_id references a
        // profile that doesn't exist) is a real sqlx::Error::Database, but
        // not a unique-violation one — distinct from every other test that
        // exercises this From impl, which all go through a UNIQUE index.
        let result = sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, created_at, updated_at)
             VALUES ('x', 'nonexistent-profile', 1, 'movie', 'Test', 'now', 'now')",
        )
        .execute(&pool)
        .await;

        let sqlx_error = result.expect_err("a missing profile_id should violate the FK constraint");
        let api_error = ApiError::from(sqlx_error);
        assert_eq!(api_error.status, Some(500));
    }
}
