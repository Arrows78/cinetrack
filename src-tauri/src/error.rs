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
