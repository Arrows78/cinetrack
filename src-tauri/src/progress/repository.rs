use std::collections::HashSet;

use serde_json::json;
use sqlx::SqlitePool;

use super::domain::{known_runtime, regular_episodes_watched};
use super::models::{EpisodeHistoryInput, EpisodeInput, MovieInput, SeriesInput};
use super::queries::is_movie_seen_impl;
#[cfg(test)]
use super::queries::{get_episode_progress_impl, list_tracked_series_impl};
use crate::database::{canonical_instant, new_uuid, now_iso};
use crate::error::ApiError;
use crate::history::{HistoryAction, MediaSnapshot, ViewingHistoryItem, add_history_item_impl};
use crate::library::{
    AutoSyncMedia, StatusTrigger, cancel_series_rewatches_if_unseen, insert_rewatch_event,
    reconcile_status_impl, reconcile_title_impl,
};
use crate::models::MediaType;
use crate::stats::{NewViewingEvent, ViewingEventType, insert_viewing_event};

/// Thin wrapper over `toggle_movie_seen_with_note_impl` for callers (the
/// existing test suite below, mainly) that never attach a per-watch note —
/// mirrors `apply_episodes_impl`'s relationship to
/// `apply_episodes_and_log_impl` just below. `#[cfg(test)]` because, unlike
/// `apply_episodes_impl` (also used by tvtime's importer), nothing outside
/// this file's own tests calls it anymore now that the `toggle_movie_seen`
/// command calls `toggle_movie_seen_with_note_impl` directly.
#[cfg(test)]
pub(crate) async fn toggle_movie_seen_impl(
    pool: &SqlitePool,
    profile_id: &str,
    movie: MovieInput,
    watched: bool,
    watched_at: &str,
) -> Result<(), ApiError> {
    toggle_movie_seen_with_note_impl(pool, profile_id, movie, watched, watched_at, None).await
}

