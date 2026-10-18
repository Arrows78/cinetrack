#[cfg(test)]
use std::path::PathBuf;

#[cfg(test)]
use super::commands::{
    check_data_integrity, export_backup_data, import_backup_data, list_backup_directory,
    read_backup_from_path, remove_backup_file, write_backup_to_path,
};
#[cfg(test)]
use super::integrity::quick_check_impl;

use serde::{Deserialize, Serialize};
use serde_json::Value;
#[cfg(test)]
use sqlx::SqlitePool;
#[cfg(test)]
use tauri::State;

use crate::availability::{AvailabilityAlert, AvailabilitySnapshot};
use crate::history::ViewingHistoryItem;
use crate::library::LibraryItem;
use crate::lists::custom::{CustomList, CustomListItem};
use crate::lists::saved_filters::SavedFilter;
use crate::lists::smart::SmartList;
use crate::profiles::UserProfile;
use crate::progress::{EpisodeProgress, TrackedSeriesItem};
use crate::recommendations::DismissedRecommendation;
use crate::stats::ViewingEvent;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeenMovie {
    pub profile_id: Option<String>,
    pub movie_id: i64,
    pub title: String,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub watched_at: String,
}

/// The full contents of a CineTrack backup — mirrors
/// portable-data-common.ts's `PortableData` exactly, one field per exported
/// table (15). The export and import that read and write it live in
/// `export.rs` and `import.rs`.
/// The frontend already validates/normalizes untrusted backup JSON with Zod
/// (see portable-data.ts's `parseBackup`) before this ever reaches Rust, so
/// every required field here is guaranteed present by the time
/// `import_backup_data` runs.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableData {
    pub seen_movies: Vec<SeenMovie>,
    pub episode_progress: Vec<EpisodeProgress>,
    pub tracked_series: Vec<TrackedSeriesItem>,
    pub history: Vec<ViewingHistoryItem>,
    pub preferences: serde_json::Map<String, Value>,
    pub library: Vec<LibraryItem>,
    pub viewing_events: Vec<ViewingEvent>,
    pub profiles: Vec<UserProfile>,
    pub custom_lists: Vec<CustomList>,
    pub custom_list_items: Vec<CustomListItem>,
    pub availability_snapshots: Vec<AvailabilitySnapshot>,
    pub availability_alerts: Vec<AvailabilityAlert>,
    pub smart_lists: Vec<SmartList>,
    pub saved_filters: Vec<SavedFilter>,
    pub dismissed_recommendations: Vec<DismissedRecommendation>,
}

#[cfg(test)]
mod tests;
