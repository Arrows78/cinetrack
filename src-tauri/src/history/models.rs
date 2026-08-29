use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::ApiError;
use crate::models::MediaType;

// `LibraryAdd`/`LibraryRemove` deliberately keep the "watchlist:add"/
// "watchlist:remove" wire strings (see migration 10 in migrations.rs):
// renaming the on-disk strings too would need a SQLite `CHECK`-constraint
// table rebuild, for a purely cosmetic gain, and would risk any existing
// user's already-stored `activity_log` rows. Only the Rust identifier
// changed to reflect that these are now written by `library.rs`, not a
// separate watchlist feature.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum HistoryAction {
    #[serde(rename = "movie:watched")]
    MovieWatched,
    #[serde(rename = "movie:unwatched")]
    MovieUnwatched,
    #[serde(rename = "episode:watched")]
    EpisodeWatched,
    #[serde(rename = "episode:unwatched")]
    EpisodeUnwatched,
    #[serde(rename = "season:watched")]
    SeasonWatched,
    #[serde(rename = "season:unwatched")]
    SeasonUnwatched,
    #[serde(rename = "series:watched")]
    SeriesWatched,
    #[serde(rename = "series:unwatched")]
    SeriesUnwatched,
    #[serde(rename = "watchlist:add")]
    LibraryAdd,
    #[serde(rename = "watchlist:remove")]
    LibraryRemove,
    #[serde(rename = "library:update")]
    LibraryUpdate,
    #[serde(rename = "list:add")]
    ListAdd,
    #[serde(rename = "list:remove")]
    ListRemove,
}

impl HistoryAction {
    // `CHECK (action IN (...))` in the schema guarantees these are the only
    // thirteen strings that will ever be stored.
    pub(crate) fn as_db_str(self) -> &'static str {
        match self {
            HistoryAction::MovieWatched => "movie:watched",
            HistoryAction::MovieUnwatched => "movie:unwatched",
            HistoryAction::EpisodeWatched => "episode:watched",
            HistoryAction::EpisodeUnwatched => "episode:unwatched",
            HistoryAction::SeasonWatched => "season:watched",
            HistoryAction::SeasonUnwatched => "season:unwatched",
            HistoryAction::SeriesWatched => "series:watched",
            HistoryAction::SeriesUnwatched => "series:unwatched",
            HistoryAction::LibraryAdd => "watchlist:add",
            HistoryAction::LibraryRemove => "watchlist:remove",
            HistoryAction::LibraryUpdate => "library:update",
            HistoryAction::ListAdd => "list:add",
            HistoryAction::ListRemove => "list:remove",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewingHistoryItem {
    pub id: String,
    pub media_id: i64,
    pub media_type: MediaType,
    pub title: String,
    pub action: HistoryAction,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub season_number: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub episode_number: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub episode_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

#[derive(sqlx::FromRow)]
pub(crate) struct HistoryRow {
    pub(crate) uuid: String,
    pub(crate) media_id: i64,
    pub(crate) media_type: String,
    pub(crate) title: String,
    pub(crate) action: String,
    pub(crate) season_number: Option<i64>,
    pub(crate) episode_number: Option<i64>,
    pub(crate) episode_title: Option<String>,
    pub(crate) metadata: Option<String>,
    pub(crate) timestamp: String,
}

impl TryFrom<HistoryRow> for ViewingHistoryItem {
    type Error = ApiError;

    fn try_from(row: HistoryRow) -> Result<Self, Self::Error> {
        let action: HistoryAction = serde_json::from_value(Value::String(row.action.clone()))
            .map_err(|_| {
                ApiError::internal(format!(
                    "Unknown history action in database: {}",
                    row.action
                ))
            })?;

        Ok(Self {
            id: row.uuid,
            media_id: row.media_id,
            media_type: MediaType::from_db_str(&row.media_type),
            title: row.title,
            action,
            timestamp: row.timestamp,
            season_number: row.season_number,
            episode_number: row.episode_number,
            episode_title: row.episode_title,
            // Ignore invalid legacy metadata and fall back to `None`,
            // matching the try/catch-and-skip in history-repository.ts.
            metadata: row.metadata.and_then(|raw| serde_json::from_str(&raw).ok()),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_action_as_db_str_matches_every_wire_string() {
        let cases: &[(HistoryAction, &str)] = &[
            (HistoryAction::MovieWatched, "movie:watched"),
            (HistoryAction::MovieUnwatched, "movie:unwatched"),
            (HistoryAction::EpisodeWatched, "episode:watched"),
            (HistoryAction::EpisodeUnwatched, "episode:unwatched"),
            (HistoryAction::SeasonWatched, "season:watched"),
            (HistoryAction::SeasonUnwatched, "season:unwatched"),
            (HistoryAction::SeriesWatched, "series:watched"),
            (HistoryAction::SeriesUnwatched, "series:unwatched"),
            (HistoryAction::LibraryAdd, "watchlist:add"),
            (HistoryAction::LibraryRemove, "watchlist:remove"),
            (HistoryAction::LibraryUpdate, "library:update"),
            (HistoryAction::ListAdd, "list:add"),
            (HistoryAction::ListRemove, "list:remove"),
        ];

        for (action, expected) in cases {
            assert_eq!(action.as_db_str(), *expected);
        }
    }

    #[test]
    fn try_from_rejects_an_unrecognized_history_action() {
        let row = HistoryRow {
            uuid: "bogus-row".to_string(),
            media_id: 1,
            media_type: "movie".to_string(),
            title: "Test".to_string(),
            action: "bogus".to_string(),
            season_number: None,
            episode_number: None,
            episode_title: None,
            metadata: None,
            timestamp: "2026-01-01T00:00:00.000Z".to_string(),
        };

        let result = ViewingHistoryItem::try_from(row);

        assert!(result.is_err());
    }
}
