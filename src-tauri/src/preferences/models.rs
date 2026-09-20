use serde::{Deserialize, Serialize};

use crate::error::ApiError;

/// Generates `src/generated/dto/Theme.ts`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[cfg_attr(feature = "export-bindings", ts(export))]
pub enum Theme {
    Dark,
    Light,
}

/// Generates `src/generated/dto/AccentColor.ts`, re-exported as `AccentColor`
/// from `src/shared/constants/colors.ts`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[cfg_attr(feature = "export-bindings", ts(export))]
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

/// Generates `src/generated/dto/Language.ts`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[cfg_attr(feature = "export-bindings", ts(export))]
pub enum Language {
    En,
    Fr,
}

/// Generates `src/generated/dto/SearchScope.ts`, re-exported as `SearchScope` from `src/types/media.ts`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[cfg_attr(feature = "export-bindings", ts(export))]
pub enum SearchScope {
    All,
    Movie,
    Series,
    Person,
}

/// Generates `src/generated/dto/LibraryViewMode.ts`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[cfg_attr(feature = "export-bindings", ts(export))]
pub enum LibraryViewMode {
    Grid,
    List,
}

/// Generates `src/generated/dto/BackupFrequency.ts`. How often
/// `maintenanceService.createAutomaticBackup` (frontend) is allowed to run
/// unprompted — `Off` only disables the unprompted trigger, the manual
/// "emergency backup" button always works regardless of this setting.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[cfg_attr(feature = "export-bindings", ts(export))]
pub enum BackupFrequency {
    Daily,
    Weekly,
    Off,
}

/// Nested profile snapshot stored inside UserPreferences. Distinct from
/// `profiles::models::UserProfile` (id/name/avatar/createdAt/supabaseUserId)
/// — the two share a frontend name in `src/types/media.ts` as a loose
/// superset, so this generated file is NOT re-exported as `UserProfile`.
#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "export-bindings", ts(export))]
pub struct UserProfile {
    pub id: String,
    pub name: Option<String>,
    // skip_serializing_if without #[serde(default)]: the key is omitted on
    // the wire when None, never sent as an explicit `null` — #[ts(optional)]
    // renders that as `field?: T` instead of ts-rs's default `T | null`.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
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

/// Generates `src/generated/dto/UserPreferences.ts`, re-exported as `UserPreferences`
/// from `src/types/media.ts` — that file no longer hand-declares this interface.
#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "export-bindings", ts(export))]
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
    /// Specifically calendar reminders (upcoming movie/episode releases) —
    /// despite the name, no longer the single blanket notifications switch.
    /// See `availability_alerts_enabled`/`desktop_notifications_enabled` for
    /// the other two categories the Settings page now exposes separately.
    pub notifications_enabled: bool,
    /// "This title just became available on a service you subscribe to"
    /// alerts, independent of calendar reminders. Backfilled from
    /// `notifications_enabled` for anyone who already had that on (see
    /// migration 022) so existing opt-ins keep working after the split.
    #[serde(default)]
    pub availability_alerts_enabled: bool,
    /// Master switch for whether any OS-level notification is actually
    /// shown (see `notificationService.send`'s own gating in
    /// notification-service.ts/availability-monitor.ts) — the two category
    /// flags above still decide *whether an event is eligible* to notify,
    /// this decides whether that notification is allowed to pop as a
    /// desktop toast at all. Also backfilled from `notifications_enabled`
    /// (migration 022).
    #[serde(default)]
    pub desktop_notifications_enabled: bool,
    pub notify_hours_before: u32,
    /// How often the background loop in App.tsx re-checks every enabled
    /// availability alert against TMDB — previously a hardcoded 6 hours
    /// (STALE_6_HOURS). Device-scoped like `notify_hours_before`: it
    /// describes how chatty this installation's own polling is, not a
    /// taste/content preference tied to the person.
    pub availability_check_interval_hours: u32,
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
    /// How often `maintenanceService.createAutomaticBackup` is allowed to
    /// fire unprompted (see `BackupFrequency`). Defaults to `Daily`,
    /// matching the fixed 24h interval this feature had before it became
    /// configurable — an existing install upgrading into this field sees no
    /// behavior change until it's touched. Device-scoped, like
    /// `backup_directory`: it's a statement about this installation's
    /// safety-net cadence, not the person's taste.
    #[serde(default = "default_backup_frequency")]
    pub backup_frequency: BackupFrequency,
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
    /// Whether the goal-oriented first-launch screen (OnboardingGate) has
    /// already run. Global rather than per-profile, like every other row in
    /// this table — it fires once for the install, not once per local
    /// profile a household creates. Defaults to `false` so it also covers
    /// an existing install upgrading into this field for the first time;
    /// OnboardingGate additionally checks whether the active profile's
    /// library is already non-empty before showing anything, so an
    /// established user doesn't see it just because this key was never set.
    #[serde(default)]
    pub onboarding_completed: bool,
    /// Most-recent-first list of past search terms typed into the global
    /// search bar, capped at MAX_RECENT_SEARCHES — powers the autocomplete
    /// dropdown's "recent searches" section. Device-scoped like
    /// `notify_hours_before`: a search history is closer to browser history
    /// than to a taste preference, and this installation's own typed terms
    /// aren't something to hand to a different device via cloud sync.
    #[serde(default)]
    pub recent_searches: Vec<String>,
    /// The in-window command-palette shortcut, normalized as
    /// modifier-parts-joined-by-"+" (e.g. `"mod+k"`, where `"mod"` means
    /// Cmd on macOS / Ctrl elsewhere) — see
    /// src/shared/lib/keyboard-shortcut.ts, the single place that both
    /// parses and formats this string. Device-scoped, not account-scoped:
    /// a remapped key is a statement about this keyboard/OS, not about the
    /// person using it.
    #[serde(default = "default_command_palette_shortcut")]
    pub command_palette_shortcut: String,
    /// The OS-level global shortcut that opens the command palette even
    /// when CineTrack isn't focused, in the same normalized form as
    /// `command_palette_shortcut` above — converted to
    /// `tauri-plugin-global-shortcut`'s own string format
    /// (`toTauriGlobalShortcut`) only at the point of registering it.
    #[serde(default = "default_global_command_palette_shortcut")]
    pub global_command_palette_shortcut: String,
}

