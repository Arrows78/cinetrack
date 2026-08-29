use serde::{Deserialize, Serialize};

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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LibraryViewMode {
    Grid,
    List,
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
    pub library_view_mode: LibraryViewMode,
    pub spoiler_protection: bool,
    pub notifications_enabled: bool,
    pub notify_hours_before: u32,
    pub preferred_provider_ids: Vec<i64>,
    pub active_profile_id: String,
    pub user_profile: UserProfile,
    /// Absolute path to a user-chosen folder where backup files are
    /// written/read instead of the default app-data location — e.g. a
    /// folder already synced by iCloud Drive/OneDrive/Dropbox. `None` means
    /// "use the default app-data location". See
    /// src-tauri/src/backup/commands.rs's `write_backup_to_path` /
    /// `read_backup_from_path` for the plain-`std::fs` commands the
    /// frontend routes through when this is set — this path is
    /// user-supplied and arbitrary, so it can't go through the
    /// `@tauri-apps/plugin-fs` JS API, whose capability scope is a static
    /// `$APPDATA/**` allow-list.
    pub backup_directory: Option<String>,
    /// Persistent "Hide watched" toggle for Discover-style surfaces (home
    /// catalogue rails) and Watch Tonight — filters out titles already
    /// marked `completed` in the library. Defaults to `false` (off), same
    /// as every other opt-in filter here.
    #[serde(default)]
    pub hide_watched_in_discovery: bool,
    /// Opt-in "On this day" Home card (see `list_on_this_day_events` in
    /// stats.rs) — surfaces past-year viewing history matching today's
    /// date. Defaults to `false`: unlike a plain UI filter, this feature
    /// resurfaces *what the user watched, and when* unprompted on the
    /// app's landing page, which can land as an unwelcome surprise (a title
    /// tied to a specific person or moment) the first time it appears after
    /// an upgrade — so it stays off until the user deliberately turns it on
    /// in Settings, matching the literal "opt-in" ask.
    #[serde(default)]
    pub on_this_day_enabled: bool,
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
            library_view_mode: LibraryViewMode::Grid,
            spoiler_protection: true,
            notifications_enabled: false,
            notify_hours_before: 24,
            preferred_provider_ids: Vec::new(),
            active_profile_id: "default".to_string(),
            user_profile: UserProfile::default(),
            backup_directory: None,
            hide_watched_in_discovery: false,
            on_this_day_enabled: false,
        }
    }
}

/// Mirrors the zod constraints in preferences-repository.ts that a plain
/// serde deserialize can't express (regex/range/positivity), so a malformed
/// stored value still fails loudly instead of being silently accepted.
pub(super) fn validate(prefs: &UserPreferences) -> Result<(), ApiError> {
    let region_is_valid =
        prefs.region.len() == 2 && prefs.region.chars().all(|c| c.is_ascii_uppercase());
    if !region_is_valid {
        return Err(ApiError::bad_request(
            "region must be a 2-letter uppercase country code",
        ));
    }
    if prefs.notify_hours_before > 168 {
        return Err(ApiError::bad_request(
            "notifyHoursBefore must be between 0 and 168",
        ));
    }
    if prefs.preferred_provider_ids.iter().any(|id| *id <= 0) {
        return Err(ApiError::bad_request(
            "preferredProviderIds must all be positive",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_an_invalid_region() {
        let prefs = UserPreferences {
            region: "fr".to_string(),
            ..UserPreferences::default()
        };
        assert!(validate(&prefs).is_err());
    }

    #[test]
    fn rejects_a_region_of_the_wrong_length() {
        // Distinct from `rejects_an_invalid_region` above: "fr" is still 2
        // characters (just lowercase), so it never exercises the length
        // check itself — only the uppercase check. This does.
        let prefs = UserPreferences {
            region: "FRA".to_string(),
            ..UserPreferences::default()
        };
        assert!(validate(&prefs).is_err());
    }

    #[test]
    fn rejects_out_of_range_notify_hours() {
        let prefs = UserPreferences {
            notify_hours_before: 200,
            ..UserPreferences::default()
        };
        assert!(validate(&prefs).is_err());
    }

    #[test]
    fn rejects_a_non_positive_preferred_provider_id() {
        let prefs = UserPreferences {
            preferred_provider_ids: vec![0],
            ..UserPreferences::default()
        };
        assert!(validate(&prefs).is_err());
    }

    #[test]
    fn accepts_positive_preferred_provider_ids() {
        let prefs = UserPreferences {
            preferred_provider_ids: vec![8, 337],
            ..UserPreferences::default()
        };
        assert!(validate(&prefs).is_ok());
    }
}
