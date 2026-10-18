/// A runtime fit for `viewing_events.duration_minutes` (NULL or > 0): TMDB
/// reports 0 when it doesn't know one, which the CHECK constraint rejects —
/// that used to make marking such a title watched fail outright.
pub(crate) fn known_runtime(runtime: Option<i64>) -> Option<i64> {
    runtime.filter(|minutes| *minutes > 0)
}

/// SQL condition for "a regular episode that has been watched" on
/// `episode_progress`: season 0 holds specials, which never count towards a
/// series' progress, its totals or its automatic status. The optional prefix
/// qualifies the columns with a table alias (`regular_episodes_watched!("ep.")`).
///
/// A macro, not a `const`, so it can be spliced into a `concat!`-built
/// literal and the statements stay compile-time constants.
macro_rules! regular_episodes_watched {
    () => {
        $crate::progress::regular_episodes_watched!("")
    };
    ($alias:literal) => {
        concat!($alias, "watched = 1 AND ", $alias, "season_number > 0")
    };
}
pub(crate) use regular_episodes_watched;
