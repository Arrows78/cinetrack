mod history;
mod library;
mod preferences;
mod progress;
mod stats;
mod tmdb;
mod updater;
mod watchlist;

pub use history::{add_history_item, list_history};
pub use library::{get_library_item, list_library, remove_library_item, upsert_library_item};
pub use preferences::{get_preferences, invalidate_preferences_cache, update_preference, PreferencesCache};
pub use progress::{apply_episodes, get_episode_progress, is_movie_seen, list_tracked_series, toggle_movie_seen};
pub use stats::list_viewing_events;
pub use tmdb::tmdb_request;
pub use updater::{has_updater_config, updater_is_configured};
pub use watchlist::{has_watchlist_item, list_watchlist, remove_watchlist_item, upsert_watchlist_item};
