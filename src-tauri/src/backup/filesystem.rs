use std::path::{Path, PathBuf};

use crate::error::ApiError;

fn validate_backup_file_path(path: &str) -> Result<PathBuf, ApiError> {
    let candidate = PathBuf::from(path);
    if !candidate.is_absolute() {
        return Err(ApiError::bad_request("Backup paths must be absolute"));
    }
    if candidate
        .components()
        .any(|component| component == std::path::Component::ParentDir)
    {
        return Err(ApiError::bad_request(
            "Backup paths cannot contain parent-directory segments",
        ));
    }
    let file_name = candidate
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| ApiError::bad_request("Backup path must name a file"))?;
    let allowed = file_name == "backup.json"
        || file_name == "latest.json"
        || file_name == "pre-restore.json"
        || (file_name.starts_with("auto-") && file_name.ends_with(".json"))
        || (file_name.ends_with(".json.tmp"));
    if !allowed {
        return Err(ApiError::bad_request("Path is not a CineTrack backup file"));
    }
    // Never follow a pre-existing symlink supplied by the frontend. This
    // keeps the user-selected backup directory flexible while preventing a
    // backup operation from unexpectedly reading, overwriting, or deleting a
    // different file elsewhere on disk.
    if let Ok(metadata) = std::fs::symlink_metadata(&candidate)
        && metadata.file_type().is_symlink()
    {
        return Err(ApiError::bad_request(
            "Backup file paths cannot be symbolic links",
        ));
    }
    Ok(candidate)
}

fn validate_backup_directory_path(directory: &str) -> Result<PathBuf, ApiError> {
    let candidate = PathBuf::from(directory);
    if !candidate.is_absolute() {
        return Err(ApiError::bad_request("Backup directories must be absolute"));
    }
    if candidate
        .components()
        .any(|component| component == std::path::Component::ParentDir)
    {
        return Err(ApiError::bad_request(
            "Backup directories cannot contain parent-directory segments",
        ));
    }
    Ok(candidate)
}

pub(super) fn write_backup_file_sync(path: &Path, contents: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut tmp_path_os = path.as_os_str().to_owned();
    tmp_path_os.push(".tmp");
    let tmp_path = PathBuf::from(tmp_path_os);
    std::fs::write(&tmp_path, contents)?;
    std::fs::rename(&tmp_path, path)
}

pub(super) fn read_backup_file_sync(path: &Path) -> std::io::Result<Option<String>> {
    match std::fs::read_to_string(path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

pub(super) fn list_backup_directory_sync(directory: &Path) -> std::io::Result<Vec<String>> {
    let entries = match std::fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let mut names = Vec::new();
    for entry in entries {
        let entry = entry?;
        if entry.file_type()?.is_file()
            && let Some(name) = entry.file_name().to_str()
        {
            names.push(name.to_string());
        }
    }
    Ok(names)
}

pub(super) fn remove_backup_file_sync(path: &Path) -> std::io::Result<()> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

fn io_error(context: &str, path: &str, error: std::io::Error) -> ApiError {
    ApiError::internal(format!("{context} at \"{path}\": {error}"))
}

pub(super) async fn write(path: String, contents: String) -> Result<(), ApiError> {
    let path_buf = validate_backup_file_path(&path)?;
    let path_for_error = path.clone();
    tokio::task::spawn_blocking(move || write_backup_file_sync(&path_buf, &contents))
        .await
        .map_err(|error| ApiError::internal(format!("Backup write task panicked: {error}")))?
        .map_err(|error| io_error("Failed to write backup file", &path_for_error, error))
}

pub(super) async fn read(path: String) -> Result<Option<String>, ApiError> {
    let path_buf = validate_backup_file_path(&path)?;
    let path_for_error = path.clone();
    tokio::task::spawn_blocking(move || read_backup_file_sync(&path_buf))
        .await
        .map_err(|error| ApiError::internal(format!("Backup read task panicked: {error}")))?
        .map_err(|error| io_error("Failed to read backup file", &path_for_error, error))
}

pub(super) async fn list(directory: String) -> Result<Vec<String>, ApiError> {
    let dir_buf = validate_backup_directory_path(&directory)?;
    let dir_for_error = directory.clone();
    tokio::task::spawn_blocking(move || list_backup_directory_sync(&dir_buf))
        .await
        .map_err(|error| ApiError::internal(format!("Backup list task panicked: {error}")))?
        .map_err(|error| io_error("Failed to list backup directory", &dir_for_error, error))
}

pub(super) async fn remove(path: String) -> Result<(), ApiError> {
    let path_buf = validate_backup_file_path(&path)?;
    let path_for_error = path.clone();
    tokio::task::spawn_blocking(move || remove_backup_file_sync(&path_buf))
        .await
        .map_err(|error| ApiError::internal(format!("Backup remove task panicked: {error}")))?
        .map_err(|error| io_error("Failed to remove backup file", &path_for_error, error))
}
