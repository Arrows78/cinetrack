use serde::{Deserialize, Serialize};

/// Shared across every domain command module — mirrors `MediaType` in
/// src/types/media.ts (`"movie" | "series"`).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
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
