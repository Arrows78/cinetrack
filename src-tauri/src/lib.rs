mod availability;
mod backup;
mod commands;
mod database;
mod error;
mod history;
mod library;
mod lists;
mod models;
mod preferences;
mod profiles;
mod progress;
mod stats;
// tray::build uses tauri::tray/tauri::menu, which only exist on desktop —
// the module itself must be gated, not just its (already-gated) call site:
// Rust compiles every `mod`-included file regardless of whether anything
// inside it is called, so an ungated `mod tray;` still fails to compile
// on iOS/Android even though tray::build() is only ever invoked inside a
// `#[cfg(desktop)]` block in run().
#[cfg(desktop)]
mod tray;

use tauri::{Emitter, Manager};

use commands::{
    PreferencesCache, add_custom_list_item, check_data_integrity, create_custom_list,
    create_profile, create_smart_list, export_backup_data, find_profile_by_supabase_user_id,
    get_availability_alert, get_availability_snapshot, get_boot_recovery, get_episode_progress,
    get_library_item, get_preferences, get_stats_overview, has_library_item, import_backup_data,
    import_movie_seen, import_series_progress, is_movie_seen, link_profile_to_supabase_user,
    list_availability_alerts, list_availability_snapshots, list_backup_directory,
    list_custom_list_items, list_custom_lists, list_history, list_library, list_on_this_day_events,
    list_profiles, list_recent_viewing_events, list_smart_lists, list_tracked_series,
    list_viewing_events_for_media, list_viewing_events_for_year, list_yearly_activity,
    read_backup_from_path, refresh_preferences, refresh_tracked_series_status,
    remove_availability_alert, remove_backup_file, remove_custom_list, remove_custom_list_item,
    remove_library_item, remove_planned_library_item, remove_profile, remove_saved_filter,
    remove_smart_list, resolve_profile_for_supabase_user, save_availability_snapshot,
    save_library_item, set_active_profile, tmdb_request, toggle_availability_alert,
    toggle_episodes_watched, toggle_movie_seen, update_preference, update_smart_list,
    updater_is_configured, write_backup_to_path,
};
use commands::{create_saved_filter, list_saved_filters};
use commands::{
    get_monthly_recap, get_rating_distribution, get_rewatch_stats, get_watch_milestones,
};

// Last-resort safety net: `Builder::run` returns a clean `Result` (setup
// failures — see the `.setup()` closure below — surface here rather than
// panicking inside Tauri itself), but this runs before any window or
// webview exists, so there is nothing on screen to show an error in. A
// native OS dialog is the only way the user ever sees this instead of the
// app just silently failing to open. Desktop only: rfd has no mobile
// backend (mobile keeps the old panic on this specific failure path).
#[cfg(desktop)]
fn show_startup_error_dialog(error: &tauri::Error) {
    rfd::MessageDialog::new()
        .set_title("CineTrack")
        .set_description(format!(
            "CineTrack n'a pas pu démarrer : {error}\n\n\
             Vos données ne sont pas perdues. Si une sauvegarde automatique existe, \
             vous pourrez la restaurer une fois le problème résolu.",
        ))
        .set_level(rfd::MessageLevel::Error)
        .set_buttons(rfd::MessageButtons::Ok)
        .show();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }

            if let Some(url) = argv
                .iter()
                .find(|argument| argument.starts_with("cinetrack://"))
            {
                let _ = app.emit("cinetrack:deep-link", url);
            }
        }));
    }

    #[cfg(mobile)]
    {
        builder = builder.plugin(tauri_plugin_sharekit::init());
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            tmdb_request,
            get_boot_recovery,
            updater_is_configured,
            get_preferences,
            update_preference,
            set_active_profile,
            refresh_preferences,
            list_history,
            list_library,
            get_library_item,
            has_library_item,
            save_library_item,
            remove_library_item,
            remove_planned_library_item,
            is_movie_seen,
            toggle_movie_seen,
            get_episode_progress,
            toggle_episodes_watched,
            list_tracked_series,
            refresh_tracked_series_status,
            list_recent_viewing_events,
            list_viewing_events_for_year,
            list_viewing_events_for_media,
            list_yearly_activity,
            list_on_this_day_events,
            get_stats_overview,
            get_monthly_recap,
            get_rewatch_stats,
            get_rating_distribution,
            get_watch_milestones,
            list_availability_alerts,
            get_availability_alert,
            toggle_availability_alert,
            remove_availability_alert,
            get_availability_snapshot,
            save_availability_snapshot,
            list_profiles,
            create_profile,
            find_profile_by_supabase_user_id,
            link_profile_to_supabase_user,
            resolve_profile_for_supabase_user,
            remove_profile,
            list_custom_lists,
            create_custom_list,
            remove_custom_list,
            list_custom_list_items,
            add_custom_list_item,
            remove_custom_list_item,
            list_smart_lists,
            create_smart_list,
            update_smart_list,
            remove_smart_list,
            list_availability_snapshots,
            list_saved_filters,
            create_saved_filter,
            remove_saved_filter,
            import_series_progress,
            import_movie_seen,
            export_backup_data,
            import_backup_data,
            check_data_integrity,
            write_backup_to_path,
            read_backup_from_path,
            list_backup_directory,
            remove_backup_file,
        ])
        .setup(|app| {
            // Same "sqlite:app.db" file tauri-plugin-sql already opens
            // (resolved against the app config dir) — both drivers must
            // agree on the file while domains are migrated one at a time.
            let handle = app.handle().clone();
            let (pool, boot_recovery) =
                tauri::async_runtime::block_on(async move { database::init_pool(&handle).await })
                    .map_err(|error| Box::new(error) as Box<dyn std::error::Error>)?;
            app.manage(pool);
            app.manage(boot_recovery);
            app.manage(PreferencesCache::default());

            let salt_path = app.path().app_local_data_dir()?.join("stronghold-salt.txt");

            app.handle()
                .plugin(tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build())?;

            #[cfg(desktop)]
            {
                use tauri_plugin_autostart::MacosLauncher;

                app.handle().plugin(tauri_plugin_autostart::init(
                    MacosLauncher::LaunchAgent,
                    None,
                ))?;

                app.handle()
                    .plugin(tauri_plugin_global_shortcut::Builder::new().build())?;

                if commands::has_updater_config(app.config().plugins.0.get("updater")) {
                    app.handle()
                        .plugin(tauri_plugin_updater::Builder::new().build())?;
                }

                tray::build(app.handle())?;
            }

            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| {
            #[cfg(desktop)]
            {
                show_startup_error_dialog(&error);
                std::process::exit(1);
            }

            #[cfg(mobile)]
            panic!("error while running tauri application: {error}");
        });
}
