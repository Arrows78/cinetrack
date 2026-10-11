/// A runtime fit for `viewing_events.duration_minutes` (NULL or > 0): TMDB
/// reports 0 when it doesn't know one, which the CHECK constraint rejects —
/// that used to make marking such a title watched fail outright.
pub(crate) fn known_runtime(runtime: Option<i64>) -> Option<i64> {
    runtime.filter(|minutes| *minutes > 0)
}