fn default_command_palette_shortcut() -> String {
    "mod+k".to_string()
}

fn default_global_command_palette_shortcut() -> String {
    "mod+shift+k".to_string()
}

/// Matches the frontend's own cap in use-search-history.ts, so neither side
/// can silently grow the stored list past what the dropdown ever shows.
pub(super) const MAX_RECENT_SEARCHES: usize = 8;

fn default_backup_frequency() -> BackupFrequency {
    BackupFrequency::Daily
}

/// Which `preferences` keys travel through cloud sync (see
/// preferences::repository::write_preference's outbox insert and
/// sync::service::prepare's bootstrap seeding) versus stay strictly local to
/// this installation. Kept as a single source of truth here rather than
/// duplicated as a literal list in sync/service.rs, per the project's rule
/// against hand-duplicated literal lists.
///
/// The split follows what actually describes *this person's* taste/settings
/// (account-scoped) versus what describes *this device* (its window chrome,
/// its OS-level notification permission, an arbitrary local filesystem path,
/// which local profile happens to be active on it right now). Two entries
/// worth calling out: `theme` stays device-scoped — a phone's own
/// light/dark choice shouldn't be forced by the desktop's — and
/// `onThisDayEnabled` is account-scoped despite being "just a toggle": it's
/// a deliberate, content-sensitive choice about resurfacing personal
/// history, tied to the person rather than the hardware.
pub(crate) const ACCOUNT_SCOPE_PREFERENCE_KEYS: &[&str] = &[
    "language",
    "region",
    "preferredProviderIds",
    "spoilerProtection",
    "hideWatchedInDiscovery",
    "accentColor",
    "onThisDayEnabled",
];

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
            availability_alerts_enabled: false,
            desktop_notifications_enabled: false,
            notify_hours_before: 24,
            availability_check_interval_hours: 6,
            preferred_provider_ids: Vec::new(),
            active_profile_id: "default".to_string(),
            user_profile: UserProfile::default(),
            backup_directory: None,
            backup_frequency: default_backup_frequency(),
            hide_watched_in_discovery: false,
            on_this_day_enabled: false,
            onboarding_completed: false,
            recent_searches: Vec::new(),
            command_palette_shortcut: default_command_palette_shortcut(),
            global_command_palette_shortcut: default_global_command_palette_shortcut(),
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
    if prefs.availability_check_interval_hours < 1 || prefs.availability_check_interval_hours > 24 {
        return Err(ApiError::bad_request(
            "availabilityCheckIntervalHours must be between 1 and 24",
        ));
    }
    if prefs.recent_searches.len() > MAX_RECENT_SEARCHES {
        return Err(ApiError::bad_request(format!(
            "recentSearches can't hold more than {MAX_RECENT_SEARCHES} entries"
        )));
    }
    if prefs.command_palette_shortcut.trim().is_empty()
        || prefs.global_command_palette_shortcut.trim().is_empty()
    {
        return Err(ApiError::bad_request(
            "Keyboard shortcuts must not be empty",
        ));
    }
    if prefs.command_palette_shortcut == prefs.global_command_palette_shortcut {
        return Err(ApiError::bad_request(
            "The in-window and system-wide shortcuts must be different",
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
    fn rejects_an_availability_check_interval_of_zero() {
        let prefs = UserPreferences {
            availability_check_interval_hours: 0,
            ..UserPreferences::default()
        };
        assert!(validate(&prefs).is_err());
    }

    #[test]
    fn rejects_an_availability_check_interval_over_a_day() {
        let prefs = UserPreferences {
            availability_check_interval_hours: 25,
            ..UserPreferences::default()
        };
        assert!(validate(&prefs).is_err());
    }

    #[test]
    fn accepts_an_availability_check_interval_within_range() {
        let prefs = UserPreferences {
            availability_check_interval_hours: 12,
            ..UserPreferences::default()
        };
        assert!(validate(&prefs).is_ok());
    }

    #[test]
    fn rejects_more_recent_searches_than_the_cap() {
        let prefs = UserPreferences {
            recent_searches: (0..(MAX_RECENT_SEARCHES + 1))
                .map(|i| format!("query {i}"))
                .collect(),
            ..UserPreferences::default()
        };
        assert!(validate(&prefs).is_err());
    }

    #[test]
    fn accepts_recent_searches_at_the_cap() {
        let prefs = UserPreferences {
            recent_searches: (0..MAX_RECENT_SEARCHES)
                .map(|i| format!("query {i}"))
                .collect(),
            ..UserPreferences::default()
        };
        assert!(validate(&prefs).is_ok());
    }

    #[test]
    fn accepts_positive_preferred_provider_ids() {
        let prefs = UserPreferences {
            preferred_provider_ids: vec![8, 337],
            ..UserPreferences::default()
        };
        assert!(validate(&prefs).is_ok());
    }

    #[test]
    fn rejects_an_empty_command_palette_shortcut() {
        let prefs = UserPreferences {
            command_palette_shortcut: "".to_string(),
            ..UserPreferences::default()
        };
        assert!(validate(&prefs).is_err());
    }

    #[test]
    fn rejects_identical_shortcuts_for_both_bindings() {
        let prefs = UserPreferences {
            command_palette_shortcut: "mod+k".to_string(),
            global_command_palette_shortcut: "mod+k".to_string(),
            ..UserPreferences::default()
        };
        assert!(validate(&prefs).is_err());
    }

    #[test]
    fn accepts_distinct_non_empty_shortcuts() {
        let prefs = UserPreferences {
            command_palette_shortcut: "mod+j".to_string(),
            global_command_palette_shortcut: "mod+shift+j".to_string(),
            ..UserPreferences::default()
        };
        assert!(validate(&prefs).is_ok());
    }
}
