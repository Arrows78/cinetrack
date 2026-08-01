mod history;
mod preferences;
mod tmdb;
mod updater;
mod watchlist;

pub use history::{add_history_item, list_history};
pub use preferences::{get_preferences, invalidate_preferences_cache, update_preference, PreferencesCache};
pub use tmdb::tmdb_request;
pub use updater::{has_updater_config, updater_is_configured};
pub use watchlist::{has_watchlist_item, list_watchlist, remove_watchlist_item, upsert_watchlist_item};