/// Unlike `apply_episodes_impl` below, this always logs the history entry
/// itself, in the same transaction as the seen-flag/viewing-event writes.
///
/// `note` is only ever persisted when `watched` is true — write-once, at
/// the moment the watch is logged, with no way to edit it afterward. A
/// caller that passes a note while unwatching has it silently ignored
/// rather than stored against an "unwatched" event, which would never be
/// shown anywhere.
pub(crate) async fn toggle_movie_seen_with_note_impl(
    pool: &SqlitePool,
    profile_id: &str,
    movie: MovieInput,
    watched: bool,
    watched_at: &str,
    note: Option<String>,
) -> Result<(), ApiError> {
    // An unreadable date in the log would make every statistic fail, and one
    // in another shape would sort wrongly as a string: store the canonical form.
    let watched_at = canonical_instant(watched_at)?;
    let watched_at = watched_at.as_str();
    // BEGIN IMMEDIATE (rather than plain pool.begin()'s deferred BEGIN)
    // acquires SQLite's write lock up front, before the idempotency check
    // below even runs — a concurrent second call blocks here (the pool's
    // busy_timeout, BUSY_TIMEOUT in database/mod.rs) until the first call's
    // transaction commits, instead of both reading "not yet watched" off their
    // own snapshot and both proceeding to insert a viewing_events/activity_log
    // row. Reading the current state *outside* a transaction (or inside a
    // merely deferred one) doesn't protect against that: two concurrent callers
    // can each get their own consistent read before either takes the write
    // lock, so the check has to be inside the same IMMEDIATE transaction as the
    // write it's guarding.
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(ApiError::from)?;

    // No-op if the movie is already in the requested state — mirrors the
    // guard `apply_episodes_and_log_impl` has for episodes, so a repeated
    // call (retry, double invoke, or a genuine race now serialized by the
    // IMMEDIATE lock above) can't insert a second viewing_events/
    // activity_log row and inflate the stats that read them.
    if is_movie_seen_impl(&mut *tx, profile_id, movie.id).await? == watched {
        return Ok(());
    }

    // See this function's doc comment: a note only ever attaches to a
    // "watched" event.
    let event_note = if watched { note.as_deref() } else { None };

    if watched {
        sqlx::query(
            "INSERT INTO seen_movies (uuid, profile_id, movie_id, title, poster_path, backdrop_path, watched_at, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$7)
             ON CONFLICT (profile_id, movie_id) DO UPDATE SET
               title = excluded.title,
               poster_path = excluded.poster_path,
               backdrop_path = excluded.backdrop_path,
               watched_at = excluded.watched_at,
               updated_at = excluded.updated_at",
        )
        .bind(new_uuid())
        .bind(profile_id)
        .bind(movie.id)
        .bind(&movie.title)
        .bind(&movie.poster_path)
        .bind(&movie.backdrop_path)
        .bind(watched_at)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;
    } else {
        sqlx::query("DELETE FROM seen_movies WHERE profile_id = $1 AND movie_id = $2")
            .bind(profile_id)
            .bind(movie.id)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from)?;
        // Unwatching cancels the rewatches logged so far (the statistics
        // drop them, see stats/queries/active_events.rs), so the library
        // editor's rewatch count starts over from 0 with the next watch.
        sqlx::query(
            "UPDATE library_items SET rewatch_count = 0, updated_at = MAX(updated_at, $3)
             WHERE profile_id = $1 AND media_id = $2 AND media_type = 'movie' AND rewatch_count > 0",
        )
        .bind(profile_id)
        .bind(movie.id)
        .bind(watched_at)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;
    }

    insert_viewing_event(
        &mut tx,
        &NewViewingEvent {
            profile_id,
            media_id: movie.id,
            media_type: MediaType::Movie,
            title: &movie.title,
            event_type: if watched {
                ViewingEventType::Watched
            } else {
                ViewingEventType::Unwatched
            },
            watched_at,
            duration_minutes: known_runtime(movie.runtime),
            episode_id: None,
            season_number: None,
            episode_number: None,
            note: event_note,
        },
    )
    .await?;

    let history_item = ViewingHistoryItem {
        id: new_uuid(),
        media_id: movie.id,
        media_type: MediaType::Movie,
        title: movie.title.clone(),
        action: if watched {
            HistoryAction::MovieWatched
        } else {
            HistoryAction::MovieUnwatched
        },
        timestamp: watched_at.to_string(),
        season_number: None,
        episode_number: None,
        episode_title: None,
        // `note` rides along in the free-form metadata bag rather than as a
        // dedicated ViewingHistoryItem field — that struct is also
        // constructed (without a note) by library's and backup's own
        // repositories, and giving it a new required field would force
        // edits there too, for event kinds that never carry one.
        // `media` lets the History screen undo this entry without TMDB.
        metadata: Some(json!({
            "profileId": profile_id,
            "note": event_note,
            "media": MediaSnapshot {
                title: &movie.title,
                poster_path: movie.poster_path.as_deref(),
                backdrop_path: movie.backdrop_path.as_deref(),
                runtime: movie.runtime,
                year: movie.year,
                rating: movie.rating,
                genres: json!(movie.genres),
            }
            .to_value(),
        })),
    };
    add_history_item_impl(&mut *tx, pool, history_item).await?;

    // The library status follows the viewing (see library/status.rs): a movie
    // seen is Completed, a movie taken back to not seen goes back to Planned
    // unless the viewer set the status by hand.
    let media = AutoSyncMedia {
        media_id: movie.id,
        media_type: MediaType::Movie,
        title: movie.title.clone(),
        poster_path: movie.poster_path.clone(),
        backdrop_path: movie.backdrop_path.clone(),
        year: movie.year,
        rating: movie.rating,
        genres: movie.genres.clone(),
    };
    reconcile_status_impl(
        &mut tx,
        pool,
        profile_id,
        &media,
        if watched {
            StatusTrigger::Watched
        } else {
            StatusTrigger::Unwatched
        },
        watched_at,
    )
    .await?;

    tx.commit().await.map_err(ApiError::from)?;
    Ok(())
}

