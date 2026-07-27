use std::{collections::HashMap, fmt, sync::OnceLock, time::Duration};

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

/// A single shared client, built once and reused for every request.
/// reqwest::Client wraps a connection pool internally — building a fresh one
/// per call (the previous behavior) threw away keep-alive connections and
/// paid the TLS handshake cost on every single TMDB request.
fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(20))
            .build()
            .expect("failed to build the shared TMDB HTTP client")
    })
}

const MAX_ATTEMPTS: u32 = 3;
const RETRY_BASE_DELAY: Duration = Duration::from_millis(250);

#[tauri::command]
pub async fn tmdb_request(
    path: String,
    params: HashMap<String, String>,
    token: String,
) -> Result<Value, TmdbError> {
    if !path.starts_with('/') || path.contains("..") || path.contains("://") {
        return Err(TmdbError::new("Invalid TMDB path"));
    }

    let url = format!("https://api.themoviedb.org/3{path}");
    let client = http_client();
    let mut last_error = TmdbError::new("TMDB request failed");

    // Controlled retry: bounded attempts with exponential backoff, and only
    // for failures that are plausibly transient (network errors, 5xx).
    // 4xx responses (bad request, unauthorized, not found, rate-limited)
    // return immediately — retrying those wastes time and, for 429
    // specifically, would just hammer an already-rate-limited endpoint.
    for attempt in 0..MAX_ATTEMPTS {
        if attempt > 0 {
            tokio::time::sleep(RETRY_BASE_DELAY * 2u32.pow(attempt - 1)).await;
        }

        let response = match client
            .get(&url)
            .bearer_auth(&token)
            .header("accept", "application/json")
            .query(&params)
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                last_error = TmdbError::new(error.to_string());
                continue;
            }
        };

        let status = response.status();
        let body = match response.text().await {
            Ok(body) => body,
            Err(error) => {
                last_error = TmdbError::new(error.to_string());
                continue;
            }
        };

        if status.is_success() {
            return serde_json::from_str(&body).map_err(|error| TmdbError::new(error.to_string()));
        }

        last_error = TmdbError::with_status(body, status.as_u16());

        if !status.is_server_error() {
            return Err(last_error);
        }
        // 5xx: fall through to the next attempt.
    }

    Err(last_error)
}
