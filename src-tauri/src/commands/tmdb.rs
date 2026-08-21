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
const TMDB_BASE_URL: &str = "https://api.themoviedb.org/3";

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

/// The base-URL-parameterized core of `tmdb_request` — split out so tests can
/// point it at a local mock server instead of the real TMDB API, the same
/// `_impl` split this codebase's command layer already uses everywhere else
/// for the SQLite pool (see any commands/*.rs file), just for an HTTP
/// dependency instead of a database one.
async fn tmdb_request_impl(
    base_url: &str,
    client: &reqwest::Client,
    path: &str,
    params: &HashMap<String, String>,
    token: &str,
) -> Result<Value, ApiError> {
    let url = format!("{base_url}{path}");
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
            .bearer_auth(token)
            .header("accept", "application/json")
            .query(params)
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

#[tauri::command]
pub async fn tmdb_request(
    path: String,
    params: HashMap<String, String>,
    token: String,
) -> Result<Value, ApiError> {
    if !is_valid_tmdb_path(&path) {
        return Err(ApiError::bad_request("Invalid TMDB path"));
    }

    tmdb_request_impl(TMDB_BASE_URL, http_client(), &path, &params, &token).await
}

#[cfg(test)]
mod tests {
    use std::net::TcpListener;

    use wiremock::matchers::method;
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;

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

    fn test_client() -> reqwest::Client {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap()
    }

    /// Binds an OS-assigned free port and immediately drops the listener,
    /// so connecting a client to it fails fast with a real "connection
    /// refused" — a deterministic, no-network-dependency way to exercise
    /// `tmdb_request_impl`'s transport-error retry path without needing a
    /// server that's actually unreachable over the real network.
    fn unreachable_base_url() -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        format!("http://127.0.0.1:{port}")
    }

    #[tokio::test]
    async fn returns_the_parsed_json_body_on_a_successful_response() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({ "id": 550 })),
            )
            .expect(1)
            .mount(&server)
            .await;

        let result = tmdb_request_impl(
            &server.uri(),
            &test_client(),
            "/movie/550",
            &HashMap::new(),
            "token",
        )
        .await
        .unwrap();

        assert_eq!(result["id"], 550);
    }

    #[tokio::test]
    async fn a_successful_response_with_a_non_json_body_is_an_internal_error() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_string("not json"))
            .expect(1)
            .mount(&server)
            .await;

        let error = tmdb_request_impl(
            &server.uri(),
            &test_client(),
            "/movie/550",
            &HashMap::new(),
            "token",
        )
        .await
        .unwrap_err();

        assert_eq!(error.status, Some(500));
    }

    #[tokio::test]
    async fn a_4xx_response_returns_immediately_without_retrying() {
        let server = MockServer::start().await;
        // `.expect(1)` fails the test on drop if the mock is hit more than
        // once — the whole point of this test is confirming no retry happens.
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(404).set_body_string("Not Found"))
            .expect(1)
            .mount(&server)
            .await;

        let error = tmdb_request_impl(
            &server.uri(),
            &test_client(),
            "/movie/999999",
            &HashMap::new(),
            "token",
        )
        .await
        .unwrap_err();

        assert_eq!(error.status, Some(404));
        assert_eq!(error.message, "Not Found");
    }

    #[tokio::test]
    async fn a_5xx_response_is_retried_up_to_the_max_attempts_then_surfaces_the_last_error() {
        let server = MockServer::start().await;
        // `.expect(3)` both asserts the retry count and fails the test if
        // the loop retries more or fewer times than MAX_ATTEMPTS.
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(503).set_body_string("Service Unavailable"))
            .expect(3)
            .mount(&server)
            .await;

        let error = tmdb_request_impl(
            &server.uri(),
            &test_client(),
            "/movie/1",
            &HashMap::new(),
            "token",
        )
        .await
        .unwrap_err();

        assert_eq!(error.status, Some(503));
    }

    #[tokio::test]
    async fn tmdb_request_command_rejects_an_invalid_path_before_making_any_request() {
        // Exercises the `tmdb_request` command wrapper's own validation
        // branch directly — without this early return, the real
        // `http_client()` (a genuine reqwest::Client pointed at the real
        // TMDB API) would be reached, which a unit test must never do.
        let error = tmdb_request("movie/550".to_string(), HashMap::new(), "token".to_string())
            .await
            .unwrap_err();

        assert_eq!(error.status, Some(400));
    }

    #[tokio::test]
    async fn a_transport_error_is_retried_up_to_the_max_attempts_then_surfaces_a_502() {
        let error = tmdb_request_impl(
            &unreachable_base_url(),
            &test_client(),
            "/movie/1",
            &HashMap::new(),
            "token",
        )
        .await
        .unwrap_err();

        assert_eq!(error.status, Some(502));
    }
}
