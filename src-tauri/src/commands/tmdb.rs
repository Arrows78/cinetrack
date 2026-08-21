use std::{collections::HashMap, sync::OnceLock, time::Duration};

use serde_json::Value;

use crate::error::ApiError;

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

/// The frontend controls `path`, but it still crosses the IPC boundary, so it
/// is validated as untrusted input: it must stay inside the TMDB v3 API and
/// cannot smuggle a traversal segment, an absolute URL, or a query/fragment
/// that would break out of the `format!`-built URL.
fn is_valid_tmdb_path(path: &str) -> bool {
    path.starts_with('/')
        && !path.contains("..")
        && !path.contains("://")
        && !path.contains('?')
        && !path.contains('#')
}

#[tauri::command]
pub async fn tmdb_request(
    path: String,
    params: HashMap<String, String>,
    token: String,
) -> Result<Value, ApiError> {
    if !is_valid_tmdb_path(&path) {
        return Err(ApiError::bad_request("Invalid TMDB path"));
    }

    let url = format!("https://api.themoviedb.org/3{path}");
    let client = http_client();
    let mut last_error = ApiError::with_status("TMDB request failed", 502);

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
                last_error = ApiError::with_status(error.to_string(), 502);
                continue;
            }
        };

        let status = response.status();
        let body = match response.text().await {
            Ok(body) => body,
            Err(error) => {
                last_error = ApiError::with_status(error.to_string(), 502);
                continue;
            }
        };

        if status.is_success() {
            return serde_json::from_str(&body)
                .map_err(|error| ApiError::internal(error.to_string()));
        }

        last_error = ApiError::with_status(body, status.as_u16());

        if !status.is_server_error() {
            return Err(last_error);
        }
        // 5xx: fall through to the next attempt.
    }

    Err(last_error)
}

#[cfg(test)]
mod tests {
    use super::is_valid_tmdb_path;

    #[test]
    fn accepts_normal_tmdb_api_paths() {
        assert!(is_valid_tmdb_path("/movie/550"));
        assert!(is_valid_tmdb_path("/tv/1399/season/1"));
        assert!(is_valid_tmdb_path("/search/multi"));
        assert!(is_valid_tmdb_path("/trending/movie/week"));
    }

    #[test]
    fn rejects_paths_that_escape_the_tmdb_api() {
        // Must be rooted.
        assert!(!is_valid_tmdb_path(""));
        assert!(!is_valid_tmdb_path("movie/550"));
        // Traversal.
        assert!(!is_valid_tmdb_path("/movie/../../4/secret"));
        // Absolute URL smuggling.
        assert!(!is_valid_tmdb_path("/https://evil.example"));
        // Query or fragment injection into the format!-built URL.
        assert!(!is_valid_tmdb_path("/movie/550?api_key=stolen"));
        assert!(!is_valid_tmdb_path("/movie/550#fragment"));
    }
}
