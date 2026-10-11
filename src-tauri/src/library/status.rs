//! The one place that decides a library entry's status from what the viewer
//! has watched. Read `docs/library-status.md` first: it explains the model;
//! this file is its implementation.
//!
//! The model in two sentences. Every title has a **derived status** computed
//! only from facts (is the movie seen; how many regular episodes of the
//! series are watched, out of how many, and is the series over). A status the
//! viewer picked by hand is `Manual` and is left alone; a status that follows
//! the facts is `Auto` and is recomputed every time the facts change.
//!
//! Everything that can change those facts funnels through
//! [`reconcile_status_impl`] / [`reconcile_title_impl`], which call the pure
//! [`decide`]. There is no other code that moves a status automatically.

use serde_json::json;
use sqlx::SqlitePool;

use super::domain::{LibraryStatus, LibraryStatusOrigin};
use super::models::{AutoSyncMedia, LibraryRow};
use crate::database::{new_uuid, now_iso};
use crate::error::ApiError;
use crate::history::{HistoryAction, ViewingHistoryItem, add_history_item_impl};
use crate::models::MediaType;

/// Why a status is being reconsidered.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum StatusTrigger {
    /// A movie or episode was just marked watched. The only trigger that may
    /// bring a title into the library and the only one that resumes a
    /// paused or dropped series.
    Watched,
    /// A movie or episode was just marked not watched.
    Unwatched,
    /// The facts changed without a viewing action: TMDB reported a new total
    /// or a new series status, or a sync brought progress from another device.
    Refreshed,
    /// The viewer asked for the automatic status back ("Automatic" in the
    /// library editor), or re-added a title that already has progress.
    Reset,
}

/// What the status is derived from. Never contains a status itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum StatusFacts {
    Movie {
        seen: bool,
    },
    Series {
        /// Regular episodes watched (specials, season 0, are not counted:
        /// TMDB's total does not include them).
        watched_episodes: i64,
        /// TMDB's episode count when it is actually known. `None` means
        /// "don't know", which can never complete a series.
        total_episodes: Option<i64>,
        /// TMDB's series status (`Ended`, `Canceled`, `Returning Series`, ...).
        series_status: Option<String>,
    },
}

/// TMDB series statuses after which no new episode is coming.
fn is_finished_series(status: Option<&str>) -> bool {
    matches!(status, Some("Ended" | "Canceled"))
}

/// The status the facts alone imply.
///
/// - movie: seen → Completed, otherwise Planned;
/// - series: nothing watched → Planned; some watched → Watching; every
///   episode watched **and** the series over → Completed. A series that is
///   merely caught up while still airing stays Watching: Completed would be
///   wrong the moment the next episode is announced. An unknown status or an
///   unknown total is treated as "not over".
pub(crate) fn derived_status(facts: &StatusFacts) -> LibraryStatus {
    match facts {
        StatusFacts::Movie { seen: true } => LibraryStatus::Completed,
        StatusFacts::Movie { seen: false } => LibraryStatus::Planned,
        StatusFacts::Series {
            watched_episodes,
            total_episodes,
            series_status,
        } => {
            if *watched_episodes < 1 {
                LibraryStatus::Planned
            } else if matches!(total_episodes, Some(total) if *total > 0 && watched_episodes >= total)
                && is_finished_series(series_status.as_deref())
            {
                LibraryStatus::Completed
            } else {
                LibraryStatus::Watching
            }
        }
    }
}

/// A library entry's status and who set it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct CurrentStatus {
    pub(crate) status: LibraryStatus,
    pub(crate) origin: LibraryStatusOrigin,
}

/// What to do with an entry's status.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum StatusDecision {
    /// Leave status and origin as they are.
    Keep,
    /// No entry yet: create one with this status (origin `Auto`).
    Create(LibraryStatus),
    /// Set this status and mark it `Auto`. When the status is the current one
    /// only the origin changes (the dates are left alone).
    Set(LibraryStatus),
}

