mod availability;
mod backup;
mod boot;
mod custom_lists;
mod history;
mod library;
mod macros;
mod preferences;
mod profiles;
mod progress;
mod stats;
mod tmdb;
mod tvtime;
mod updater;

pub use availability::{
    get_availability_alert, get_availability_snapshot, list_availability_alerts,
    remove_availability_alert, save_availability_snapshot, toggle_availability_alert,
};
pub use backup::{check_data_integrity, export_backup_data, import_backup_data};
pub use boot::get_boot_recovery;
pub use custom_lists::{
    add_custom_list_item, create_custom_list, list_custom_list_items, list_custom_lists,
    remove_custom_list, remove_custom_list_item,
};
pub use history::list_history;
pub use library::{
    get_library_item, has_library_item, list_library, remove_library_item,
    remove_planned_library_item, save_library_item,
};
pub use preferences::{
    PreferencesCache, get_preferences, refresh_preferences, set_active_profile, update_preference,
};
pub use profiles::{
    create_profile, find_profile_by_supabase_user_id, link_profile_to_supabase_user, list_profiles,
    remove_profile, resolve_profile_for_supabase_user,
};
pub use progress::{
    get_episode_progress, is_movie_seen, list_tracked_series, refresh_tracked_series_status,
    toggle_episodes_watched, toggle_movie_seen,
};
pub use stats::{
    get_stats_overview, list_recent_viewing_events, list_viewing_events_for_year,
    list_yearly_activity,
};
pub use tmdb::tmdb_request;
pub use tvtime::{import_movie_seen, import_series_progress};
pub use updater::{has_updater_config, updater_is_configured};
