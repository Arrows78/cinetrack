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
    {
        use std::io::Write;
        let mut file = std::fs::File::create(&tmp_path)?;
        file.write_all(contents.as_bytes())?;
        // Without this, a power loss right after the rename can leave the
        // final name pointing at an empty or partial file: the rename may
        // reach the disk before the data does. The previous good backup would
        // already be gone by then.
        file.sync_all()?;
    }
    std::fs::rename(&tmp_path, path)?;
    // Persist the rename itself (a no-op where a directory cannot be opened).
    #[cfg(unix)]
    if let Some(parent) = path.parent()
        && let Ok(directory) = std::fs::File::open(parent)
    {
        let _ = directory.sync_all();
    }
    Ok(())
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

/// Keeps a path inside the one directory these commands may touch: the
/// `backups` folder of the backup directory the user configured. The commands
/// are callable from the webview with any string, so without this a
/// compromised page could read, overwrite or delete a file named like a backup
/// anywhere on disk, or list any directory.
fn confine(candidate: &Path, root: &Path) -> Result<(), ApiError> {
    let outside = || ApiError::forbidden("Path is outside the configured backup directory");
    if candidate.parent() != Some(root) && candidate != root {
        return Err(outside());
    }
    // A symlinked directory in the middle of the path would lead somewhere
    // else while still comparing equal as text.
    let real_dir = if candidate == root {
        candidate
    } else {
        candidate.parent().ok_or_else(outside)?
    };
    if let (Ok(real), Ok(wanted)) = (real_dir.canonicalize(), root.canonicalize())
        && real != wanted
    {
        return Err(outside());
    }
    Ok(())
}

fn io_error(context: &str, path: &str, error: std::io::Error) -> ApiError {
    ApiError::internal(format!("{context} at \"{path}\": {error}"))
}

pub(super) async fn write(path: String, contents: String, root: &Path) -> Result<(), ApiError> {
    let path_buf = validate_backup_file_path(&path)?;
    confine(&path_buf, root)?;
    let path_for_error = path.clone();
    tokio::task::spawn_blocking(move || write_backup_file_sync(&path_buf, &contents))
        .await
        .map_err(|error| ApiError::internal(format!("Backup write task panicked: {error}")))?
        .map_err(|error| io_error("Failed to write backup file", &path_for_error, error))
}

pub(super) async fn read(path: String, root: &Path) -> Result<Option<String>, ApiError> {
    let path_buf = validate_backup_file_path(&path)?;
    confine(&path_buf, root)?;
    let path_for_error = path.clone();
    tokio::task::spawn_blocking(move || read_backup_file_sync(&path_buf))
        .await
        .map_err(|error| ApiError::internal(format!("Backup read task panicked: {error}")))?
        .map_err(|error| io_error("Failed to read backup file", &path_for_error, error))
}

pub(super) async fn list(directory: String, root: &Path) -> Result<Vec<String>, ApiError> {
    let dir_buf = validate_backup_directory_path(&directory)?;
    confine(&dir_buf, root)?;
    let dir_for_error = directory.clone();
    tokio::task::spawn_blocking(move || list_backup_directory_sync(&dir_buf))
        .await
        .map_err(|error| ApiError::internal(format!("Backup list task panicked: {error}")))?
        .map_err(|error| io_error("Failed to list backup directory", &dir_for_error, error))
}

pub(super) async fn remove(path: String, root: &Path) -> Result<(), ApiError> {
    let path_buf = validate_backup_file_path(&path)?;
    confine(&path_buf, root)?;
    let path_for_error = path.clone();
    tokio::task::spawn_blocking(move || remove_backup_file_sync(&path_buf))
        .await
        .map_err(|error| ApiError::internal(format!("Backup remove task panicked: {error}")))?
        .map_err(|error| io_error("Failed to remove backup file", &path_for_error, error))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("cinetrack-backup-{name}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test]
    async fn a_backup_is_written_read_listed_and_removed_inside_the_configured_folder() {
        let root = scratch("ok").join("backups");
        let file = root.join("latest.json");
        let file_str = file.to_string_lossy().to_string();

        write(file_str.clone(), "{}".to_string(), &root)
            .await
            .unwrap();
        assert_eq!(
            read(file_str.clone(), &root).await.unwrap().as_deref(),
            Some("{}")
        );
        assert_eq!(
            list(root.to_string_lossy().to_string(), &root)
                .await
                .unwrap(),
            vec!["latest.json".to_string()]
        );
        remove(file_str.clone(), &root).await.unwrap();
        assert_eq!(read(file_str, &root).await.unwrap(), None);
    }

    #[tokio::test]
    async fn a_path_outside_the_configured_folder_is_refused_for_every_operation() {
        let base = scratch("outside");
        let root = base.join("backups");
        std::fs::create_dir_all(&root).unwrap();
        let elsewhere = scratch("elsewhere");
        let stray = elsewhere.join("latest.json");
        std::fs::write(&stray, "secret").unwrap();
        let stray_str = stray.to_string_lossy().to_string();

        assert!(write(stray_str.clone(), "x".into(), &root).await.is_err());
        assert!(read(stray_str.clone(), &root).await.is_err());
        assert!(remove(stray_str, &root).await.is_err());
        assert!(
            list(elsewhere.to_string_lossy().to_string(), &root)
                .await
                .is_err()
        );
        assert_eq!(
            std::fs::read_to_string(&stray).unwrap(),
            "secret",
            "untouched"
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_symlinked_folder_cannot_lead_out_of_the_configured_one() {
        let base = scratch("link");
        let target = scratch("target");
        let link_root = base.join("backups");
        std::os::unix::fs::symlink(&target, &link_root).unwrap();
        // The configured root is a different, real folder; the candidate goes
        // through a symlink that resolves elsewhere.
        let real_root = scratch("real").join("backups");
        std::fs::create_dir_all(&real_root).unwrap();
        let sneaky = link_root.join("latest.json");

        assert!(
            confine(&sneaky, &link_root).is_ok(),
            "the configured folder itself may be a link the user chose"
        );
        assert!(confine(&sneaky, &real_root).is_err());
    }
}
