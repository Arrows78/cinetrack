use serde::{Deserialize, Serialize};

use crate::models::MediaType;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomList {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(sqlx::FromRow)]
pub(crate) struct CustomListRow {
    pub(crate) uuid: String,
    pub(crate) profile_id: String,
    pub(crate) name: String,
    pub(crate) description: Option<String>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

impl From<CustomListRow> for CustomList {
    fn from(row: CustomListRow) -> Self {
        Self {
            id: row.uuid,
            profile_id: row.profile_id,
            name: row.name,
            description: row.description,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

/// Only the fields `add_custom_list_item` reads off the frontend's
/// `MediaSummary` object.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSummaryInput {
    pub id: i64,
    pub media_type: MediaType,
    pub title: String,
    pub poster_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomListItem {
    pub id: String,
    pub list_id: String,
    pub media_id: i64,
    pub media_type: MediaType,
    pub title: String,
    pub poster_path: Option<String>,
    pub position: i64,
    pub added_at: String,
    pub updated_at: String,
}

#[derive(sqlx::FromRow)]
pub(crate) struct CustomListItemRow {
    pub(crate) uuid: String,
    pub(crate) list_id: String,
    pub(crate) media_id: i64,
    pub(crate) media_type: String,
    pub(crate) title: String,
    pub(crate) poster_path: Option<String>,
    pub(crate) position: i64,
    pub(crate) added_at: String,
    pub(crate) updated_at: String,
}

impl From<CustomListItemRow> for CustomListItem {
    fn from(row: CustomListItemRow) -> Self {
        Self {
            id: row.uuid,
            list_id: row.list_id,
            media_id: row.media_id,
            media_type: MediaType::from_db_str(&row.media_type),
            title: row.title,
            poster_path: row.poster_path,
            position: row.position,
            added_at: row.added_at,
            updated_at: row.updated_at,
        }
    }
}