/// Two rewatches of one film closer than this are one viewing logged twice (a
/// double click stamps two different milliseconds, so the exact date alone
/// cannot tell them apart): the second is a no-op.
const REWATCH_DEDUPE_SECONDS: i64 = 60;

/// Watches an already-seen movie again: logs one `rewatched` viewing event
/// and moves the library editor's rewatch count up by one, in one
/// transaction. The movie stays one watch in every statistic (a rewatch only
/// feeds the rewatch statistics, see `library::rewatch_events`) and no
/// history row is written (the history has no rewatch action to undo).
///
/// A movie that is not currently seen cannot be rewatched: that is a
/// conflict, nothing is written. Repeating the very same call (same
/// `watched_at` — a retry, a double invocation) is a no-op, like every other
/// event-writing command here; a new viewing carries a new timestamp.
pub(crate) async fn rewatch_movie_impl(
    pool: &SqlitePool,
    profile_id: &str,
    movie: MovieInput,
    watched_at: &str,
    note: Option<String>,
) -> Result<(), ApiError> {
    let watched_at = canonical_instant(watched_at)?;
    let watched_at = watched_at.as_str();
    // Same reason as toggle_movie_seen_with_note_impl: the seen check and the
    // duplicate check have to sit under the write lock of the write they guard.
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(ApiError::from)?;

    if !is_movie_seen_impl(&mut *tx, profile_id, movie.id).await? {
        return Err(ApiError::conflict(
            "A movie that is not marked as seen cannot be rewatched",
        ));
    }

    let already_logged: bool = sqlx::query_scalar(
        "SELECT EXISTS(
           SELECT 1 FROM viewing_events
           WHERE profile_id = $1 AND media_id = $2 AND media_type = 'movie'
             AND event_type = 'rewatched'
             AND ABS(strftime('%s', watched_at) - strftime('%s', $3)) < $4
         )",
    )
    .bind(profile_id)
    .bind(movie.id)
    .bind(watched_at)
    .bind(REWATCH_DEDUPE_SECONDS)
    .fetch_one(&mut *tx)
    .await
    .map_err(ApiError::from)?;
    if already_logged {
        return Ok(());
    }

    insert_rewatch_event(
        &mut tx,
        profile_id,
        movie.id,
        MediaType::Movie,
        &movie.title,
        known_runtime(movie.runtime),
        watched_at,
        note.as_deref(),
    )
    .await?;

    sqlx::query(
        "UPDATE library_items SET rewatch_count = rewatch_count + 1, updated_at = MAX(updated_at, $3)
         WHERE profile_id = $1 AND media_id = $2 AND media_type = 'movie'",
    )
    .bind(profile_id)
    .bind(movie.id)
    .bind(watched_at)
    .execute(&mut *tx)
    .await
    .map_err(ApiError::from)?;

    tx.commit().await.map_err(ApiError::from)?;
    Ok(())
}

/// What history entry (if any) to log alongside an episode/season/series
/// toggle — supplied by the caller since only it knows which of the three
/// interactive actions this is; `apply_episodes_and_log_impl` fills in
/// media_id/title/metadata and writes it in the same transaction as the
/// toggle itself, so a crash between the two can no longer happen.
/// Applies a watched/unwatched change to a set of episodes: writes only the
/// episodes whose state actually changes, records a matching viewing_events
/// row for each, refreshes the tracked_series rollup
/// (`total_episodes` = TMDB's count, 0 when unknown), and — when
/// `history` is given and at least one episode changed — logs that history
/// entry in the same transaction. Returns the number of episodes that
/// changed. `pub(crate)` so tvtime's importer can reuse the same
/// upsert/rollup logic (passing `history: None`, since it logs nothing).
///
/// `note` is written once, at log time, onto every changed episode's
/// viewing_events row (never onto an "unwatched" one — see
/// `toggle_movie_seen_with_note_impl`'s doc comment for the same rule
/// applied to movies). In practice only the single-episode toggle path ever
/// passes one; a season/series bulk mark always passes `None`, so this
/// never silently stamps the same note across many episodes at once.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn apply_episodes_and_log_impl(
    pool: &SqlitePool,
    profile_id: &str,
    series: &SeriesInput,
    episodes: &[EpisodeInput],
    watched: bool,
    watched_at: &str,
    history: Option<EpisodeHistoryInput>,
    note: Option<String>,
) -> Result<i64, ApiError> {
    Ok(apply_episodes_outcome_impl(
        pool, profile_id, series, episodes, watched, watched_at, history, note,
    )
    .await?
    .changed)
}

