use crate::library::LibraryStatus;

/// TMDB series statuses after which no new episode is coming.
fn is_finished_series(status: Option<&str>) -> bool {
    matches!(status, Some("Ended" | "Canceled"))
}

/// Completed requires the series itself to be over: for an ongoing show,
/// "every aired episode watched" only means caught up, and the next
/// episode would otherwise find it stuck on Completed (auto-sync never
/// lowers a status). An unknown status is treated as ongoing for the same
/// reason.
pub(super) fn auto_sync_target(
    watched_episodes: i64,
    total_episodes: Option<i64>,
    series_status: Option<&str>,
) -> Option<LibraryStatus> {
    match total_episodes {
        Some(total)
            if total > 0 && watched_episodes >= total && is_finished_series(series_status) =>
        {
            Some(LibraryStatus::Completed)
        }
        _ if watched_episodes >= 1 => Some(LibraryStatus::Watching),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_episode_progress_to_the_expected_library_status() {
        assert_eq!(auto_sync_target(0, Some(10), Some("Ended")), None);
        assert_eq!(
            auto_sync_target(1, Some(10), Some("Ended")),
            Some(LibraryStatus::Watching)
        );
        assert_eq!(
            auto_sync_target(10, Some(10), Some("Ended")),
            Some(LibraryStatus::Completed)
        );
        assert_eq!(
            auto_sync_target(10, Some(10), Some("Canceled")),
            Some(LibraryStatus::Completed)
        );
        assert_eq!(
            auto_sync_target(1, None, None),
            Some(LibraryStatus::Watching)
        );
    }

    #[test]
    fn a_caught_up_ongoing_or_unknown_status_series_stays_watching() {
        for status in [Some("Returning Series"), Some("In Production"), None] {
            assert_eq!(
                auto_sync_target(10, Some(10), status),
                Some(LibraryStatus::Watching)
            );
        }
    }
}
