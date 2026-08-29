use serde::{Deserialize, Deserializer, Serialize};

use super::domain::LibraryStatus;
use crate::error::ApiError;
use crate::models::MediaType;

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPatch {
    pub status: Option<LibraryStatus>,
    pub favourite: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub user_rating: Option<Option<f64>>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub notes: Option<Option<String>>,
    pub tags: Option<Vec<String>>,
    pub rewatch_count: Option<i64>,
}

fn deserialize_double_option<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Ok(Some(Option::deserialize(deserializer)?))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSummaryInput {
    pub id: i64,
    pub media_type: MediaType,
    pub title: String,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub year: Option<i64>,
    pub rating: Option<f64>,
    pub genres: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
    pub id: String,
    pub profile_id: String,
    pub media_id: i64,
    pub media_type: MediaType,
    pub title: String,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub year: Option<i64>,
    pub rating: Option<f64>,
    pub genres: Vec<String>,
    pub status: LibraryStatus,
    pub favourite: bool,
    pub user_rating: Option<f64>,
    pub notes: Option<String>,
    pub tags: Vec<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub rewatch_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(sqlx::FromRow)]
pub(crate) struct LibraryRow {
    pub(crate) uuid: String,
    pub(crate) profile_id: String,
    pub(crate) media_id: i64,
    pub(crate) media_type: String,
    pub(crate) title: String,
    pub(crate) poster_path: Option<String>,
    pub(crate) backdrop_path: Option<String>,
    pub(crate) year: Option<i64>,
    pub(crate) rating: Option<f64>,
    pub(crate) genres: String,
    pub(crate) status: String,
    pub(crate) favourite: bool,
    pub(crate) user_rating: Option<f64>,
    pub(crate) notes: Option<String>,
    pub(crate) tags: String,
    pub(crate) started_at: Option<String>,
    pub(crate) completed_at: Option<String>,
    pub(crate) rewatch_count: i64,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

impl TryFrom<LibraryRow> for LibraryItem {
    type Error = ApiError;

    fn try_from(row: LibraryRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.uuid,
            profile_id: row.profile_id,
            media_id: row.media_id,
            media_type: MediaType::from_db_str(&row.media_type),
            title: row.title,
            poster_path: row.poster_path,
            backdrop_path: row.backdrop_path,
            year: row.year,
            rating: row.rating,
            genres: serde_json::from_str(&row.genres)
                .map_err(|e| ApiError::internal(e.to_string()))?,
            status: LibraryStatus::from_db_str(&row.status)?,
            favourite: row.favourite,
            user_rating: row.user_rating,
            notes: row.notes,
            tags: serde_json::from_str(&row.tags).map_err(|e| ApiError::internal(e.to_string()))?,
            started_at: row.started_at,
            completed_at: row.completed_at,
            rewatch_count: row.rewatch_count,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }
}

#[derive(Debug, Clone)]
pub(crate) struct AutoSyncMedia {
    pub media_id: i64,
    pub media_type: MediaType,
    pub title: String,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub year: Option<i64>,
    pub rating: Option<f64>,
    pub genres: Vec<String>,
}
