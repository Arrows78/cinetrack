use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::ApiError;

/// A smart list is a saved, named filter rule set — "Unwatched + Horror +
/// under 100 min", "My Services + rating >= 8", "Series with episodes
/// waiting" are the three README examples this ships for. Unlike a custom
/// list (`lists::custom`), it never stores which media items match: `rules`
/// is evaluated live against the current library every time the smart list
/// is opened (see src/features/library/smart-list-evaluation.ts), so this
/// command layer's only job is CRUD over the rule definition itself.
///
/// `rules` is deliberately an opaque `serde_json::Value` here rather than a
/// typed Rust struct mirroring `SmartListRules` (src/types/media.ts):
/// nothing in Rust ever inspects a rule's fields — evaluation is 100%
/// client-side TypeScript, reusing the same library/tracked-series/
/// preferences data `LibraryExplorer` already loads for its own manual
/// filters. Keeping the shape untyped here means the two sides can't drift
/// out of a shared enum in the first place, at the cost of only shallow
/// validation (must be a JSON object, see `validate_rules`) rather than a
/// fully-checked schema.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartList {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub rules: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(sqlx::FromRow)]
pub(crate) struct SmartListRow {
    uuid: String,
    profile_id: String,
    name: String,
    rules: String,
    created_at: String,
    updated_at: String,
}

impl TryFrom<SmartListRow> for SmartList {
    type Error = ApiError;

    fn try_from(row: SmartListRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.uuid,
            profile_id: row.profile_id,
            name: row.name,
            rules: serde_json::from_str(&row.rules)
                .map_err(|e| ApiError::internal(format!("Corrupt smart list rules: {e}")))?,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }
}

pub(super) const MAX_NAME_LENGTH: usize = 100;
// Generous but bounded: every real rule set (the fixed set of dimensions in
// SmartListRules) serializes to well under a kilobyte — this only guards
// against a caller sending something pathological, not a real usage limit.
pub(super) const MAX_RULES_JSON_LENGTH: usize = 10_000;

pub(super) fn validate_name(name: &str) -> Result<String, ApiError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(ApiError::bad_request("The smart list name is required."));
    }
    if trimmed.chars().count() > MAX_NAME_LENGTH {
        return Err(ApiError::bad_request(format!(
            "The smart list name cannot exceed {MAX_NAME_LENGTH} characters."
        )));
    }
    Ok(trimmed.to_string())
}

/// Only checks the rules value is a JSON object within a sane size — see
/// this module's doc comment for why deeper (per-field) validation
/// deliberately isn't Rust's job here.
pub(super) fn validate_rules(rules: &Value) -> Result<String, ApiError> {
    if !rules.is_object() {
        return Err(ApiError::bad_request("Smart list rules must be an object."));
    }
    let serialized = serde_json::to_string(rules).map_err(|e| ApiError::internal(e.to_string()))?;
    if serialized.len() > MAX_RULES_JSON_LENGTH {
        return Err(ApiError::bad_request("Smart list rules are too large."));
    }
    Ok(serialized)
}
