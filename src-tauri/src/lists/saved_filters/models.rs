use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::ApiError;

/// A saved filter is a named snapshot of one page's own filter-control
/// state — LibraryExplorer's type/status/favourites/list/sort/search, or
/// SearchPage's scope/genre/provider — captured verbatim so reopening it is
/// just "set that page's filter state to this JSON blob," entirely
/// client-side (there is no evaluation logic here, unlike smart lists: a
/// saved filter never gets re-run against the library, it only rehydrates
/// the page's own React state). `filters` is deliberately an opaque
/// `serde_json::Value` for the same reason `lists::smart`'s `rules` is:
/// nothing in Rust ever inspects its fields, so keeping the shape untyped
/// here means the two sides can't drift out of a shared enum, at the cost
/// of only shallow validation (must be a JSON object, see
/// `validate_filters`).
///
/// `page` distinguishes which page a row belongs to, since the two pages'
/// filter shapes are unrelated — a Library-saved filter must never show up
/// in Search's own saved-filters list or vice versa.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedFilter {
    pub id: String,
    pub profile_id: String,
    pub page: String,
    pub name: String,
    pub filters: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(sqlx::FromRow)]
pub(crate) struct SavedFilterRow {
    uuid: String,
    profile_id: String,
    page: String,
    name: String,
    filters: String,
    created_at: String,
    updated_at: String,
}

impl TryFrom<SavedFilterRow> for SavedFilter {
    type Error = ApiError;

    fn try_from(row: SavedFilterRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.uuid,
            profile_id: row.profile_id,
            page: row.page,
            name: row.name,
            filters: serde_json::from_str(&row.filters)
                .map_err(|e| ApiError::internal(format!("Corrupt saved filter: {e}")))?,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }
}

pub(super) const MAX_NAME_LENGTH: usize = 100;
// Generous but bounded: every real filter-state object (a handful of scalar
// fields per page) serializes to well under a kilobyte — this only guards
// against a caller sending something pathological, not a real usage limit.
pub(super) const MAX_FILTERS_JSON_LENGTH: usize = 10_000;
// The only two pages that currently expose saved filters. Kept as a single
// source of truth here (rather than re-typing the two literals in every
// validation/query call) so a third page added later only has to change
// this list.
const VALID_PAGES: &[&str] = &["library", "search"];

pub(super) fn validate_name(name: &str) -> Result<String, ApiError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(ApiError::bad_request("The filter name is required."));
    }
    if trimmed.chars().count() > MAX_NAME_LENGTH {
        return Err(ApiError::bad_request(format!(
            "The filter name cannot exceed {MAX_NAME_LENGTH} characters."
        )));
    }
    Ok(trimmed.to_string())
}

pub(super) fn validate_page(page: &str) -> Result<(), ApiError> {
    if VALID_PAGES.contains(&page) {
        Ok(())
    } else {
        Err(ApiError::bad_request(format!(
            "Unknown saved-filter page \"{page}\"."
        )))
    }
}

/// Only checks the filters value is a JSON object within a sane size — see
/// this module's doc comment for why deeper (per-field) validation
/// deliberately isn't Rust's job here.
pub(super) fn validate_filters(filters: &Value) -> Result<String, ApiError> {
    if !filters.is_object() {
        return Err(ApiError::bad_request(
            "Saved filter state must be an object.",
        ));
    }
    let serialized =
        serde_json::to_string(filters).map_err(|e| ApiError::internal(e.to_string()))?;
    if serialized.len() > MAX_FILTERS_JSON_LENGTH {
        return Err(ApiError::bad_request("Saved filter state is too large."));
    }
    Ok(serialized)
}
