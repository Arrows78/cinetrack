use serde::{Deserialize, Deserializer, Serialize};

use super::domain::LibraryStatus;
use crate::error::ApiError;
use crate::models::MediaType;

/// How a paginated library listing is ordered — mirrors the `sort` union
/// already used by the frontend's (now server-side) Library filters.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum LibrarySort {
    #[default]
    Recent,
    Title,
    Rating,
}

/// Filters + cursor for a single page of `list_library_page`. `limit` is
/// clamped server-side (see `list_page_impl`) — never trust a page size the
/// frontend sent verbatim.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryListParams {
    pub media_type: Option<MediaType>,
    pub status: Option<LibraryStatus>,
    #[serde(default)]
    pub favourites_only: bool,
    pub search: Option<String>,
    #[serde(default)]
    pub sort: LibrarySort,
    pub cursor: Option<String>,
    pub limit: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPage {
    pub items: Vec<LibraryItem>,
    pub next_cursor: Option<String>,
}

/// Opaque keyset cursor: encodes the sort column's value plus the
/// `(media_id, media_type)` tiebreaker from the last row of the previous
/// page, tagged by sort mode so a cursor can never silently be replayed
/// against a different sort (a sort change always starts a fresh
/// `useInfiniteQuery` client-side, so this should never actually happen —
/// the tag is a defensive check, not a real usage path).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "sort", rename_all = "camelCase")]
pub(super) enum LibraryCursorPayload {
    Recent {
        updated_at: String,
        media_id: i64,
        media_type: String,
    },
    Title {
        title: String,
        media_id: i64,
        media_type: String,
    },
    Rating {
        rating: f64,
        media_id: i64,
        media_type: String,
    },
}

impl LibraryCursorPayload {
    pub(super) fn encode(&self) -> Result<String, ApiError> {
        serde_json::to_string(self).map_err(|e| ApiError::internal(e.to_string()))
    }

    pub(super) fn decode(cursor: &str, expected_sort: LibrarySort) -> Result<Self, ApiError> {
        let payload: LibraryCursorPayload = serde_json::from_str(cursor)
            .map_err(|_| ApiError::bad_request("Invalid library page cursor"))?;
        let matches = matches!(
            (&payload, expected_sort),
            (LibraryCursorPayload::Recent { .. }, LibrarySort::Recent)
                | (LibraryCursorPayload::Title { .. }, LibrarySort::Title)
                | (LibraryCursorPayload::Rating { .. }, LibrarySort::Rating)
        );
        if !matches {
            return Err(ApiError::bad_request(
                "Library page cursor does not match the requested sort",
            ));
        }
        Ok(payload)
    }
}

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