/// The status rules. Pure: no database, no clock.
///
/// | origin | trigger | result |
/// |---|---|---|
/// | any | Reset | the derived status, now `Auto` |
/// | Auto | any other | the derived status (follows the facts both ways) |
/// | Manual | Unwatched | unchanged |
/// | Manual Planned | Watched | the derived status |
/// | Manual Watching | Watched / Refreshed | Completed if derived Completed, else unchanged |
/// | Manual Paused, Dropped | Watched | Completed if derived Completed, Watching if something is watched (a resume), else unchanged |
/// | Manual Paused, Dropped | Refreshed | unchanged |
/// | Manual Completed | any but Reset | unchanged |
/// | none | Watched | create with the derived status |
/// | none | any other | nothing |
pub(crate) fn decide(
    current: Option<CurrentStatus>,
    facts: &StatusFacts,
    trigger: StatusTrigger,
) -> StatusDecision {
    let derived = derived_status(facts);
    let Some(current) = current else {
        return if trigger == StatusTrigger::Watched {
            StatusDecision::Create(derived)
        } else {
            StatusDecision::Keep
        };
    };

    use LibraryStatus::{Completed, Dropped, Paused, Planned, Watching};
    use LibraryStatusOrigin::{Auto, Manual};
    use StatusTrigger::{Refreshed, Reset, Unwatched, Watched};

    let next = match (current.origin, trigger) {
        (_, Reset) | (Auto, _) => derived,
        (Manual, Unwatched) => return StatusDecision::Keep,
        (Manual, Watched) => match current.status {
            Planned => derived,
            Watching => {
                if derived == Completed {
                    Completed
                } else {
                    return StatusDecision::Keep;
                }
            }
            Paused | Dropped => match derived {
                Completed => Completed,
                // The facts say nothing is watched: there is nothing to resume.
                Planned => return StatusDecision::Keep,
                _ => Watching,
            },
            Completed => return StatusDecision::Keep,
        },
        (Manual, Refreshed) => match current.status {
            Watching if derived == Completed => Completed,
            _ => return StatusDecision::Keep,
        },
    };

    // Nothing to write when the status is already right and so is its
    // origin. A Reset on a manual status with the same value still has to
    // flip the origin to Auto.
    if next == current.status && (current.origin == Auto || trigger != Reset) {
        StatusDecision::Keep
    } else {
        StatusDecision::Set(next)
    }
}

/// Facts for a series, read from the database. `total_episodes` and
/// `series_status` are what the caller knows right now (a viewing action has
/// the series details in hand); `None` falls back to what `tracked_series`
/// cached from TMDB. The cached total is `0` when TMDB's count was never
/// known (see `apply_episodes_outcome_impl`), which reads as "unknown" here,
/// so a series of unknown length can start but never complete.
pub(crate) async fn series_facts(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    profile_id: &str,
    series_id: i64,
    total_episodes: Option<i64>,
    series_status: Option<String>,
) -> Result<StatusFacts, ApiError> {
    let watched_episodes = watched_regular_episodes(&mut **tx, profile_id, series_id).await?;
    let known_total = total_episodes.filter(|total| *total > 0);
    let (total_episodes, series_status) = match (known_total, series_status) {
        (Some(total), Some(status)) => (Some(total), Some(status)),
        (total, status) => {
            let (cached_total, cached_status) =
                match cached_series(&mut **tx, profile_id, series_id).await? {
                    Some((total, status)) => (Some(total).filter(|total| *total > 0), status),
                    None => (None, None),
                };
            (total.or(cached_total), status.or(cached_status))
        }
    };
    Ok(StatusFacts::Series {
        watched_episodes,
        total_episodes,
        series_status,
    })
}

async fn watched_regular_episodes<'e, E>(
    executor: E,
    profile_id: &str,
    series_id: i64,
) -> Result<i64, ApiError>
where
    E: sqlx::Executor<'e, Database = sqlx::Sqlite>,
{
    sqlx::query_scalar(
        "SELECT COUNT(*) FROM episode_progress
         WHERE profile_id = $1 AND series_id = $2 AND watched = 1 AND season_number > 0",
    )
    .bind(profile_id)
    .bind(series_id)
    .fetch_one(executor)
    .await
    .map_err(ApiError::from)
}