/// What `apply_episodes_outcome_impl` did: how many episodes changed state,
/// and the uuid of the library entry the write created (auto-sync brings a
/// series into the library on its first watched episode), if any.
#[derive(Debug, Default)]
pub(crate) struct EpisodesOutcome {
    pub(crate) changed: i64,
    /// The episodes that changed state, in the order they were given.
    pub(crate) changed_episode_ids: Vec<i64>,
    pub(crate) created_library_item_id: Option<String>,
}

/// The body of `apply_episodes_and_log_impl`, for the one caller (tvtime's
/// importer) that also needs to know whether the library entry is new.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn apply_episodes_outcome_impl(
    pool: &SqlitePool,
    profile_id: &str,
    series: &SeriesInput,
    episodes: &[EpisodeInput],
    watched: bool,
    watched_at: &str,
    history: Option<EpisodeHistoryInput>,
    note: Option<String>,
) -> Result<EpisodesOutcome, ApiError> {
    let watched_at = canonical_instant(watched_at)?;
    let watched_at = watched_at.as_str();
    // Per-episode dates are validated up front and stored canonical too.
    let mut episode_dates: std::collections::HashMap<i64, String> =
        std::collections::HashMap::new();
    for episode in episodes {
        if let Some(own_date) = episode.watched_at.as_deref() {
            let canonical = canonical_instant(own_date)?;
            episode_dates.entry(episode.id).or_insert(canonical);
        }
    }
    // BEGIN IMMEDIATE up front, before reading which episodes are already
    // watched, for the same reason toggle_movie_seen_impl does: a plain
    // pool.begin() (deferred) or a read taken outside any transaction lets
    // two concurrent calls each see their own "not yet watched" snapshot
    // before either takes the write lock, so both would insert their own
    // viewing_events/activity_log rows for what's really one logical
    // transition. The IMMEDIATE lock serializes the check-then-write pair
    // instead — a concurrent second call blocks here until the first
    // commits, then correctly sees the already-applied state.
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(ApiError::from)?;

    let watched_rows: Vec<(i64,)> =
        sqlx::query_as("SELECT episode_id FROM episode_progress WHERE profile_id = $1 AND series_id = $2 AND watched = 1")
            .bind(profile_id)
            .bind(series.id)
            .fetch_all(&mut *tx)
            .await
            .map_err(ApiError::from)?;
    let watched_ids: HashSet<i64> = watched_rows.into_iter().map(|(id,)| id).collect();

    // An episode listed twice in one call changes state once: the second
    // copy would otherwise log a second viewing event for one watch.
    let mut listed = HashSet::new();
    let changed_episodes: Vec<&EpisodeInput> = episodes
        .iter()
        .filter(|episode| {
            if watched {
                !watched_ids.contains(&episode.id)
            } else {
                watched_ids.contains(&episode.id)
            }
        })
        .filter(|episode| listed.insert(episode.id))
        .collect();

    if changed_episodes.is_empty() {
        return Ok(EpisodesOutcome::default());
    }

    // Same rule as toggle_movie_seen_with_note_impl: a note only ever
    // attaches to a "watched" event.
    let event_note = if watched { note.as_deref() } else { None };

    for episode in &changed_episodes {
        let episode_watched_at = episode_dates
            .get(&episode.id)
            .map_or(watched_at, String::as_str);
        if watched {
            sqlx::query(
                "INSERT INTO episode_progress (uuid, profile_id, series_id, episode_id, season_number, episode_number, watched, watched_at, created_at, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,1,$7,$7,$7)
                 ON CONFLICT (profile_id, series_id, episode_id) DO UPDATE SET
                   watched = 1,
                   watched_at = excluded.watched_at,
                   updated_at = excluded.updated_at",
            )
            .bind(new_uuid())
            .bind(profile_id)
            .bind(series.id)
            .bind(episode.id)
            .bind(episode.season_number)
            .bind(episode.episode_number)
            .bind(episode_watched_at)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from)?;
        } else {
            // A rating is the viewer's own data: unwatching an episode keeps the
            // row (as not watched) when it carries one, so marking it watched
            // again does not lose the rating. A row without a rating has
            // nothing left to keep.
            let unwatched_at = now_iso(&mut *tx).await?;
            sqlx::query(
                "UPDATE episode_progress SET watched = 0, watched_at = NULL, updated_at = $4
                 WHERE profile_id = $1 AND series_id = $2 AND episode_id = $3 AND rating IS NOT NULL",
            )
            .bind(profile_id)
            .bind(series.id)
            .bind(episode.id)
            .bind(&unwatched_at)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from)?;
            sqlx::query("DELETE FROM episode_progress WHERE profile_id = $1 AND series_id = $2 AND episode_id = $3 AND rating IS NULL")
                .bind(profile_id)
                .bind(series.id)
                .bind(episode.id)
                .execute(&mut *tx)
                .await
                .map_err(ApiError::from)?;
        }

        insert_viewing_event(
            &mut tx,
            &NewViewingEvent {
                profile_id,
                media_id: series.id,
                media_type: MediaType::Series,
                title: &series.title,
                event_type: if watched {
                    ViewingEventType::Watched
                } else {
                    ViewingEventType::Unwatched
                },
                watched_at: episode_watched_at,
                duration_minutes: known_runtime(episode.runtime).or(known_runtime(series.runtime)),
                episode_id: Some(episode.id),
                season_number: Some(episode.season_number),
                episode_number: Some(episode.episode_number),
                note: event_note,
            },
        )
        .await?;
    }

    // Unwatching the last watched episode leaves nothing to have rewatched.
    if !watched {
        cancel_series_rewatches_if_unseen(&mut tx, profile_id, series.id, watched_at).await?;
    }

    // `tracked_series` caches TMDB's word on the series: its episode count
    // (0 when TMDB never gave one: "unknown" is kept apart from "as many as
    // watched", so no refresh or sync can take a guess for the length of the
    // series) and its status. A count this call holds replaces the cached one
    // — TMDB's latest answer, never below what is already watched, so a
    // progress bar cannot pass 100% — and a call without one leaves it. The
    // library status below is decided from this very row, so a watch and a
    // later refresh can never read two different totals. Readers that
    // display a total take the larger of it and the watched count
    // (`list_tracked_series_impl`).
    const WATCHED_REGULAR: &str = concat!(
        "(SELECT COUNT(*) FROM episode_progress
              WHERE profile_id = $2 AND series_id = $3 AND ",
        regular_episodes_watched!(),
        ")"
    );
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "INSERT INTO tracked_series (uuid, profile_id, series_id, title, poster_path, backdrop_path, total_episodes, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $7 > 0 THEN MAX($7, {WATCHED_REGULAR}) ELSE 0 END, $8,$9,$9)
         ON CONFLICT (profile_id, series_id) DO UPDATE SET
           title = excluded.title,
           poster_path = excluded.poster_path,
           backdrop_path = excluded.backdrop_path,
           total_episodes = CASE WHEN $7 > 0 THEN MAX($7, {WATCHED_REGULAR}) ELSE tracked_series.total_episodes END,
           status = COALESCE(excluded.status, tracked_series.status),
           updated_at = MAX(tracked_series.updated_at, excluded.updated_at)"
    )))
    .bind(new_uuid())
    .bind(profile_id)
    .bind(series.id)
    .bind(&series.title)
    .bind(&series.poster_path)
    .bind(&series.backdrop_path)
    .bind(series.number_of_episodes)
    .bind(&series.status)
    .bind(watched_at)
    .execute(&mut *tx)
    .await
    .map_err(ApiError::from)?;

    // The library status follows the viewing, in both directions (see
    // library/status.rs and docs/library-status.md): the first episode starts
    // a series, the last one of a finished series completes it, un-marking
    // one takes an automatic status back down. A status the viewer chose by
    // hand is left alone, except that watching resumes a paused or dropped
    // series.
    let media = AutoSyncMedia {
        media_id: series.id,
        media_type: MediaType::Series,
        title: series.title.clone(),
        poster_path: series.poster_path.clone(),
        backdrop_path: series.backdrop_path.clone(),
        year: series.year,
        rating: series.rating,
        genres: series.genres.clone(),
    };
    let created_library_item_id = reconcile_status_impl(
        &mut tx,
        pool,
        profile_id,
        &media,
        if watched {
            StatusTrigger::Watched
        } else {
            StatusTrigger::Unwatched
        },
        watched_at,
    )
    .await?;

    if let Some(history) = history {
        let item = ViewingHistoryItem {
            id: new_uuid(),
            media_id: series.id,
            media_type: MediaType::Series,
            title: series.title.clone(),
            action: history.action,
            timestamp: watched_at.to_string(),
            season_number: history.season_number,
            episode_number: history.episode_number,
            episode_title: history.episode_title,
            // See toggle_movie_seen_with_note_impl's history_item comment:
            // `note` rides in metadata rather than as a dedicated field so
            // library's and backup's own ViewingHistoryItem literals (for
            // history rows that never carry one) don't need touching.
            metadata: Some(
                json!({ "profileId": profile_id, "episodeCount": changed_episodes.len(), "note": event_note }),
            ),
        };
        add_history_item_impl(&mut *tx, pool, item).await?;
    }

    tx.commit().await.map_err(ApiError::from)?;
    Ok(EpisodesOutcome {
        changed: changed_episodes.len() as i64,
        changed_episode_ids: changed_episodes.iter().map(|episode| episode.id).collect(),
        created_library_item_id,
    })
}

