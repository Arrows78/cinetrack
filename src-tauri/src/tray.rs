use tauri::{
    AppHandle, Emitter, Manager, Wry,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

use crate::error::ApiError;
use crate::preferences::Language;

/// What the tray menu says, in the interface language. The webview's own
/// translations (src/i18n) are out of reach of a native menu, so the few
/// strings it needs live here; `set_tray_language` keeps them in step with
/// the language preference while the app runs.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct TrayLabels {
    pub(crate) open: &'static str,
    pub(crate) tonight: &'static str,
    pub(crate) quit: &'static str,
}

pub(crate) fn labels(language: Language) -> TrayLabels {
    match language {
        Language::En => TrayLabels {
            open: "Open CineTrack",
            tonight: "What to watch tonight?",
            quit: "Quit",
        },
        Language::Fr => TrayLabels {
            open: "Ouvrir CineTrack",
            tonight: "Que regarder ce soir ?",
            quit: "Quitter",
        },
    }
}

/// The menu entries whose text follows the language, kept so it can be
/// rewritten after the menu was built.
pub struct TrayMenuItems {
    open: MenuItem<Wry>,
    tonight: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

pub fn build(app: &AppHandle, language: Language) -> tauri::Result<()> {
    let text = labels(language);
    let open = MenuItem::with_id(app, "open", text.open, true, None::<&str>)?;
    let tonight = MenuItem::with_id(app, "tonight", text.tonight, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", text.quit, true, None::<&str>)?;

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
                && let Some(window) = tray.app_handle().get_webview_window("main")
            {
                let _ = window.show();
                let _ = window.set_focus();
            }
        })
        .build(app)?;

    app.manage(TrayMenuItems {
        open,
        tonight,
        quit,
    });

    Ok(())
}

/// Rewrites the tray menu in `language`. A no-op when the tray was never
/// built (it is only created on desktop).
pub(crate) fn apply_language(app: &AppHandle, language: Language) -> Result<(), ApiError> {
    let Some(items) = app.try_state::<TrayMenuItems>() else {
        return Ok(());
    };
    let text = labels(language);
    for (item, label) in [
        (&items.open, text.open),
        (&items.tonight, text.tonight),
        (&items.quit, text.quit),
    ] {
        item.set_text(label).map_err(|error| {
            ApiError::internal(format!("Couldn't update the tray menu: {error}"))
        })?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_menu_speaks_the_interface_language() {
        assert_eq!(labels(Language::Fr).quit, "Quitter");
        assert_eq!(labels(Language::En).quit, "Quit");
        assert_ne!(labels(Language::En), labels(Language::Fr));
    }

    #[test]
    fn every_label_is_filled_in_both_languages() {
        for language in [Language::En, Language::Fr] {
            let text = labels(language);
            assert!(!text.open.is_empty() && !text.tonight.is_empty() && !text.quit.is_empty());
        }
    }
}
