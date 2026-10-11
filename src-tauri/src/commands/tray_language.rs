use crate::error::ApiError;
use crate::preferences::Language;

fn parse_language(language: &str) -> Result<Language, ApiError> {
    serde_json::from_value(serde_json::Value::String(language.to_string()))
        .map_err(|_| ApiError::bad_request("Unsupported language."))
}

/// Puts the system tray menu in the interface language: the webview calls
/// this whenever its language changes, since a native menu cannot read the
/// webview's translations. Nothing to do on mobile, where there is no tray.
#[tauri::command]
pub fn set_tray_language(language: String, app: tauri::AppHandle) -> Result<(), ApiError> {
    let language = parse_language(&language)?;
    #[cfg(desktop)]
    crate::tray::apply_language(&app, language)?;
    #[cfg(mobile)]
    let _ = (&app, language);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_the_two_interface_languages() {
        assert_eq!(parse_language("en").unwrap(), Language::En);
        assert_eq!(parse_language("fr").unwrap(), Language::Fr);
    }

    #[test]
    fn rejects_anything_else() {
        for language in ["", "de", "EN", "fr-FR"] {
            assert_eq!(parse_language(language).unwrap_err().status, Some(400));
        }
    }
}
