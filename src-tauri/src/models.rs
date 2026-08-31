use serde::{Deserialize, Serialize};

/// Shared across every domain command module — generates `src/generated/dto/MediaType.ts`
/// (see docs/architecture.md's IPC boundary section), re-exported as `MediaType` from
/// `src/types/media.ts`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[cfg_attr(feature = "export-bindings", ts(export))]
pub enum MediaType {
    Movie,
    Series,
}

impl MediaType {
    /// Same tolerant coercion `historyRepository`/`portable-data` use when
    /// reading a raw DB column: anything that isn't exactly "movie" is
    /// treated as "series".
    pub fn from_db_str(value: &str) -> Self {
        if value == "movie" {
            MediaType::Movie
        } else {
            MediaType::Series
        }
    }

    pub fn as_db_str(self) -> &'static str {
        match self {
            MediaType::Movie => "movie",
            MediaType::Series => "series",
        }
    }
}