/// `tracked_series`'s cached (total, TMDB status), if the series is tracked.
async fn cached_series<'e, E>(
    executor: E,
    profile_id: &str,
    series_id: i64,
) -> Result<Option<(i64, Option<String>)>, ApiError>
where
    E: sqlx::Executor<'e, Database = sqlx::Sqlite>,
{
    sqlx::query_as("SELECT total_episodes, status FROM tracked_series WHERE profile_id = $1 AND series_id = $2")
        .bind(profile_id)
        .bind(series_id)
        .fetch_optional(executor)
        .await
        .map_err(ApiError::from)
}

/// Facts of a title as the database knows them (the cached TMDB total and
/// status for a series). Used when no caller has fresher information: a
/// refresh, a sync, a reset.
async fn stored_facts(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
) -> Result<StatusFacts, ApiError> {
    match media_type {
        MediaType::Movie => {
            let seen: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM seen_movies WHERE profile_id = $1 AND movie_id = $2",
            )
            .bind(profile_id)
            .bind(media_id)
            .fetch_one(&mut **tx)
            .await
            .map_err(ApiError::from)?;
            Ok(StatusFacts::Movie { seen: seen > 0 })
        }
        MediaType::Series => series_facts(tx, profile_id, media_id, None, None).await,
    }
}

async fn load_row(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
) -> Result<Option<LibraryRow>, ApiError> {
    sqlx::query_as(
        "SELECT * FROM library_items WHERE profile_id = $1 AND media_id = $2 AND media_type = $3 LIMIT 1",
    )
    .bind(profile_id)
    .bind(media_id)
    .bind(media_type.as_db_str())
    .fetch_optional(&mut **tx)
    .await
    .map_err(ApiError::from)
}

fn current_of(row: &LibraryRow) -> Result<CurrentStatus, ApiError> {
    Ok(CurrentStatus {
        status: LibraryStatus::from_db_str(&row.status)?,
        origin: LibraryStatusOrigin::from_db_str(&row.status_origin)?,
    })
}

/// Writes a new status on an existing entry. Dates follow the same rule as a
/// manual edit: Watching starts the clock if it has not started, Completed
/// stamps the completion, anything else clears the completion. A status that
/// does not change (a Reset that only flips the origin) leaves them alone.
async fn apply_set(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    row: &LibraryRow,
    next: LibraryStatus,
    now: &str,
) -> Result<(), ApiError> {
    let previous = LibraryStatus::from_db_str(&row.status)?;
    let (started_at, completed_at) = if next == previous {
        (row.started_at.clone(), row.completed_at.clone())
    } else {
        let started_at = if next == LibraryStatus::Watching {
            row.started_at.clone().or_else(|| Some(now.to_string()))
        } else {
            row.started_at.clone()
        };
        let completed_at = (next == LibraryStatus::Completed).then(|| now.to_string());
        (started_at, completed_at)
    };
    sqlx::query(
        "UPDATE library_items
         SET status = $1, status_origin = 'auto', started_at = $2, completed_at = $3,
             updated_at = MAX(updated_at, $4)
         WHERE uuid = $5",
    )
    .bind(next.as_db_str())
    .bind(&started_at)
    .bind(&completed_at)
    .bind(now)
    .bind(&row.uuid)
    .execute(&mut **tx)
    .await
    .map_err(ApiError::from)?;
    Ok(())
}

/// Marks an entry as touched at `now`, never moving its `updated_at` back
/// (a watch can carry an earlier date than the last edit).
async fn touch(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    uuid: &str,
    now: &str,
) -> Result<(), ApiError> {
    sqlx::query("UPDATE library_items SET updated_at = $1 WHERE uuid = $2 AND updated_at < $1")
        .bind(now)
        .bind(uuid)
        .execute(&mut **tx)
        .await
        .map_err(ApiError::from)?;
    Ok(())
}

