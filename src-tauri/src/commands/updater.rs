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

    /// The shipped tauri.conf.json is what the app reads at runtime: an update
    /// channel that is half-configured (a pubkey with no endpoint, an endpoint
    /// that does not serve the file the release workflow publishes) would only
    /// show up as a failing update check on a user's machine.
    #[test]
    fn the_shipped_config_is_a_complete_update_channel() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
        let updater = config.pointer("/plugins/updater");
        assert!(
            has_updater_config(updater),
            "pubkey and endpoint must be set"
        );

        let endpoints = updater.unwrap()["endpoints"].as_array().unwrap();
        assert_eq!(
            endpoints,
            &[json!(
                "https://github.com/Arrows78/cinetrack/releases/latest/download/latest.json"
            )],
            "latest.json is the file tauri-action attaches to each release"
        );
        // The release workflow signs the update bundles only when told to
        // produce them.
        assert_eq!(
            config.pointer("/bundle/createUpdaterArtifacts"),
            Some(&json!(true))
        );
    }
}
