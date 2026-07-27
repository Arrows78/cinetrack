use std::{collections::HashMap, fmt, time::Duration};

use serde::Serialize;
use serde_json::Value;

/// A structured, serializable error for `tmdb_request`. Tauri serializes the
/// `Err` variant of a command's `Result` to JSON when it implements
/// `Serialize`, so the frontend receives `{ message, status }` directly from
/// `invoke()`'s rejection instead of having to regex-parse a formatted
/// string (the previous `Result<Value, String>` approach).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TmdbError {
    pub message: String,
    pub status: Option<u16>,
}

impl TmdbError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            status: None,
        }
    }

    fn with_status(message: impl Into<String>, status: u16) -> Self {
        Self {
            message: message.into(),
            status: Some(status),
        }
    }
}

impl fmt::Display for TmdbError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for TmdbError {}

#[tauri::command]
pub async fn tmdb_request(
    path: String,
    params: HashMap<String, String>,
    token: String,
) -> Result<Value, TmdbError> {
    if !path.starts_with('/') || path.contains("..") || path.contains("://") {
        return Err(TmdbError::new("Invalid TMDB path"));
    }

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| TmdbError::new(error.to_string()))?;

    let response = client
        .get(format!("https://api.themoviedb.org/3{path}"))
        .bearer_auth(token)
        .header("accept", "application/json")
        .query(&params)
        .send()
        .await
        .map_err(|error| TmdbError::new(error.to_string()))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| TmdbError::new(error.to_string()))?;

    if !status.is_success() {
        return Err(TmdbError::with_status(body, status.as_u16()));
    }

    serde_json::from_str(&body).map_err(|error| TmdbError::new(error.to_string()))
}
