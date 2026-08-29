use std::path::{Path, PathBuf};

use crate::error::ApiError;

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
    let path_buf = PathBuf::from(&path);
    let path_for_error = path.clone();
    tokio::task::spawn_blocking(move || write_backup_file_sync(&path_buf, &contents))
        .await
        .map_err(|error| ApiError::internal(format!("Backup write task panicked: {error}")))?
        .map_err(|error| io_error("Failed to write backup file", &path_for_error, error))
}

pub(super) async fn read(path: String) -> Result<Option<String>, ApiError> {
    let path_buf = PathBuf::from(&path);
    let path_for_error = path.clone();
    tokio::task::spawn_blocking(move || read_backup_file_sync(&path_buf))
        .await
        .map_err(|error| ApiError::internal(format!("Backup read task panicked: {error}")))?
        .map_err(|error| io_error("Failed to read backup file", &path_for_error, error))
}

pub(super) async fn list(directory: String) -> Result<Vec<String>, ApiError> {
    let dir_buf = PathBuf::from(&directory);
    let dir_for_error = directory.clone();
    tokio::task::spawn_blocking(move || list_backup_directory_sync(&dir_buf))
        .await
        .map_err(|error| ApiError::internal(format!("Backup list task panicked: {error}")))?
        .map_err(|error| io_error("Failed to list backup directory", &dir_for_error, error))
}

pub(super) async fn remove(path: String) -> Result<(), ApiError> {
    let path_buf = PathBuf::from(&path);
    let path_for_error = path.clone();
    tokio::task::spawn_blocking(move || remove_backup_file_sync(&path_buf))
        .await
        .map_err(|error| ApiError::internal(format!("Backup remove task panicked: {error}")))?
        .map_err(|error| io_error("Failed to remove backup file", &path_for_error, error))
}
