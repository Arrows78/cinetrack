mod commands;
mod database;
mod error;
mod models;
mod tray;

use tauri::{Emitter, Manager};

use commands::{
    add_history_item, get_preferences, invalidate_preferences_cache, list_history, tmdb_request,
    update_preference, updater_is_configured, PreferencesCache,
};

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

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            tmdb_request,
            updater_is_configured,
            get_preferences,
            update_preference,
            invalidate_preferences_cache,
            list_history,
            add_history_item,
        ])
        .setup(|app| {
            // Same "sqlite:app.db" file tauri-plugin-sql already opens
            // (resolved against the app config dir) — both drivers must
            // agree on the file while domains are migrated one at a time.
            let handle = app.handle().clone();
            let pool = tauri::async_runtime::block_on(async move { database::init_pool(&handle).await })
                .map_err(|error| Box::new(error) as Box<dyn std::error::Error>)?;
            app.manage(pool);
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
        .expect("error while running tauri application");
}
