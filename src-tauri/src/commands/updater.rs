use serde_json::Value;

pub fn has_updater_config(config: Option<&Value>) -> bool {
    let Some(config) = config.and_then(Value::as_object) else {
        return false;
    };

    let has_pubkey = config
        .get("pubkey")
        .and_then(Value::as_str)
        .is_some_and(|pubkey| !pubkey.trim().is_empty());

    let has_endpoint = config
        .get("endpoints")
        .and_then(Value::as_array)
        .is_some_and(|endpoints| {
            endpoints.iter().any(|endpoint| {
                endpoint
                    .as_str()
                    .is_some_and(|endpoint| !endpoint.trim().is_empty())
            })
        });

    has_pubkey && has_endpoint
}

#[tauri::command]
pub fn updater_is_configured(app: tauri::AppHandle) -> bool {
    has_updater_config(app.config().plugins.0.get("updater"))
}

#[cfg(test)]
mod tests {
    use super::has_updater_config;
    use serde_json::json;

    #[test]
    fn updater_requires_a_pubkey_and_at_least_one_endpoint() {
        assert!(!has_updater_config(None));

        let null_config = json!(null);
        assert!(!has_updater_config(Some(&null_config)));

        let incomplete_config = json!({ "pubkey": "", "endpoints": [] });
        assert!(!has_updater_config(Some(&incomplete_config)));

        let complete_config = json!({
            "pubkey": "public-key",
            "endpoints": ["https://example.com/latest.json"]
        });
        assert!(has_updater_config(Some(&complete_config)));
    }
}
