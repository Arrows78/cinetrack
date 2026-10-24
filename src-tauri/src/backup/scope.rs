//! Which profiles a backup may carry.
//!
//! Export and import are reachable from the webview whatever is on screen, so
//! the PIN lock has to hold here too: a profile protected by a PIN is never
//! exported, and an import neither replaces nor deletes it, unless it is the
//! active profile (someone already got past its lock to get there, the same
//! rule as `authorize_pin_protected_access`). Profiles without a PIN keep the
//! whole-database behaviour, which is what the automatic backup and the
//! recovery after a failed start rely on.

use std::collections::HashSet;

use sqlx::SqliteConnection;

use super::PortableData;
use crate::database::DEFAULT_PROFILE_ID;
use crate::error::ApiError;

/// The uuids of the PIN-protected profiles other than the active one.
pub(super) async fn withheld_profile_ids(
    conn: &mut SqliteConnection,
) -> Result<HashSet<String>, ApiError> {
    let active: Option<(String,)> =
        sqlx::query_as("SELECT value FROM preferences WHERE key = 'activeProfileId'")
            .fetch_optional(&mut *conn)
            .await
            .map_err(ApiError::from)?;
    let active = active
        .and_then(|(value,)| serde_json::from_str::<String>(&value).ok())
        .unwrap_or_else(|| DEFAULT_PROFILE_ID.to_string());
    let rows: Vec<(String,)> =
        sqlx::query_as("SELECT uuid FROM profiles WHERE pin_hash IS NOT NULL AND uuid != $1")
            .bind(active)
            .fetch_all(&mut *conn)
            .await
            .map_err(ApiError::from)?;
    Ok(rows.into_iter().map(|(uuid,)| uuid).collect())
}

/// `ids` as a JSON array, for a `json_each($n)` bind in SQL.
pub(super) fn as_json_array(ids: &HashSet<String>) -> String {
    serde_json::Value::Array(
        ids.iter()
            .map(|id| serde_json::Value::String(id.clone()))
            .collect(),
    )
    .to_string()
}

impl PortableData {
    /// Drops everything that belongs to one of `withheld` profiles.
    pub(super) fn drop_profiles(&mut self, withheld: &HashSet<String>) {
        if withheld.is_empty() {
            return;
        }
        let held = |profile_id: &str| withheld.contains(profile_id);
        let held_opt = |profile_id: &Option<String>| profile_id.as_deref().is_some_and(held);

        self.profiles.retain(|item| !held(&item.id));
        self.seen_movies.retain(|item| !held_opt(&item.profile_id));
        self.episode_progress
            .retain(|item| !held_opt(&item.profile_id));
        self.tracked_series
            .retain(|item| !held_opt(&item.profile_id));
        self.history.retain(|item| {
            let owner = item
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("profileId"))
                .and_then(serde_json::Value::as_str);
            !owner.is_some_and(held)
        });
        self.library.retain(|item| !held(&item.profile_id));
        self.viewing_events.retain(|item| !held(&item.profile_id));
        let held_lists: HashSet<String> = self
            .custom_lists
            .iter()
            .filter(|item| held(&item.profile_id))
            .map(|item| item.id.clone())
            .collect();
        self.custom_lists.retain(|item| !held(&item.profile_id));
        self.custom_list_items
            .retain(|item| !held_lists.contains(&item.list_id));
        self.availability_alerts
            .retain(|item| !held(&item.profile_id));
        self.smart_lists.retain(|item| !held(&item.profile_id));
        self.saved_filters.retain(|item| !held(&item.profile_id));
        self.dismissed_recommendations
            .retain(|item| !held(&item.profile_id));
    }
}
