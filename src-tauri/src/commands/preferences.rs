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
    if let Some(prefs) = cache.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).clone() {
        return Ok(prefs);
    }

    let prefs = load_preferences(pool).await?;
    *cache.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(prefs.clone());
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
    // activeProfileId controls which profile every other profile-scoped
    // command reads/writes (see current_profile_id in database/mod.rs) — it
    // must never be settable as "just another preference key" with no check
    // on the target. Route it through set_active_profile instead, which
    // confirms the profile exists and, when it's linked to a Supabase
    // account, that the caller actually proved they're signed in as that
    // account (see that command's own doc comment for exactly what this
    // does and doesn't guarantee).
    if key == "activeProfileId" {
        return Err(ApiError::bad_request(
            "activeProfileId must be set via set_active_profile, not update_preference.",
        ));
    }
    write_preference(key, value, &pool, &cache).await
}

async fn write_preference(
    key: String,
    value: Value,
    pool: &SqlitePool,
    cache: &PreferencesCache,
) -> Result<UserPreferences, ApiError> {
    let current = get_preferences_cached(pool, cache).await?;

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

    let timestamp = now_iso(pool).await?;

    sqlx::query(
        "INSERT INTO preferences (key, value, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(&key)
    .bind(stored_value.to_string())
    .bind(&timestamp)
    .execute(pool)
    .await
    .map_err(ApiError::from)?;

    *cache.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(updated.clone());
    Ok(updated)
}

/// The one legitimate way to switch `activeProfileId`. Every other
/// profile-scoped Rust command trusts `current_profile_id()` (which just
/// re-reads this preference) with no further check of its own — so this is
/// the single choke point where a switch either has to be self-evidently
/// safe, or has to be justified by the same proof `resolve_profile_for_
/// supabase_user` already relies on elsewhere in this codebase.
///
/// This is *not* cryptographic verification — `supabase_user_id` is a bare
/// string over the same untrusted `invoke()` boundary as everything else
/// here, exactly like `resolve_profile_for_supabase_user_impl` already
/// trusts it. What it closes is the gap where `update_preference` accepted
/// `activeProfileId` as literally any string with zero check at all: a
/// caller can no longer switch into a profile that doesn't exist, or into
/// one that's linked to a Supabase account without at least echoing back
/// that account's id (which, in the real app, `ProfileGate` only ever does
/// after `resolve_profile_for_supabase_user` itself confirmed the match).
/// `default` is exempt — it's the app's pre-Supabase-auth fallback profile,
/// already special-cased the same way in `resolve_for_supabase_user_impl`
/// (auto-claimed rather than gated) and as the only profile `remove_impl`
/// refuses to ever delete, so it's always a safe landing pad.
async fn set_active_profile_impl(
    pool: &SqlitePool,
    cache: &PreferencesCache,
    profile_id: &str,
    supabase_user_id: Option<&str>,
) -> Result<UserPreferences, ApiError> {
    let owner: Option<(Option<String>,)> =
        sqlx::query_as("SELECT supabase_user_id FROM profiles WHERE uuid = $1")
            .bind(profile_id)
            .fetch_optional(pool)
            .await
            .map_err(ApiError::from)?;

    let Some((linked_supabase_user_id,)) = owner else {
        return Err(ApiError::not_found("Profile not found."));
    };

    if profile_id != "default"
        && let Some(required) = linked_supabase_user_id
        && supabase_user_id != Some(required.as_str())
    {
        return Err(ApiError::forbidden("This profile requires signing in with the account it's linked to."));
    }

    write_preference(
        "activeProfileId".to_string(),
        Value::String(profile_id.to_string()),
        pool,
        cache,
    )
    .await
}

#[tauri::command]
pub async fn set_active_profile(
    profile_id: String,
    supabase_user_id: Option<String>,
    pool: State<'_, SqlitePool>,
    cache: State<'_, PreferencesCache>,
) -> Result<UserPreferences, ApiError> {
    set_active_profile_impl(&pool, &cache, &profile_id, supabase_user_id.as_deref()).await
}

/// Forces the next `get_preferences` call to reload from disk instead of
/// returning the in-memory cache — needed after something writes preference
/// rows directly (e.g. a backup restore) without going through
/// `update_preference`.
#[tauri::command]
pub fn refresh_preferences(cache: State<'_, PreferencesCache>) {
    *cache.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
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

    #[tokio::test]
    async fn set_active_profile_switches_freely_to_an_unclaimed_profile() {
        let pool = migrated_pool().await;
        let cache = PreferencesCache::default();
        sqlx::query("INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('alex', 'Alex', 'now', 'now')")
            .execute(&pool)
            .await
            .unwrap();

        let updated = set_active_profile_impl(&pool, &cache, "alex", None).await.unwrap();
        assert_eq!(updated.active_profile_id, "alex");
    }

    #[tokio::test]
    async fn set_active_profile_rejects_a_nonexistent_profile() {
        let pool = migrated_pool().await;
        let cache = PreferencesCache::default();

        assert!(set_active_profile_impl(&pool, &cache, "ghost", None).await.is_err());
    }

    #[tokio::test]
    async fn set_active_profile_rejects_a_claimed_profile_without_the_matching_supabase_user() {
        let pool = migrated_pool().await;
        let cache = PreferencesCache::default();
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at, supabase_user_id)
             VALUES ('alex', 'Alex', 'now', 'now', 'user-1')",
        )
        .execute(&pool)
        .await
        .unwrap();

        assert!(set_active_profile_impl(&pool, &cache, "alex", None).await.is_err());
        assert!(set_active_profile_impl(&pool, &cache, "alex", Some("someone-else")).await.is_err());
    }

    #[tokio::test]
    async fn set_active_profile_allows_a_claimed_profile_with_the_matching_supabase_user() {
        let pool = migrated_pool().await;
        let cache = PreferencesCache::default();
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at, supabase_user_id)
             VALUES ('alex', 'Alex', 'now', 'now', 'user-1')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let updated = set_active_profile_impl(&pool, &cache, "alex", Some("user-1")).await.unwrap();
        assert_eq!(updated.active_profile_id, "alex");
    }

    #[tokio::test]
    async fn set_active_profile_always_allows_switching_to_default_even_if_claimed() {
        let pool = migrated_pool().await;
        let cache = PreferencesCache::default();
        sqlx::query("UPDATE profiles SET supabase_user_id = 'user-1' WHERE uuid = 'default'")
            .execute(&pool)
            .await
            .unwrap();

        let updated = set_active_profile_impl(&pool, &cache, "default", None).await.unwrap();
        assert_eq!(updated.active_profile_id, "default");
    }
}
