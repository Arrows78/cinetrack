mod availability;
mod custom_lists;
mod history;
mod library;
mod preferences;
mod profiles;
mod progress;
mod stats;
mod tmdb;
mod updater;
mod watchlist;

pub use availability::{
    get_availability_alert, get_availability_snapshot, list_availability_alerts, remove_availability_alert,
    save_availability_snapshot, toggle_availability_alert,
};
pub use custom_lists::{
    add_custom_list_item, create_custom_list, list_custom_list_items, list_custom_lists, remove_custom_list,
    remove_custom_list_item,
};
pub use history::{add_history_item, list_history};
pub use library::{get_library_item, list_library, remove_library_item, upsert_library_item};
pub use preferences::{get_preferences, invalidate_preferences_cache, update_preference, PreferencesCache};
pub use profiles::{
    create_profile, find_profile_by_supabase_user_id, link_profile_to_supabase_user, list_profiles, remove_profile,
    resolve_profile_for_supabase_user,
};
pub use progress::{apply_episodes, get_episode_progress, is_movie_seen, list_tracked_series, toggle_movie_seen};
pub use stats::list_viewing_events;
pub use tmdb::tmdb_request;
pub use updater::{has_updater_config, updater_is_configured};
pub use watchlist::{has_watchlist_item, list_watchlist, remove_watchlist_item, upsert_watchlist_item};
