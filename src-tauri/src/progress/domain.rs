use crate::library::LibraryStatus;

pub(super) fn auto_sync_target(
    watched_episodes: i64,
    total_episodes: Option<i64>,
) -> Option<LibraryStatus> {
    match total_episodes {
        Some(total) if total > 0 && watched_episodes >= total => Some(LibraryStatus::Completed),
        _ if watched_episodes >= 1 => Some(LibraryStatus::Watching),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_episode_progress_to_the_expected_library_status() {
        assert_eq!(auto_sync_target(0, Some(10)), None);
        assert_eq!(auto_sync_target(1, Some(10)), Some(LibraryStatus::Watching));
        assert_eq!(auto_sync_target(10, Some(10)), Some(LibraryStatus::Completed));
        assert_eq!(auto_sync_target(1, None), Some(LibraryStatus::Watching));
    }
}
