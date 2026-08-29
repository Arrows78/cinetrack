use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::models::MediaType;

/// Only the fields `toggle_availability_alert` reads off the frontend's
/// `MediaSummary` object.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSummaryInput {
    pub id: i64,
    pub media_type: MediaType,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailabilityAlert {
    pub id: String,
    pub profile_id: String,
    pub media_id: i64,
    pub media_type: MediaType,
    pub title: String,
    pub region: String,
    pub provider_ids: Vec<i64>,
    pub enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailabilitySnapshot {
    pub media_id: i64,
    pub media_type: MediaType,
    pub region: String,
    pub provider_ids: Vec<i64>,
    pub checked_at: String,
}

#[derive(sqlx::FromRow)]
pub(crate) struct AlertRow {
    pub(crate) uuid: String,
    pub(crate) profile_id: String,
    pub(crate) media_id: i64,
    pub(crate) media_type: String,
    pub(crate) title: String,
    pub(crate) region: String,
    pub(crate) provider_ids: String,
    pub(crate) enabled: bool,
    pub(crate) created_at: String,
}

#[derive(sqlx::FromRow)]
pub(crate) struct SnapshotRow {
    pub(crate) media_id: i64,
    pub(crate) media_type: String,
    pub(crate) region: String,
    pub(crate) provider_ids: String,
    pub(crate) checked_at: String,
}

/// A corrupt provider_ids cell must not make the whole list/snapshot
/// unreadable — mirrors parseProviderIds in the original TS.
fn parse_provider_ids(raw: &str) -> Vec<i64> {
    let Ok(Value::Array(values)) = serde_json::from_str::<Value>(raw) else {
        return Vec::new();
    };
    values
        .into_iter()
        .filter_map(|value| value.as_i64())
        .collect()
}

impl From<AlertRow> for AvailabilityAlert {
    fn from(row: AlertRow) -> Self {
        Self {
            id: row.uuid,
            profile_id: row.profile_id,
            media_id: row.media_id,
            media_type: MediaType::from_db_str(&row.media_type),
            title: row.title,
            region: row.region,
            provider_ids: parse_provider_ids(&row.provider_ids),
            enabled: row.enabled,
            created_at: row.created_at,
        }
    }
}

impl From<SnapshotRow> for AvailabilitySnapshot {
    fn from(row: SnapshotRow) -> Self {
        Self {
            media_id: row.media_id,
            media_type: MediaType::from_db_str(&row.media_type),
            region: row.region,
            provider_ids: parse_provider_ids(&row.provider_ids),
            checked_at: row.checked_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tolerates_corrupt_provider_ids_json() {
        assert_eq!(parse_provider_ids("not json"), Vec::<i64>::new());
        assert_eq!(parse_provider_ids("[8, \"x\", 119]"), vec![8, 119]);
    }
}