/// Thin wrapper over `apply_episodes_and_log_impl` for callers that never
/// log history (the existing test suite below; tvtime's importer calls
/// `apply_episodes_outcome_impl` directly, which also reports a created
/// library entry).
#[cfg(test)]
pub(crate) async fn apply_episodes_impl(
    pool: &SqlitePool,
    profile_id: &str,
    series: &SeriesInput,
    episodes: &[EpisodeInput],
    watched: bool,
    watched_at: &str,
) -> Result<i64, ApiError> {
    apply_episodes_and_log_impl(
        pool, profile_id, series, episodes, watched, watched_at, None, None,
    )
    .await
}

// tracked_series.status/total_episodes are caches, written only as a side
// effect of toggling an episode (see apply_episodes_and_log_impl's
// COALESCE/MAX upsert above) — a show nobody re-toggles after it airs its
// finale (status) or after TMDB announces more episodes (total_episodes,
// which that upsert only ever ratchets up, on the assumption a smaller
// value there is an incomplete toggle-time snapshot, not a correction)
// keeps whatever it had at the last toggle, which is why the progress-bar
// color and the card's episode count can both look "wrong" next to what the
// series' own detail page shows. That page always has TMDB's current
// status and announced episode count in hand (a fresh fetch, not cached
// locally), so it opportunistically writes both back here — a no-op if the
// series isn't tracked yet, or if neither value actually changed.
// The Today Hub also calls it, with a lower-bound total, for a show it just
// found an aired unwatched episode for, so the cache doesn't wait on a visit.
// total_episodes is a plain overwrite (not MAX) here: unlike a toggle's
// snapshot, this comes from TMDB's full total, so a smaller value is a real
// catalogue correction, not an aired-only progress denominator.
pub(super) async fn refresh_tracked_series_status_impl(
    pool: &SqlitePool,
    profile_id: &str,
    series_id: i64,
    status: Option<String>,
    total_episodes: Option<i64>,
) -> Result<(), ApiError> {
    // One IMMEDIATE transaction for the cache write and the status
    // reconsideration that follows it, so the status is always derived from
    // the cache it was just written next to.
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(ApiError::from)?;
    let current: Option<(Option<String>, i64)> = sqlx::query_as(
        "SELECT status, total_episodes FROM tracked_series WHERE profile_id = $1 AND series_id = $2",
    )
    .bind(profile_id)
    .bind(series_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(ApiError::from)?;

    let Some((current_status, current_total_episodes)) = current else {
        return Ok(());
    };
    // A total can never be below what is already watched: a smaller value
    // means TMDB answered with incomplete season data (a season with no
    // episodes), not that watched episodes disappeared.
    let watched_regular: i64 = sqlx::query_scalar(concat!(
        "SELECT COUNT(*) FROM episode_progress
         WHERE profile_id = $1 AND series_id = $2 AND ",
        regular_episodes_watched!()
    ))
    .bind(profile_id)
    .bind(series_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(ApiError::from)?;
    // A total of 0 is "TMDB (or the seasons it listed) gave no count": it
    // leaves the cache as it was instead of pretending the series is exactly
    // as long as what has been watched.
    let next_total_episodes = total_episodes
        .filter(|total| *total > 0)
        .map(|total| total.max(watched_regular))
        .unwrap_or(current_total_episodes);
    // A refresh that carries no status (TMDB gave none) keeps the one cached.
    let status = status.or_else(|| current_status.clone());
    if current_status != status || current_total_episodes != next_total_episodes {
        sqlx::query(
            "UPDATE tracked_series SET status = $1, total_episodes = $2 WHERE profile_id = $3 AND series_id = $4",
        )
        .bind(&status)
        .bind(next_total_episodes)
        .bind(profile_id)
        .bind(series_id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;
    }

    // The cache is TMDB's current word on how long the series is and whether
    // it is over, so the library status is reconsidered against it: an
    // automatic Completed is reopened when more episodes were announced, an
    // automatic Watching completes once the finale is reported and every
    // episode is watched, and a status the viewer chose is left alone (apart
    // from a manual Watching completing on its own). Re-checked even when the
    // cache was already up to date: it is a no-op when nothing changes.
    let now = now_iso(&mut *tx).await?;
    reconcile_title_impl(
        &mut tx,
        profile_id,
        series_id,
        MediaType::Series,
        StatusTrigger::Refreshed,
        &now,
    )
    .await?;
    tx.commit().await.map_err(ApiError::from)
}

/// Rating (1-5) on an already-watched episode — plain UPDATE, no upsert:
/// rating a never-watched episode is a no-op (0 rows affected), same
/// "unreachable in practice" shape as other guards in this file, since the
/// frontend only shows the rating control once an episode is marked
/// watched. The AFTER UPDATE sync trigger includes `rating` in the outbox
/// payload (migration 021), so the value travels with the rest of the
/// episode row.
pub(crate) async fn set_episode_rating_impl(
    pool: &SqlitePool,
    profile_id: &str,
    series_id: i64,
    episode_id: i64,
    rating: Option<i64>,
) -> Result<(), ApiError> {
    if let Some(value) = rating
        && !(1..=5).contains(&value)
    {
        return Err(ApiError::bad_request(format!(
            "Episode rating out of range: {value}"
        )));
    }
    sqlx::query(
        "UPDATE episode_progress SET rating = $1 WHERE profile_id = $2 AND series_id = $3 AND episode_id = $4",
    )
    .bind(rating)
    .bind(profile_id)
    .bind(series_id)
    .bind(episode_id)
    .execute(pool)
    .await
    .map_err(ApiError::from)?;
    Ok(())
}

#[cfg(test)]
mod tests;