/// Brings a title into the library because it was watched, logging a
/// `LibraryAdd` history entry the way a manual add does.
async fn create_entry(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    pool: &SqlitePool,
    profile_id: &str,
    media: &AutoSyncMedia,
    status: LibraryStatus,
    now: &str,
) -> Result<String, ApiError> {
    let started_at = (status == LibraryStatus::Watching).then(|| now.to_string());
    let completed_at = (status == LibraryStatus::Completed).then(|| now.to_string());
    let uuid = new_uuid();

    sqlx::query(
        "INSERT INTO library_items (
          uuid, profile_id, media_id, media_type, title, poster_path, backdrop_path, year, rating, genres,
          status, favourite, user_rating, notes, tags, started_at, completed_at, rewatch_count, created_at, updated_at,
          status_origin
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,NULL,NULL,$12,$13,$14,0,$15,$15,'auto')",
    )
    .bind(&uuid)
    .bind(profile_id)
    .bind(media.media_id)
    .bind(media.media_type.as_db_str())
    .bind(&media.title)
    .bind(&media.poster_path)
    .bind(&media.backdrop_path)
    .bind(media.year)
    .bind(media.rating)
    .bind(serde_json::to_string(&media.genres).unwrap())
    .bind(status.as_db_str())
    .bind("[]")
    .bind(&started_at)
    .bind(&completed_at)
    .bind(now)
    .execute(&mut **tx)
    .await
    .map_err(ApiError::from)?;

    let history_item = ViewingHistoryItem {
        id: new_uuid(),
        media_id: media.media_id,
        media_type: media.media_type,
        title: media.title.clone(),
        action: HistoryAction::LibraryAdd,
        timestamp: now.to_string(),
        season_number: None,
        episode_number: None,
        episode_title: None,
        metadata: Some(json!({ "profileId": profile_id })),
    };
    add_history_item_impl(&mut **tx, pool, history_item).await?;
    Ok(uuid)
}

/// Reconsiders a title's status after a viewing action, with the facts the
/// caller already holds. Creates the library entry when the title was
/// watched and is not in the library yet (watching is itself enough to bring
/// a title in). Returns the uuid of the entry it created, `None` otherwise —
/// which is how the TV Time import tells "this write brought the title into
/// the library" from "it was already there".
///
/// Must run inside the same transaction as the viewing write it follows.
pub(crate) async fn reconcile_status_impl(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    pool: &SqlitePool,
    profile_id: &str,
    media: &AutoSyncMedia,
    facts: &StatusFacts,
    trigger: StatusTrigger,
    now: &str,
) -> Result<Option<String>, ApiError> {
    let row = load_row(tx, profile_id, media.media_id, media.media_type).await?;
    let current = row.as_ref().map(current_of).transpose()?;
    match decide(current, facts, trigger) {
        StatusDecision::Keep => {
            // The viewer watched or un-watched something of this title: even
            // when its status did not move, the entry has been touched (the
            // undo of a TV Time import keeps what was touched after it).
            if let Some(row) = row.as_ref()
                && matches!(trigger, StatusTrigger::Watched | StatusTrigger::Unwatched)
            {
                touch(tx, &row.uuid, now).await?;
            }
            Ok(None)
        }
        StatusDecision::Create(status) => create_entry(tx, pool, profile_id, media, status, now)
            .await
            .map(Some),
        StatusDecision::Set(status) => {
            apply_set(tx, row.as_ref().expect("Set implies an entry"), status, now).await?;
            Ok(None)
        }
    }
}

/// Reconsiders a title's status from what the database stores alone: a TMDB
/// refresh, a sync that brought progress from another device, a reset. Never
/// creates an entry.
pub(crate) async fn reconcile_title_impl(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
    trigger: StatusTrigger,
    now: &str,
) -> Result<(), ApiError> {
    let Some(row) = load_row(tx, profile_id, media_id, media_type).await? else {
        return Ok(());
    };
    let facts = stored_facts(tx, profile_id, media_id, media_type).await?;
    if let StatusDecision::Set(status) = decide(Some(current_of(&row)?), &facts, trigger) {
        apply_set(tx, &row, status, now).await?;
    }
    Ok(())
}

