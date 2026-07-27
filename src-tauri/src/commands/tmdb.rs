use std::{collections::HashMap, time::Duration};

use serde_json::Value;

#[tauri::command]
pub async fn tmdb_request(
    path: String,
    params: HashMap<String, String>,
    token: String,
) -> Result<Value, String> {
    if !path.starts_with('/') || path.contains("..") || path.contains("://") {
        return Err("Invalid TMDB path".into());
    }

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(format!("https://api.themoviedb.org/3{path}"))
        .bearer_auth(token)
        .header("accept", "application/json")
        .query(&params)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;

    if !status.is_success() {
        return Err(format!("TMDB {status}: {body}"));
    }

    serde_json::from_str(&body).map_err(|error| error.to_string())
}
