use std::collections::HashMap;
use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use super::client::{
    OVERALL_DEADLINE, TMDB_BASE_URL, http_client, is_valid_tmdb_path, tmdb_request_within,
};
use crate::diagnostics::timed;
use crate::error::ApiError;

/// A TMDB v4 read token is a ~200 character JWT; anything near this bound is
/// not one.
const MAX_TOKEN_LENGTH: usize = 2048;

/// The TMDB bearer token, held on the Rust side so `tmdb_request` does not
/// need the webview to send it along with every call. The frontend hands it
/// over once (from the Stronghold vault) with `set_tmdb_token`; it is never
/// written to disk or the database here, and never returned to the webview.
#[derive(Default)]
pub struct TmdbToken(Mutex<Option<String>>);

impl TmdbToken {
    fn get(&self) -> Option<String> {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    fn set(&self, token: Option<String>) {
        *self
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = token;
    }
}

/// Stores (or, with `None` or a blank value, forgets) the token the next
/// `tmdb_request` calls authenticate with. Idempotent: calling it again with
/// the same value changes nothing.
fn store_token(state: &TmdbToken, token: Option<String>) -> Result<(), ApiError> {
    let token = token
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty());
    if let Some(token) = &token
        && (token.len() > MAX_TOKEN_LENGTH || !token.bytes().all(|byte| byte.is_ascii_graphic()))
    {
        return Err(ApiError::bad_request("Invalid TMDB token."));
    }
    state.set(token);
    Ok(())
}

#[tauri::command]
pub fn set_tmdb_token(token: Option<String>, state: State<'_, TmdbToken>) -> Result<(), ApiError> {
    store_token(state.inner(), token)
}

async fn request(
    state: &TmdbToken,
    base_url: &str,
    path: &str,
    params: &HashMap<String, String>,
) -> Result<Value, ApiError> {
    if !is_valid_tmdb_path(path) {
        return Err(ApiError::bad_request("Invalid TMDB path"));
    }
    let Some(token) = state.get() else {
        // 401, like TMDB's own answer to a missing token: the frontend treats
        // it as "the token needs entering again".
        return Err(ApiError::with_status("No TMDB token is configured.", 401));
    };

    tmdb_request_within(
        OVERALL_DEADLINE,
        base_url,
        http_client(),
        path,
        params,
        &token,
    )
    .await
}

#[tauri::command]
pub async fn tmdb_request(
    path: String,
    params: HashMap<String, String>,
    state: State<'_, TmdbToken>,
) -> Result<Value, ApiError> {
    timed("tmdb_request", async {
        request(state.inner(), TMDB_BASE_URL, &path, &params).await
    })
    .await
}

#[cfg(test)]
mod tests {
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;

    #[tokio::test]
    async fn rejects_an_invalid_path_before_looking_at_the_token_or_making_any_request() {
        // Without this early return, the real `http_client()` (a genuine
        // reqwest::Client) would be reached, which a unit test must never do.
        let state = TmdbToken::default();
        store_token(&state, Some("token".to_string())).unwrap();

        for bad in [
            "movie/550",
            "/movie/%2e%2e/x",
            "/movie\\..\\x",
            "/movie/550?a=b",
        ] {
            let error = request(&state, "http://127.0.0.1:1", bad, &HashMap::new())
                .await
                .unwrap_err();
            assert_eq!(error.status, Some(400), "{bad}");
        }
    }

    #[tokio::test]
    async fn without_a_stored_token_the_request_is_refused_as_unauthorized() {
        let state = TmdbToken::default();
        let error = request(&state, "http://127.0.0.1:1", "/movie/550", &HashMap::new())
            .await
            .unwrap_err();
        assert_eq!(error.status, Some(401));
    }

    #[tokio::test]
    async fn the_stored_token_is_what_authenticates_the_request() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/movie/550"))
            .and(header("authorization", "Bearer stored-token"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({ "id": 550 })),
            )
            .expect(1)
            .mount(&server)
            .await;

        let state = TmdbToken::default();
        store_token(&state, Some("  stored-token \n".to_string())).unwrap();
        let body = request(&state, &server.uri(), "/movie/550", &HashMap::new())
            .await
            .unwrap();
        assert_eq!(body["id"], 550);
    }

    #[tokio::test]
    async fn clearing_the_token_stops_authenticating_requests() {
        let state = TmdbToken::default();
        store_token(&state, Some("token".to_string())).unwrap();
        store_token(&state, None).unwrap();
        assert!(state.get().is_none());

        store_token(&state, Some("token".to_string())).unwrap();
        store_token(&state, Some("   ".to_string())).unwrap();
        assert!(state.get().is_none());
    }

    #[test]
    fn storing_the_same_token_twice_is_a_no_op() {
        let state = TmdbToken::default();
        store_token(&state, Some("token".to_string())).unwrap();
        store_token(&state, Some("token".to_string())).unwrap();
        assert_eq!(state.get().as_deref(), Some("token"));
    }

    #[test]
    fn refuses_a_token_that_could_not_be_a_header_value() {
        let state = TmdbToken::default();
        for bad in [
            "to ken",
            "tok\nen",
            "tök",
            &"a".repeat(MAX_TOKEN_LENGTH + 1),
        ] {
            let error = store_token(&state, Some(bad.to_string())).unwrap_err();
            assert_eq!(error.status, Some(400));
        }
        assert!(state.get().is_none());
    }
}
