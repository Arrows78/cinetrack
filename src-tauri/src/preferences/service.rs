use serde_json::Value;
use sqlx::SqlitePool;

#[cfg(desktop)]
use super::models::Language;
use super::models::UserPreferences;
use super::repository::{PreferencesCache, get_preferences_cached, write_preference};
use crate::database::{DEFAULT_PROFILE_ID, current_profile_id};
use crate::error::ApiError;
use crate::profiles::{authorize_pin_protected_access, get_by_id_impl};

pub(super) struct PreferencesService<'a> {
    pool: &'a SqlitePool,
    cache: &'a PreferencesCache,
}

impl<'a> PreferencesService<'a> {
    pub(super) fn new(pool: &'a SqlitePool, cache: &'a PreferencesCache) -> Self {
        Self { pool, cache }
    }

    pub(super) async fn get(&self) -> Result<UserPreferences, ApiError> {
        get_preferences_cached(self.pool, self.cache).await
    }

    pub(super) async fn update(
        &self,
        key: String,
        value: Value,
    ) -> Result<UserPreferences, ApiError> {
        // activeProfileId controls which profile every other profile-scoped
        // command reads/writes (see current_profile_id in database/mod.rs) — it
        // must never be settable as "just another preference key" with no check
        // on the target. Route it through set_active_profile instead, which
        // confirms the profile exists and, when it's linked to a Supabase
        // account, that the caller actually proved they're signed in as that
        // account (see set_active_profile's own doc comment for exactly what
        // this does and doesn't guarantee).
        if key == "activeProfileId" {
            return Err(ApiError::bad_request(
                "activeProfileId must be set via set_active_profile, not update_preference.",
            ));
        }
        write_preference(key, value, self.pool, self.cache).await
    }

    /// The one legitimate way to switch `activeProfileId`. Every other
    /// profile-scoped Rust command trusts `current_profile_id()` (which just
    /// re-reads this preference) with no further check of its own — so this is
    /// the single choke point where a switch either has to be self-evidently
    /// safe, or has to be justified by the same proof
    /// `profiles::resolve_profile_for_supabase_user` already relies on
    /// elsewhere in this codebase.
    ///
    /// `supabase_user_id` holds whichever identity provider's user id is
    /// linked — Clerk's `sub` claim since the Clerk migration, not
    /// specifically Supabase (see profiles/models.rs's doc comment and
    /// docs/auth.md). This is *not* cryptographic verification — it's a bare
    /// string over the same untrusted `invoke()` boundary as everything else
    /// here, exactly like `resolve_profile_for_supabase_user` already trusts
    /// it. What it closes is the gap where `update_preference` accepted
    /// `activeProfileId` as literally any string with zero check at all: a
    /// caller can no longer switch into a profile that doesn't exist, or into
    /// one that's linked to a Supabase account without at least echoing back
    /// that account's id (which, in the real app, `ProfileGate` only ever does
    /// after `resolve_profile_for_supabase_user` itself confirmed the match).
    /// The PIN lock is enforced on top of that, for every PIN-protected profile
    /// (`authorize_pin_protected_access`, which also counts wrong guesses and
    /// locks out a guesser).
    ///
    /// `default` is exempt from the account check — it's the app's pre-Supabase-auth fallback profile,
    /// already special-cased the same way in `resolve_profile_for_supabase_user`
    /// (auto-claimed rather than gated) and as the only profile profile removal
    /// refuses to ever delete, so it's always a safe landing pad.
    pub(super) async fn set_active_profile(
        &self,
        profile_id: &str,
        supabase_user_id: Option<&str>,
        pin: Option<&str>,
    ) -> Result<UserPreferences, ApiError> {
        let owner = get_by_id_impl(self.pool, profile_id).await?;
        let Some(owner) = owner else {
            return Err(ApiError::not_found("Profile not found."));
        };

        if profile_id != DEFAULT_PROFILE_ID
            && let Some(required) = &owner.supabase_user_id
            && supabase_user_id != Some(required.as_str())
        {
            return Err(ApiError::forbidden(
                "This profile requires signing in with the account it's linked to.",
            ));
        }

        // A PIN-protected profile always needs its PIN, linked to an account
        // or not: the account id above is a bare string the caller can echo
        // (and no longer even listed to the webview), so it is not a second
        // lock to stand in for the PIN. The one exception is the fallback to
        // "default" after the active profile was deleted — without it,
        // removing the active profile would leave activeProfileId pointing at
        // a row that no longer exists.
        let active_was_removed = profile_id == DEFAULT_PROFILE_ID
            && get_by_id_impl(self.pool, &current_profile_id(self.pool).await?)
                .await?
                .is_none();
        if !active_was_removed {
            authorize_pin_protected_access(self.pool, profile_id, pin).await?;
        }

        write_preference(
            "activeProfileId".to_string(),
            Value::String(profile_id.to_string()),
            self.pool,
            self.cache,
        )
        .await
    }
}

/// Forces the next `get` call to reload from disk instead of returning the
/// in-memory cache — needed after something writes preference rows directly
/// (e.g. a backup restore) without going through `update`. A free function
/// (not a `PreferencesService` method) because `refresh_preferences` only
/// ever has a `PreferencesCache` handle, never a pool.
pub(crate) fn refresh(cache: &PreferencesCache) {
    cache.invalidate();
}

/// The stored language preference, for native surfaces built before the
/// webview can say anything (the tray menu): the default when it cannot be
/// read, since a menu label is not worth failing startup over.
#[cfg(desktop)]
pub(crate) async fn stored_language(pool: &SqlitePool, cache: &PreferencesCache) -> Language {
    get_preferences_cached(pool, cache)
        .await
        .map(|preferences| preferences.language)
        .unwrap_or(Language::En)
}
