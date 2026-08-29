use std::collections::HashMap;

use serde_json::Value;

use super::client::{TMDB_BASE_URL, http_client, is_valid_tmdb_path, tmdb_request_impl};
use crate::error::ApiError;

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
    use super::*;

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
}
