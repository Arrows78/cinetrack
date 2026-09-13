use serde::{Deserialize, Serialize};

use crate::history::HistoryAction;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MovieInput {
    pub id: i64,
    pub title: String,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub runtime: Option<i64>,
    pub year: Option<i64>,
    pub rating: Option<f64>,
    #[serde(default)]
    pub genres: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpisodeInput {
    pub id: i64,
    pub season_number: i64,
    pub episode_number: i64,
    pub runtime: Option<i64>,
    #[serde(default)]
    pub watched_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesInput {
    pub id: i64,
    pub title: String,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub runtime: Option<i64>,
    pub number_of_episodes: Option<i64>,
    pub year: Option<i64>,
    pub rating: Option<f64>,
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default)]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "export-bindings", ts(export))]
pub struct EpisodeProgress {
    pub id: String,
    pub profile_id: Option<String>,
    pub series_id: i64,
    pub episode_id: i64,
    pub season_number: i64,
    pub episode_number: i64,
    pub watched: bool,
    pub watched_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    /// A per-episode rating, 1-5 — stored as a plain integer (not a named
    /// enum) so a future /10-with-half-points scale is just a different
    /// multiplier over the same column, not a migration. The frontend is
    /// free to render it as emoji/labels; local only, deliberately not part
    /// of the cloud-sync payload (see docs/database-schema.md's
    /// episode_progress entry).
    pub rating: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "export-bindings", ts(export))]
pub struct TrackedSeriesItem {
    pub id: String,
    pub profile_id: Option<String>,
    pub series_id: i64,
    pub title: String,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub total_episodes: i64,
    pub watched_episodes: i64,
    pub status: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpisodeHistoryInput {
    pub action: HistoryAction,
    pub season_number: Option<i64>,
    pub episode_number: Option<i64>,
    pub episode_title: Option<String>,
}
