use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sqlx::SqlitePool;
use tauri::State;

use crate::database::now_iso;
use crate::error::ApiError;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Dark,
    Light,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AccentColor {
    Violet,
    Blue,
    Teal,
    Green,
    Amber,
    Orange,
    Rose,
    Red,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    En,
    Fr,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SearchScope {
    All,
    Movie,
    Series,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub id: String,
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
}

impl Default for UserProfile {
    fn default() -> Self {
        Self {
            id: "default".to_string(),
            name: None,
            avatar: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferences {
    pub theme: Theme,
    pub accent_color: AccentColor,
    pub language: Language,
    pub region: String,
    pub default_search_type: SearchScope,
    pub default_watchlist_filter: SearchScope,
    pub reduce_motion: bool,
    pub compact_mode: bool,
    pub sidebar_collapsed: bool,
    pub spoiler_protection: bool,
    pub notifications_enabled: bool,
    pub notify_hours_before: u32,
    pub preferred_provider_ids: Vec<i64>,
    pub active_profile_id: String,
    pub user_profile: UserProfile,
}

impl Default for UserPreferences {
    fn default() -> Self {
        Self {
            theme: Theme::Dark,
            accent_color: AccentColor::Violet,
            language: Language::En,
            region: "FR".to_string(),
            default_search_type: SearchScope::All,
            default_watchlist_filter: SearchScope::All,
            reduce_motion: false,
            compact_mode: false,
            sidebar_collapsed: false,
            spoiler_protection: true,
            notifications_enabled: false,
            notify_hours_before: 24,
            preferred_provider_ids: Vec::new(),
            active_profile_id: "default".to_string(),
            user_profile: UserProfile::default(),
        }
    }
}

/// Mirrors the zod constraints in preferences-repository.ts that a plain
/// serde deserialize can't express (regex/range/positivity), so a malformed
/// stored value still fails loudly instead of being silently accepted.
fn validate(prefs: &UserPreferences) -> Result<(), ApiError> {
    let region_is_valid =
        prefs.region.len() == 2 && prefs.region.chars().all(|c| c.is_ascii_uppercase());
    if !region_is_valid {
        return Err(ApiError::bad_request("region must be a 2-letter uppercase country code"));
    }
    if prefs.notify_hours_before > 168 {
        return Err(ApiError::bad_request("notifyHoursBefore must be between 0 and 168"));
    }
    if prefs.preferred_provider_ids.iter().any(|id| *id <= 0) {
        return Err(ApiError::bad_request("preferredProviderIds must all be positive"));
    }
    Ok(())
}

/// State holding the in-memory preferences cache, mirroring the module-level
/// `cache` variable in preferences-repository.ts: preferences are read
/// constantly, but this app is a single window/instance, so a cache
/// invalidated on every write is always fresh and avoids a round trip.
pub struct PreferencesCache(pub Mutex<Option<UserPreferences>>);

impl Default for PreferencesCache {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

async fn load_preferences(pool: &SqlitePool) -> Result<UserPreferences, ApiError> {
    let rows: Vec<(String, String)> = sqlx::query_as("SELECT key, value FROM preferences")
        .fetch_all(pool)
        .await
        .map_err(ApiError::from)?;

    let mut merged: Map<String, Value> = match serde_json::to_value(UserPreferences::default()) {
        Ok(Value::Object(map)) => map,
        _ => unreachable!("UserPreferences always serializes to a JSON object"),
    };

    for (key, raw_value) in rows {
        // Ignore invalid legacy values and fall back to the default already
        // present in `merged`, matching the try/catch-and-skip in
        // preferences-repository.ts.
        if let Ok(value) = serde_json::from_str::<Value>(&raw_value) {
            merged.insert(key, value);
        }
    }

    let prefs: UserPreferences = serde_json::from_value(Value::Object(merged))
        .map_err(|error| ApiError::bad_request(format!("Invalid stored preferences: {error}")))?;
    validate(&prefs)?;
    Ok(prefs)
}

async fn get_preferences_cached(
    pool: &SqlitePool,
    cache: &PreferencesCache,
) -> Result<UserPreferences, ApiError> {
    if let Some(prefs) = cache.0.lock().unwrap().clone() {
        return Ok(prefs);
    }

    let prefs = load_preferences(pool).await?;
    *cache.0.lock().unwrap() = Some(prefs.clone());
    Ok(prefs)
}

#[tauri::command]
pub async fn get_preferences(
    pool: State<'_, SqlitePool>,
    cache: State<'_, PreferencesCache>,
) -> Result<UserPreferences, ApiError> {
    get_preferences_cached(&pool, &cache).await
}

#[tauri::command]
pub async fn update_preference(
    key: String,
    value: Value,
    pool: State<'_, SqlitePool>,
    cache: State<'_, PreferencesCache>,
) -> Result<UserPreferences, ApiError> {
    let current = get_preferences_cached(&pool, &cache).await?;

    let mut merged = match serde_json::to_value(&current) {
        Ok(Value::Object(map)) => map,
        _ => unreachable!("UserPreferences always serializes to a JSON object"),
    };
    merged.insert(key.clone(), value);

    let updated: UserPreferences = serde_json::from_value(Value::Object(merged))
        .map_err(|error| ApiError::bad_request(format!("Invalid preference value: {error}")))?;
    validate(&updated)?;

    let updated_json = match serde_json::to_value(&updated) {
        Ok(Value::Object(map)) => map,
        _ => unreachable!("UserPreferences always serializes to a JSON object"),
    };
    let stored_value = updated_json
        .get(&key)
        .ok_or_else(|| ApiError::bad_request(format!("Unknown preference key: {key}")))?;

    let timestamp = now_iso(&*pool).await?;

    sqlx::query(
        "INSERT INTO preferences (key, value, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(&key)
    .bind(stored_value.to_string())
    .bind(&timestamp)
    .execute(&*pool)
    .await
    .map_err(ApiError::from)?;

    *cache.0.lock().unwrap() = Some(updated.clone());
    Ok(updated)
}

/// Forces the next `get_preferences` call to reload from disk instead of
/// returning the in-memory cache — needed after something writes preference
/// rows directly (e.g. a backup restore) without going through
/// `update_preference`.
#[tauri::command]
pub fn refresh_preferences(cache: State<'_, PreferencesCache>) {
    *cache.0.lock().unwrap() = None;
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database::migrations::run_migrations(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn defaults_are_returned_when_nothing_is_stored() {
        let pool = migrated_pool().await;
        let cache = PreferencesCache::default();
        let prefs = get_preferences_cached(&pool, &cache).await.unwrap();

        assert!(matches!(prefs.theme, Theme::Dark));
        assert_eq!(prefs.language, Language::En);
        assert_eq!(prefs.active_profile_id, "default");
    }

    #[tokio::test]
    async fn load_preferences_merges_stored_rows_over_defaults() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO preferences (key, value, updated_at) VALUES ('theme', '\"light\"', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let prefs = load_preferences(&pool).await.unwrap();
        assert!(matches!(prefs.theme, Theme::Light));
        // Untouched fields keep their defaults.
        assert_eq!(prefs.language, Language::En);
    }

    #[tokio::test]
    async fn load_preferences_ignores_malformed_legacy_rows() {
        let pool = migrated_pool().await;
        sqlx::query("INSERT INTO preferences (key, value, updated_at) VALUES ('theme', 'not-json', 'now')")
            .execute(&pool)
            .await
            .unwrap();

        let prefs = load_preferences(&pool).await.unwrap();
        assert!(matches!(prefs.theme, Theme::Dark));
    }

    #[tokio::test]
    async fn rejects_an_invalid_region() {
        let prefs = UserPreferences {
            region: "fr".to_string(),
            ..UserPreferences::default()
        };
        assert!(validate(&prefs).is_err());
    }

    #[tokio::test]
    async fn rejects_out_of_range_notify_hours() {
        let prefs = UserPreferences {
            notify_hours_before: 200,
            ..UserPreferences::default()
        };
        assert!(validate(&prefs).is_err());
    }
}
