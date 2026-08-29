use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::ApiError;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
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

/// Rank used only to decide whether an automatic status sync is allowed to
/// move a library item forward. Manual edits remain the only way to move it
/// back to a lower lifecycle state.
pub(super) fn auto_sync_rank(status: LibraryStatus) -> u8 {
    match status {
        LibraryStatus::Planned => 0,
        LibraryStatus::Watching | LibraryStatus::Paused | LibraryStatus::Dropped => 1,
        LibraryStatus::Completed => 2,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn automatic_sync_never_ranks_started_states_above_completed() {
        assert_eq!(auto_sync_rank(LibraryStatus::Planned), 0);
        assert_eq!(auto_sync_rank(LibraryStatus::Watching), 1);
        assert_eq!(auto_sync_rank(LibraryStatus::Paused), 1);
        assert_eq!(auto_sync_rank(LibraryStatus::Dropped), 1);
        assert_eq!(auto_sync_rank(LibraryStatus::Completed), 2);
    }
}
