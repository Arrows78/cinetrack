use serde::{Deserialize, Serialize};

use crate::models::MediaType;

/// Only the fields `dismiss_recommendation` reads off the frontend's
/// `MediaSummary` object — same shape as availability's own
/// `MediaSummaryInput`, kept as its own type since each domain's input is
/// deliberately independent (see progress::models' EpisodeInput/SeriesInput
/// for the same convention).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSummaryInput {
    pub id: i64,
    pub media_type: MediaType,
    pub title: String,
    pub poster_path: Option<String>,
}

/// Generates `src/generated/dto/DismissedRecommendation.ts`, re-exported as
/// `DismissedRecommendation` from `src/types/media.ts`.
#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "export-bindings", ts(export))]
pub struct DismissedRecommendation {
    pub id: String,
    pub profile_id: String,
    pub media_id: i64,
    pub media_type: MediaType,
    pub title: String,
    pub poster_path: Option<String>,
    pub dismissed_at: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(sqlx::FromRow)]
pub(crate) struct DismissedRecommendationRow {
    pub(crate) uuid: String,
    pub(crate) profile_id: String,
    pub(crate) media_id: i64,
    pub(crate) media_type: String,
    pub(crate) title: String,
    pub(crate) poster_path: Option<String>,
    pub(crate) dismissed_at: String,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

impl From<DismissedRecommendationRow> for DismissedRecommendation {
    fn from(row: DismissedRecommendationRow) -> Self {
        Self {
            id: row.uuid,
            profile_id: row.profile_id,
            media_id: row.media_id,
            media_type: MediaType::from_db_str(&row.media_type),
            title: row.title,
            poster_path: row.poster_path,
            dismissed_at: row.dismissed_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}