/// "Automatic" in the library editor: the status follows the viewing again.
/// Returns whether an entry exists for the title.
pub(crate) async fn reset_status_to_auto_impl(
    pool: &SqlitePool,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
) -> Result<bool, ApiError> {
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(ApiError::from)?;
    let exists = load_row(&mut tx, profile_id, media_id, media_type)
        .await?
        .is_some();
    if exists {
        let now = now_iso(&mut *tx).await?;
        reconcile_title_impl(
            &mut tx,
            profile_id,
            media_id,
            media_type,
            StatusTrigger::Reset,
            &now,
        )
        .await?;
    }
    tx.commit().await.map_err(ApiError::from)?;
    Ok(exists)
}

/// A title is (re-)added to the library while the database already holds its
/// progress (episodes kept from an earlier stay in the library, a movie still
/// marked seen): its status follows that progress instead of starting at
/// Planned. A title with no progress is left as the Planned entry the viewer
/// asked for.
pub(crate) async fn adopt_existing_progress_impl(
    pool: &SqlitePool,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
) -> Result<(), ApiError> {
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(ApiError::from)?;
    let facts = stored_facts(&mut tx, profile_id, media_id, media_type).await?;
    if derived_status(&facts) != LibraryStatus::Planned {
        let now = now_iso(&mut *tx).await?;
        reconcile_title_impl(
            &mut tx,
            profile_id,
            media_id,
            media_type,
            StatusTrigger::Reset,
            &now,
        )
        .await?;
    }
    tx.commit().await.map_err(ApiError::from)
}

