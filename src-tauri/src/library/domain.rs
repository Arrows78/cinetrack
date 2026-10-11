use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::ApiError;

/// Generates `src/generated/dto/LibraryStatus.ts` (see docs/architecture.md's
/// IPC boundary section), re-exported as `LibraryStatus` from `src/types/media.ts`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[cfg_attr(feature = "export-bindings", ts(export))]
pub enum LibraryStatus {
    Planned,
    Watching,
    Paused,
    Completed,
    Dropped,
}

impl LibraryStatus {
    pub(crate) fn as_db_str(self) -> &'static str {
        match self {
            LibraryStatus::Planned => "planned",
            LibraryStatus::Watching => "watching",
            LibraryStatus::Paused => "paused",
            LibraryStatus::Completed => "completed",
            LibraryStatus::Dropped => "dropped",
        }
    }

    pub(crate) fn from_db_str(value: &str) -> Result<Self, ApiError> {
        serde_json::from_value(Value::String(value.to_string()))
            .map_err(|_| ApiError::internal(format!("Unknown library status in database: {value}")))
    }
}

/// Who set a library entry's current status. Generates
/// `src/generated/dto/LibraryStatusOrigin.ts`.
///
/// `Manual` is a status the viewer chose (editor, quick add); `Auto` one that
/// follows the viewing and is recomputed whenever it changes. See
/// `docs/library-status.md` and `library/status.rs` for the rules.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[cfg_attr(feature = "export-bindings", ts(export))]
pub enum LibraryStatusOrigin {
    #[default]
    Manual,
    Auto,
}

impl LibraryStatusOrigin {
    pub(crate) fn as_db_str(self) -> &'static str {
        match self {
            LibraryStatusOrigin::Manual => "manual",
            LibraryStatusOrigin::Auto => "auto",
        }
    }

    pub(crate) fn from_db_str(value: &str) -> Result<Self, ApiError> {
        serde_json::from_value(Value::String(value.to_string())).map_err(|_| {
            ApiError::internal(format!(
                "Unknown library status origin in database: {value}"
            ))
        })
    }
}
