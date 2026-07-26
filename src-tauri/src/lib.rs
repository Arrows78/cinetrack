use std::collections::HashMap;

use serde_json::Value;
use tauri::{Emitter, Manager};

#[tauri::command]
async fn tmdb_request(
    path: String,
    params: HashMap<String, String>,
    token: String,
) -> Result<Value, String> {
    if !path.starts_with('/') || path.contains("..") || path.contains("://") {
        return Err("Invalid TMDB path".into());
    }

    let client = reqwest::Client::new();

    let response = client
        .get(format!("https://api.themoviedb.org/3{path}"))
        .bearer_auth(token)
        .header("accept", "application/json")
        .query(&params)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;

    if !status.is_success() {
        return Err(format!("TMDB {status}: {body}"));
    }

    serde_json::from_str(&body).map_err(|error| error.to_string())
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

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![tmdb_request])
        .setup(|app| {
            let salt_path = app.path().app_local_data_dir()?.join("stronghold-salt.txt");

            app.handle()
                .plugin(tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build())?;

            #[cfg(desktop)]
            {
                use tauri::{
                    menu::{Menu, MenuItem},
                    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
                };
                use tauri_plugin_autostart::MacosLauncher;

                app.handle().plugin(tauri_plugin_autostart::init(
                    MacosLauncher::LaunchAgent,
                    None,
                ))?;

                app.handle()
                    .plugin(tauri_plugin_global_shortcut::Builder::new().build())?;

                if app.config().plugins.0.contains_key("updater") {
                    app.handle()
                        .plugin(tauri_plugin_updater::Builder::new().build())?;
                }

                let open = MenuItem::with_id(app, "open", "Ouvrir CineTrack", true, None::<&str>)?;

                let tonight = MenuItem::with_id(
                    app,
                    "tonight",
                    "Que regarder ce soir ?",
                    true,
                    None::<&str>,
                )?;

                let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;

                let menu = Menu::with_items(app, &[&open, &tonight, &quit])?;

                TrayIconBuilder::new()
                    .icon(app.default_window_icon().expect("app icon").clone())
                    .tooltip("CineTrack")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "open" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "tonight" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }

                            let _ = app.emit("cinetrack:navigate", "/watch-tonight");
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            if let Some(window) = tray.app_handle().get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    })
                    .build(app)?;
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
