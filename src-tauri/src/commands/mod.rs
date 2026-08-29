mod boot;
pub(crate) mod custom_lists;
pub(crate) mod history;
mod macros;
pub(crate) mod saved_filters;
pub(crate) mod smart_lists;
mod tmdb;
mod tvtime;
mod updater;

pub use crate::availability::{
    get_availability_alert, get_availability_snapshot, list_availability_alerts,
    list_availability_snapshots, remove_availability_alert, save_availability_snapshot,
    toggle_availability_alert,
};
pub use crate::backup::{
    check_data_integrity, export_backup_data, import_backup_data, list_backup_directory,
    read_backup_from_path, remove_backup_file, write_backup_to_path,
};
pub use crate::library::{
    get_library_item, has_library_item, list_library, remove_library_item,
    remove_planned_library_item, save_library_item,
};
pub use crate::preferences::{
    PreferencesCache, get_preferences, refresh_preferences, set_active_profile, update_preference,
};
pub use crate::profiles::{
    create_profile, find_profile_by_supabase_user_id, link_profile_to_supabase_user, list_profiles,
    remove_profile, resolve_profile_for_supabase_user,
};
pub use crate::progress::{
    get_episode_progress, is_movie_seen, list_tracked_series, refresh_tracked_series_status,
    toggle_episodes_watched, toggle_movie_seen,
};
pub use crate::stats::{
    get_monthly_recap, get_rating_distribution, get_rewatch_stats, get_stats_overview,
    get_watch_milestones, list_on_this_day_events, list_recent_viewing_events,
    list_viewing_events_for_media, list_viewing_events_for_year, list_yearly_activity,
};
pub use boot::get_boot_recovery;
pub use custom_lists::{
    add_custom_list_item, create_custom_list, list_custom_list_items, list_custom_lists,
    remove_custom_list, remove_custom_list_item,
};
pub use history::list_history;
pub use saved_filters::{create_saved_filter, list_saved_filters, remove_saved_filter};
pub use smart_lists::{create_smart_list, list_smart_lists, remove_smart_list, update_smart_list};
pub use tmdb::tmdb_request;
pub use tvtime::{import_movie_seen, import_series_progress};
pub use updater::{has_updater_config, updater_is_configured};
