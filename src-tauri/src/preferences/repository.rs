use std::sync::Mutex;

use serde_json::{Map, Value};
use sqlx::SqlitePool;

use super::models::{UserPreferences, validate};
use crate::database::now_iso;
use crate::error::ApiError;

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

pub(super) async fn load_preferences(pool: &SqlitePool) -> Result<UserPreferences, ApiError> {
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

pub(super) async fn get_preferences_cached(
    pool: &SqlitePool,
    cache: &PreferencesCache,
) -> Result<UserPreferences, ApiError> {
    if let Some(prefs) = cache
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
    {
        return Ok(prefs);
    }

    let prefs = load_preferences(pool).await?;
    *cache
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(prefs.clone());
    Ok(prefs)
}

pub(super) async fn write_preference(
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

    *cache
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(updated.clone());
    Ok(updated)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    use crate::preferences::models::{LibraryViewMode, Theme};

    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database::migrations::run_migrations(&pool)
            .await
            .unwrap();
        pool
    }

    #[tokio::test]
    async fn defaults_are_returned_when_nothing_is_stored() {
        let pool = migrated_pool().await;
        let cache = PreferencesCache::default();
        let prefs = get_preferences_cached(&pool, &cache).await.unwrap();

        assert!(matches!(prefs.theme, Theme::Dark));
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
    }

    #[tokio::test]
    async fn load_preferences_ignores_malformed_legacy_rows() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO preferences (key, value, updated_at) VALUES ('theme', 'not-json', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let prefs = load_preferences(&pool).await.unwrap();
        assert!(matches!(prefs.theme, Theme::Dark));
    }

    #[tokio::test]
    async fn write_preference_round_trips_library_view_mode() {
        let pool = migrated_pool().await;
        let cache = PreferencesCache::default();

        let updated = write_preference(
            "libraryViewMode".to_string(),
            Value::String("list".to_string()),
            &pool,
            &cache,
        )
        .await
        .unwrap();
        assert!(matches!(updated.library_view_mode, LibraryViewMode::List));

        // A fresh cache (simulating the next get_preferences call after a
        // restart) must still see it — regression test for the bug where
        // this field was only ever readable from the merge, never actually
        // declared on UserPreferences, so it silently vanished on every
        // read and update_preference("libraryViewMode", ...) errored with
        // "Unknown preference key".
        let reloaded = load_preferences(&pool).await.unwrap();
        assert!(matches!(reloaded.library_view_mode, LibraryViewMode::List));
    }

    #[tokio::test]
    async fn write_preference_round_trips_a_custom_backup_directory() {
        let pool = migrated_pool().await;
        let cache = PreferencesCache::default();

        let updated = write_preference(
            "backupDirectory".to_string(),
            Value::String("/Users/alex/iCloud Drive/CineTrack Backups".to_string()),
            &pool,
            &cache,
        )
        .await
        .unwrap();
        assert_eq!(
            updated.backup_directory.as_deref(),
            Some("/Users/alex/iCloud Drive/CineTrack Backups")
        );

        // A fresh cache (simulating the next get_preferences call after a
        // restart) must still see it.
        let reloaded = load_preferences(&pool).await.unwrap();
        assert_eq!(
            reloaded.backup_directory.as_deref(),
            Some("/Users/alex/iCloud Drive/CineTrack Backups")
        );
    }

    #[tokio::test]
    async fn backup_directory_defaults_to_none_and_can_be_reset() {
        let pool = migrated_pool().await;
        let cache = PreferencesCache::default();

        let defaults = get_preferences_cached(&pool, &cache).await.unwrap();
        assert_eq!(defaults.backup_directory, None);

        write_preference(
            "backupDirectory".to_string(),
            Value::String("/tmp/backups".to_string()),
            &pool,
            &cache,
        )
        .await
        .unwrap();

        let reset = write_preference("backupDirectory".to_string(), Value::Null, &pool, &cache)
            .await
            .unwrap();
        assert_eq!(reset.backup_directory, None);
    }

    #[tokio::test]
    async fn get_preferences_cached_returns_the_cached_value_without_reloading_from_the_database() {
        let pool = migrated_pool().await;
        let cache = PreferencesCache::default();

        let first = get_preferences_cached(&pool, &cache).await.unwrap();
        assert!(matches!(first.theme, Theme::Dark));

        // Write directly to the DB, bypassing the cache entirely. If
        // get_preferences_cached reloaded from disk on this second call, it
        // would observe this new value; asserting it still sees the old one
        // proves the cache-hit early-return branch fired instead.
        sqlx::query(
            "INSERT INTO preferences (key, value, updated_at) VALUES ('theme', '\"light\"', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let second = get_preferences_cached(&pool, &cache).await.unwrap();
        assert!(
            matches!(second.theme, Theme::Dark),
            "expected the stale cached value, proving the cache-hit branch returned early"
        );
    }
}