/// Test shorthand for "a viewing moved this title to `target`": `Completed`
/// stands for a seen movie, anything else for a series with one episode
/// watched (total unknown, so it can start but never complete).
#[cfg(test)]
pub(crate) async fn auto_sync_status_impl(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    pool: &SqlitePool,
    profile_id: &str,
    target: LibraryStatus,
    now: &str,
    media: &AutoSyncMedia,
) -> Result<Option<String>, ApiError> {
    let facts = if target == LibraryStatus::Completed {
        StatusFacts::Movie { seen: true }
    } else {
        StatusFacts::Series {
            watched_episodes: 1,
            total_episodes: None,
            series_status: None,
        }
    };
    reconcile_status_impl(
        tx,
        pool,
        profile_id,
        media,
        &facts,
        StatusTrigger::Watched,
        now,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use LibraryStatus::{Completed, Dropped, Paused, Planned, Watching};
    use LibraryStatusOrigin::{Auto, Manual};
    use StatusTrigger::{Refreshed, Reset, Unwatched, Watched};

    const STATUSES: [LibraryStatus; 5] = [Planned, Watching, Paused, Completed, Dropped];
    const ORIGINS: [LibraryStatusOrigin; 2] = [Auto, Manual];
    const TRIGGERS: [StatusTrigger; 4] = [Watched, Unwatched, Refreshed, Reset];

    fn series(watched: i64, total: Option<i64>, status: Option<&str>) -> StatusFacts {
        StatusFacts::Series {
            watched_episodes: watched,
            total_episodes: total,
            series_status: status.map(str::to_string),
        }
    }

    fn cur(status: LibraryStatus, origin: LibraryStatusOrigin) -> Option<CurrentStatus> {
        Some(CurrentStatus { status, origin })
    }

    #[test]
    fn a_movie_is_completed_when_seen_and_planned_otherwise() {
        assert_eq!(
            derived_status(&StatusFacts::Movie { seen: true }),
            Completed
        );
        assert_eq!(derived_status(&StatusFacts::Movie { seen: false }), Planned);
    }

    #[test]
    fn a_series_derives_from_its_progress_and_whether_it_is_over() {
        assert_eq!(derived_status(&series(0, Some(10), Some("Ended"))), Planned);
        assert_eq!(
            derived_status(&series(1, Some(10), Some("Ended"))),
            Watching
        );
        assert_eq!(
            derived_status(&series(10, Some(10), Some("Ended"))),
            Completed
        );
        assert_eq!(
            derived_status(&series(10, Some(10), Some("Canceled"))),
            Completed
        );
        // More watched than the total (a stale total) still reads as finished.
        assert_eq!(
            derived_status(&series(12, Some(10), Some("Ended"))),
            Completed
        );
    }

    #[test]
    fn a_caught_up_series_that_is_still_airing_or_unknown_stays_watching() {
        for status in [
            Some("Returning Series"),
            Some("In Production"),
            Some("Planned"),
            None,
        ] {
            assert_eq!(derived_status(&series(10, Some(10), status)), Watching);
        }
    }

    #[test]
    fn an_unknown_total_never_completes_a_series() {
        for total in [None, Some(0)] {
            assert_eq!(derived_status(&series(5, total, Some("Ended"))), Watching);
        }
    }

    #[test]
    fn watching_brings_a_title_into_the_library_and_nothing_else_does() {
        let facts = series(1, Some(10), Some("Ended"));
        assert_eq!(
            decide(None, &facts, Watched),
            StatusDecision::Create(Watching)
        );
        assert_eq!(
            decide(None, &StatusFacts::Movie { seen: true }, Watched),
            StatusDecision::Create(Completed)
        );
        for trigger in [Unwatched, Refreshed, Reset] {
            assert_eq!(decide(None, &facts, trigger), StatusDecision::Keep);
        }
    }

    #[test]
    fn an_automatic_status_follows_the_facts_in_both_directions() {
        // Up: a series reaching its end.
        assert_eq!(
            decide(
                cur(Watching, Auto),
                &series(10, Some(10), Some("Ended")),
                Watched
            ),
            StatusDecision::Set(Completed)
        );
        // Down: an unwatch under the total reopens it.
        assert_eq!(
            decide(
                cur(Completed, Auto),
                &series(9, Some(10), Some("Ended")),
                Unwatched
            ),
            StatusDecision::Set(Watching)
        );
        // Down again: nothing watched any more.
        assert_eq!(
            decide(
                cur(Watching, Auto),
                &series(0, Some(10), Some("Ended")),
                Unwatched
            ),
            StatusDecision::Set(Planned)
        );
        // A movie taken back to not seen.
        assert_eq!(
            decide(
                cur(Completed, Auto),
                &StatusFacts::Movie { seen: false },
                Unwatched
            ),
            StatusDecision::Set(Planned)
        );
        // TMDB announces more episodes / the finale is reported.
        assert_eq!(
            decide(
                cur(Completed, Auto),
                &series(10, Some(12), Some("Returning Series")),
                Refreshed
            ),
            StatusDecision::Set(Watching)
        );
        assert_eq!(
            decide(
                cur(Watching, Auto),
                &series(10, Some(10), Some("Ended")),
                Refreshed
            ),
            StatusDecision::Set(Completed)
        );
    }

    #[test]
    fn a_manual_status_is_never_lowered_by_the_facts() {
        for status in STATUSES {
            for facts in [
                StatusFacts::Movie { seen: false },
                series(0, Some(10), Some("Ended")),
                series(3, Some(10), Some("Ended")),
            ] {
                for trigger in [Unwatched, Refreshed] {
                    assert_eq!(
                        decide(cur(status, Manual), &facts, trigger),
                        StatusDecision::Keep,
                        "{status:?} {facts:?} {trigger:?}"
                    );
                }
            }
        }
    }

    #[test]
    fn watching_resumes_a_paused_or_dropped_series() {
        for status in [Paused, Dropped] {
            assert_eq!(
                decide(
                    cur(status, Manual),
                    &series(3, Some(10), Some("Ended")),
                    Watched
                ),
                StatusDecision::Set(Watching)
            );
            // Finishing it while paused or dropped completes it.
            assert_eq!(
                decide(
                    cur(status, Manual),
                    &series(10, Some(10), Some("Ended")),
                    Watched
                ),
                StatusDecision::Set(Completed)
            );
            // A refresh alone is not a resume.
            assert_eq!(
                decide(
                    cur(status, Manual),
                    &series(10, Some(10), Some("Ended")),
                    Refreshed
                ),
                StatusDecision::Keep
            );
        }
    }

    #[test]
    fn watching_moves_a_manual_planned_or_watching_entry_forward_only() {
        assert_eq!(
            decide(
                cur(Planned, Manual),
                &series(1, Some(10), Some("Ended")),
                Watched
            ),
            StatusDecision::Set(Watching)
        );
        assert_eq!(
            decide(
                cur(Planned, Manual),
                &StatusFacts::Movie { seen: true },
                Watched
            ),
            StatusDecision::Set(Completed)
        );
        assert_eq!(
            decide(
                cur(Watching, Manual),
                &series(4, Some(10), Some("Ended")),
                Watched
            ),
            StatusDecision::Keep
        );
        assert_eq!(
            decide(
                cur(Watching, Manual),
                &series(10, Some(10), Some("Ended")),
                Watched
            ),
            StatusDecision::Set(Completed)
        );
        assert_eq!(
            decide(
                cur(Watching, Manual),
                &series(10, Some(10), Some("Ended")),
                Refreshed
            ),
            StatusDecision::Set(Completed)
        );
    }

    #[test]
    fn a_manual_completed_is_a_decision_nothing_but_a_reset_changes() {
        for facts in [
            series(2, Some(10), Some("Returning Series")),
            StatusFacts::Movie { seen: false },
        ] {
            for trigger in [Watched, Unwatched, Refreshed] {
                assert_eq!(
                    decide(cur(Completed, Manual), &facts, trigger),
                    StatusDecision::Keep
                );
            }
        }
        assert_eq!(
            decide(
                cur(Completed, Manual),
                &series(2, Some(10), Some("Ended")),
                Reset
            ),
            StatusDecision::Set(Watching)
        );
    }

    #[test]
    fn a_reset_sets_the_derived_status_and_flips_the_origin_even_when_it_matches() {
        let facts = series(3, Some(10), Some("Ended"));
        for status in STATUSES {
            let decision = decide(cur(status, Manual), &facts, Reset);
            assert_eq!(decision, StatusDecision::Set(Watching), "{status:?}");
        }
        // Already automatic and already right: nothing to write.
        assert_eq!(
            decide(cur(Watching, Auto), &facts, Reset),
            StatusDecision::Keep
        );
    }

    /// Whatever the starting point and the trigger, deciding twice in a row
    /// with the same facts changes nothing the second time: a retried or
    /// doubled call can never move a status again.
    #[test]
    fn deciding_is_idempotent() {
        let all_facts = [
            StatusFacts::Movie { seen: true },
            StatusFacts::Movie { seen: false },
            series(0, Some(10), Some("Ended")),
            series(4, Some(10), Some("Ended")),
            series(10, Some(10), Some("Ended")),
            series(10, Some(10), Some("Returning Series")),
            series(4, None, None),
        ];
        for status in STATUSES {
            for origin in ORIGINS {
                for facts in &all_facts {
                    for trigger in TRIGGERS {
                        let after = match decide(cur(status, origin), facts, trigger) {
                            StatusDecision::Keep => CurrentStatus { status, origin },
                            StatusDecision::Set(next) | StatusDecision::Create(next) => {
                                CurrentStatus {
                                    status: next,
                                    origin: Auto,
                                }
                            }
                        };
                        assert_eq!(
                            decide(Some(after), facts, trigger),
                            StatusDecision::Keep,
                            "{status:?}/{origin:?} {facts:?} {trigger:?}"
                        );
                    }
                }
            }
        }
    }
}
