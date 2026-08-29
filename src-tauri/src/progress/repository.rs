use std::collections::HashSet;

use serde_json::json;
use sqlx::SqlitePool;

use super::domain::auto_sync_target;
use super::models::{EpisodeHistoryInput, EpisodeInput, MovieInput, SeriesInput};
use super::queries::is_movie_seen_impl;
#[cfg(test)]
use super::queries::{get_episode_progress_impl, list_tracked_series_impl};
use crate::commands::history::{HistoryAction, ViewingHistoryItem, add_history_item_impl};
use crate::database::new_uuid;
use crate::error::ApiError;
use crate::library::{AutoSyncMedia, LibraryStatus, auto_sync_status_impl};
use crate::models::MediaType;

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

/// Unlike `apply_episodes_impl` below, this logs the history entry inside
/// the same transaction as the seen-flag/viewing-event writes — matching
/// progress-store-sql.ts's `toggleMovieSeen`, which committed history
/// atomically for movies while episode-based actions logged it as a
/// separate step one level up in progress-repository.ts.
///
/// `note` is only ever persisted when `watched` is true — write-once, at
/// the moment the watch is logged (see migration 13's comment for why this
/// is a v1-simple decision rather than an editable-after-the-fact one). A
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
    // BEGIN IMMEDIATE (rather than plain pool.begin()'s deferred BEGIN)
    // acquires SQLite's write lock up front, before the idempotency check
    // below even runs — a concurrent second call blocks here (sqlx's
    // default 5s busy_timeout) until the first call's transaction commits,
    // instead of both reading "not yet watched" off their own snapshot and
    // both proceeding to insert a viewing_events/activity_log row. Reading
    // the current state *outside* a transaction (or inside a merely
    // deferred one) doesn't protect against that: two concurrent callers
    // can each get their own consistent read before either takes the write
    // lock, so the check has to be inside the same IMMEDIATE transaction as
    // the write it's guarding.
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
    }

    sqlx::query(
        "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, episode_id, season_number, episode_number, note, created_at)
         VALUES ($1,$2,$3,'movie',$4,$5,$6,$7,NULL,NULL,NULL,$8,$6)",
    )
    .bind(new_uuid())
    .bind(profile_id)
    .bind(movie.id)
    .bind(&movie.title)
    .bind(if watched { "watched" } else { "unwatched" })
    .bind(watched_at)
    .bind(movie.runtime)
    .bind(event_note)
    .execute(&mut *tx)
    .await
    .map_err(ApiError::from)?;

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
        // constructed (without a note) by library.rs and backup.rs, and
        // giving it a new required field would force edits there too, for
        // event kinds that never carry one. history-page.tsx / the history
        // repository pull it back out of metadata on the way in.
        metadata: Some(json!({ "profileId": profile_id, "note": event_note })),
    };
    add_history_item_impl(&mut *tx, pool, history_item).await?;

    if watched {
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
        auto_sync_status_impl(
            &mut tx,
            pool,
            profile_id,
            LibraryStatus::Completed,
            watched_at,
            &media,
        )
        .await?;
    }

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
/// (`total_episodes = series.numberOfEpisodes ?? watchedCount`), and — when
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

    let changed_episodes: Vec<&EpisodeInput> = episodes
        .iter()
        .filter(|episode| {
            if watched {
                !watched_ids.contains(&episode.id)
            } else {
                watched_ids.contains(&episode.id)
            }
        })
        .collect();

    if changed_episodes.is_empty() {
        return Ok(0);
    }

    // Same rule as toggle_movie_seen_with_note_impl: a note only ever
    // attaches to a "watched" event.
    let event_note = if watched { note.as_deref() } else { None };

    for episode in &changed_episodes {
        let episode_watched_at = episode.watched_at.as_deref().unwrap_or(watched_at);
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
            sqlx::query("DELETE FROM episode_progress WHERE profile_id = $1 AND series_id = $2 AND episode_id = $3")
                .bind(profile_id)
                .bind(series.id)
                .bind(episode.id)
                .execute(&mut *tx)
                .await
                .map_err(ApiError::from)?;
        }

        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, episode_id, season_number, episode_number, note, created_at)
             VALUES ($1,$2,$3,'series',$4,$5,$6,$7,$8,$9,$10,$11,$6)",
        )
        .bind(new_uuid())
        .bind(profile_id)
        .bind(series.id)
        .bind(&series.title)
        .bind(if watched { "watched" } else { "unwatched" })
        .bind(episode_watched_at)
        .bind(episode.runtime.or(series.runtime))
        .bind(episode.id)
        .bind(episode.season_number)
        .bind(episode.episode_number)
        .bind(event_note)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;
    }

    let count_row: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM episode_progress WHERE profile_id = $1 AND series_id = $2 AND watched = 1")
            .bind(profile_id)
            .bind(series.id)
            .fetch_one(&mut *tx)
            .await
            .map_err(ApiError::from)?;
    let watched_episodes = count_row.0;
    let total_episodes = series.number_of_episodes.unwrap_or(watched_episodes);

    sqlx::query(
        "INSERT INTO tracked_series (uuid, profile_id, series_id, title, poster_path, backdrop_path, total_episodes, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
         ON CONFLICT (profile_id, series_id) DO UPDATE SET
           title = excluded.title,
           poster_path = excluded.poster_path,
           backdrop_path = excluded.backdrop_path,
           total_episodes = excluded.total_episodes,
           status = COALESCE(excluded.status, tracked_series.status),
           updated_at = excluded.updated_at",
    )
    .bind(new_uuid())
    .bind(profile_id)
    .bind(series.id)
    .bind(&series.title)
    .bind(&series.poster_path)
    .bind(&series.backdrop_path)
    .bind(total_episodes)
    .bind(&series.status)
    .bind(watched_at)
    .execute(&mut *tx)
    .await
    .map_err(ApiError::from)?;

    // Auto-sync toward Watching/Completed only — never toward a "lower"
    // status (see auto_sync_status_impl's own doc comment for the full
    // rule) — and only on a watch, never an unwatch: this block recomputes
    // from the live watched-count regardless of which action triggered it,
    // so without this guard, un-marking one episode of an otherwise fully
    // (or partially) watched series could push an existing status *up*
    // (e.g. Planned -> Watching) purely as a side effect of removing
    // progress. Uses `series.number_of_episodes` directly (not the
    // `total_episodes` local, which falls back to `watched_episodes` for
    // the tracked_series rollup above) so a series with an unknown TMDB
    // episode count can still register as "Watching" but never falsely
    // "Completed" from a single episode.
    if watched {
        let auto_sync_target = auto_sync_target(watched_episodes, series.number_of_episodes);
        if let Some(target) = auto_sync_target {
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
            auto_sync_status_impl(&mut tx, pool, profile_id, target, watched_at, &media).await?;
        }
    }

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
            // library.rs/backup.rs's own ViewingHistoryItem literals (for
            // history rows that never carry one) don't need touching.
            metadata: Some(
                json!({ "profileId": profile_id, "episodeCount": changed_episodes.len(), "note": event_note }),
            ),
        };
        add_history_item_impl(&mut *tx, pool, item).await?;
    }

    tx.commit().await.map_err(ApiError::from)?;
    Ok(changed_episodes.len() as i64)
}

/// Thin wrapper over `apply_episodes_and_log_impl` for callers that never
/// log history (tvtime's importer, and the existing test suite below).
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

// tracked_series.status is a cache of TMDB's own production status,
// written only as a side effect of toggling an episode (see
// apply_episodes_and_log_impl's COALESCE upsert above) — a show nobody
// re-toggles after it airs its finale keeps whatever status it had months
// or years ago, which is why the progress-bar color can look "wrong" for a
// show that's visibly "Ended" on its own detail page. That page always has
// TMDB's current status in hand (a fresh fetch, not cached locally), so it
// opportunistically writes it back here — a no-op if the series isn't
// tracked yet, or if the status hasn't actually changed.
pub(super) async fn refresh_tracked_series_status_impl(
    pool: &SqlitePool,
    profile_id: &str,
    series_id: i64,
    status: Option<String>,
) -> Result<(), ApiError> {
    let current: Option<(Option<String>,)> = sqlx::query_as(
        "SELECT status FROM tracked_series WHERE profile_id = $1 AND series_id = $2",
    )
    .bind(profile_id)
    .bind(series_id)
    .fetch_optional(pool)
    .await
    .map_err(ApiError::from)?;

    let Some((current_status,)) = current else {
        return Ok(());
    };
    if current_status == status {
        return Ok(());
    }

    sqlx::query("UPDATE tracked_series SET status = $1 WHERE profile_id = $2 AND series_id = $3")
        .bind(&status)
        .bind(profile_id)
        .bind(series_id)
        .execute(pool)
        .await
        .map_err(ApiError::from)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use tauri::{Manager, State};

    use crate::progress::{
        get_episode_progress, is_movie_seen, list_tracked_series, toggle_episodes_watched,
        toggle_movie_seen,
    };

    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(4)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database::migrations::run_migrations(&pool)
            .await
            .unwrap();
        pool
    }

    fn movie(id: i64) -> MovieInput {
        MovieInput {
            id,
            title: "Test Movie".to_string(),
            poster_path: None,
            backdrop_path: None,
            runtime: Some(118),
            year: Some(2020),
            rating: Some(7.5),
            genres: vec!["Drama".to_string()],
        }
    }

    fn series(id: i64, number_of_episodes: Option<i64>) -> SeriesInput {
        SeriesInput {
            id,
            title: "Test Show".to_string(),
            poster_path: None,
            backdrop_path: None,
            runtime: None,
            number_of_episodes,
            year: Some(2019),
            rating: Some(8.0),
            genres: vec!["Drama".to_string()],
            status: None,
        }
    }

    fn episode(id: i64, episode_number: i64) -> EpisodeInput {
        EpisodeInput {
            id,
            season_number: 1,
            episode_number,
            runtime: None,
            watched_at: None,
        }
    }

    // Seeded directly with SQL rather than through library::upsert_impl
    // (private to that module) — these tests only care about the status
    // column an existing entry starts with and ends up at.
    async fn seed_library_status(pool: &SqlitePool, media_id: i64, media_type: &str, status: &str) {
        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at)
             VALUES ($1,'default',$2,$3,'Test',$4,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')",
        )
        .bind(new_uuid())
        .bind(media_id)
        .bind(media_type)
        .bind(status)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn library_status(pool: &SqlitePool, media_id: i64, media_type: &str) -> Option<String> {
        sqlx::query_scalar(
            "SELECT status FROM library_items WHERE media_id = $1 AND media_type = $2",
        )
        .bind(media_id)
        .bind(media_type)
        .fetch_optional(pool)
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn marking_a_movie_seen_auto_completes_an_existing_library_entry() {
        let pool = migrated_pool().await;
        seed_library_status(&pool, 55, "movie", "planned").await;

        toggle_movie_seen_impl(
            &pool,
            "default",
            movie(55),
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        assert_eq!(
            library_status(&pool, 55, "movie").await,
            Some("completed".to_string())
        );
    }

    #[tokio::test]
    async fn marking_a_movie_unseen_never_touches_the_library_status() {
        let pool = migrated_pool().await;
        seed_library_status(&pool, 55, "movie", "completed").await;

        toggle_movie_seen_impl(
            &pool,
            "default",
            movie(55),
            false,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        assert_eq!(
            library_status(&pool, 55, "movie").await,
            Some("completed".to_string())
        );
    }

    #[tokio::test]
    async fn marking_a_movie_seen_creates_a_library_entry_if_none_exists() {
        let pool = migrated_pool().await;

        toggle_movie_seen_impl(
            &pool,
            "default",
            movie(55),
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        assert_eq!(
            library_status(&pool, 55, "movie").await,
            Some("completed".to_string())
        );
    }

    #[tokio::test]
    async fn marking_a_movie_seen_with_a_note_stores_it_on_the_viewing_event_and_history() {
        let pool = migrated_pool().await;

        toggle_movie_seen_with_note_impl(
            &pool,
            "default",
            movie(55),
            true,
            "2026-01-01T00:00:00.000Z",
            Some("Loved the twist ending".to_string()),
        )
        .await
        .unwrap();

        let event_note: Option<String> =
            sqlx::query_scalar("SELECT note FROM viewing_events WHERE media_id = 55")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(event_note.as_deref(), Some("Loved the twist ending"));

        let metadata_raw: String =
            sqlx::query_scalar("SELECT metadata FROM activity_log WHERE media_id = 55")
                .fetch_one(&pool)
                .await
                .unwrap();
        let metadata: serde_json::Value = serde_json::from_str(&metadata_raw).unwrap();
        assert_eq!(metadata["note"], "Loved the twist ending");
    }

    #[tokio::test]
    async fn unwatching_a_movie_never_stores_a_note_even_if_one_is_passed() {
        let pool = migrated_pool().await;
        toggle_movie_seen_impl(
            &pool,
            "default",
            movie(55),
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        toggle_movie_seen_with_note_impl(
            &pool,
            "default",
            movie(55),
            false,
            "2026-01-02T00:00:00.000Z",
            Some("should be ignored".to_string()),
        )
        .await
        .unwrap();

        let event_note: Option<String> = sqlx::query_scalar(
            "SELECT note FROM viewing_events WHERE media_id = 55 AND event_type = 'unwatched'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(event_note, None);
    }

    #[tokio::test]
    async fn watching_the_first_episode_auto_sets_an_existing_library_entry_to_watching() {
        let pool = migrated_pool().await;
        seed_library_status(&pool, 9, "series", "planned").await;
        let s = series(9, Some(3));

        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(1, 1)],
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        assert_eq!(
            library_status(&pool, 9, "series").await,
            Some("watching".to_string())
        );
    }

    #[tokio::test]
    async fn finishing_every_episode_auto_completes_an_existing_library_entry() {
        let pool = migrated_pool().await;
        seed_library_status(&pool, 9, "series", "watching").await;
        let s = series(9, Some(2));

        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(1, 1), episode(2, 2)],
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        assert_eq!(
            library_status(&pool, 9, "series").await,
            Some("completed".to_string())
        );
    }

    #[tokio::test]
    async fn auto_sync_never_downgrades_a_manually_completed_series() {
        let pool = migrated_pool().await;
        seed_library_status(&pool, 9, "series", "completed").await;
        let s = series(9, Some(3));

        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(1, 1)],
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        assert_eq!(
            library_status(&pool, 9, "series").await,
            Some("completed".to_string())
        );
    }

    #[tokio::test]
    async fn watching_the_first_episode_with_no_prior_library_entry_creates_one_as_watching() {
        let pool = migrated_pool().await;
        let s = series(9, Some(3));

        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(1, 1)],
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        assert_eq!(
            library_status(&pool, 9, "series").await,
            Some("watching".to_string())
        );
    }

    #[tokio::test]
    async fn a_series_with_unknown_episode_count_never_auto_completes_from_watched_count_alone() {
        let pool = migrated_pool().await;
        // number_of_episodes: None — the old code coalesced this to
        // watched_episodes itself, so the very first episode watched read
        // as "100% complete". Confirms the fix: status advances to
        // Watching, never straight to Completed, regardless of how many
        // episodes get marked watched.
        let s = series(9, None);

        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(1, 1), episode(2, 2), episode(3, 3)],
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        assert_eq!(
            library_status(&pool, 9, "series").await,
            Some("watching".to_string())
        );
    }

    #[tokio::test]
    async fn a_series_reporting_zero_total_episodes_registers_as_watching_not_completed() {
        let pool = migrated_pool().await;
        // number_of_episodes: Some(0) — distinct from the `None` case above:
        // here the TMDB count is known but degenerate. `total > 0` must
        // still gate the Completed branch, or a single watched episode
        // would read as "0/0 = already done".
        let s = series(9, Some(0));

        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(1, 1)],
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        assert_eq!(
            library_status(&pool, 9, "series").await,
            Some("watching".to_string())
        );
    }

    #[tokio::test]
    async fn unwatching_an_episode_never_auto_advances_an_existing_planned_status() {
        let pool = migrated_pool().await;
        let s = series(9, Some(3));
        // Two episodes already watched via some independent path (seeded
        // directly, bypassing apply_episodes_impl so this doesn't itself
        // trigger an auto-sync) while the library entry is "planned".
        for episode_id in [1, 2] {
            sqlx::query(
                "INSERT INTO episode_progress (uuid, profile_id, series_id, episode_id, season_number, episode_number, watched, watched_at, created_at, updated_at)
                 VALUES ($1, 'default', 9, $2, 1, $2, 1, 'now', 'now', 'now')",
            )
            .bind(new_uuid())
            .bind(episode_id)
            .execute(&pool)
            .await
            .unwrap();
        }
        seed_library_status(&pool, 9, "series", "planned").await;

        // Unwatching one episode still leaves one watched — under the old
        // unconditional auto-sync this recomputed target=Watching (rank 1 >
        // Planned's rank 0) and silently advanced the status from an
        // unwatch action. It must now stay untouched.
        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(1, 1)],
            false,
            "2026-01-01T00:00:01.000Z",
        )
        .await
        .unwrap();

        assert_eq!(
            library_status(&pool, 9, "series").await,
            Some("planned".to_string())
        );
    }

    #[tokio::test]
    async fn unwatching_episodes_never_downgrades_a_completed_library_entry() {
        let pool = migrated_pool().await;
        let s = series(9, Some(2));
        // Watching both episodes auto-creates the library entry as
        // "completed" (2/2 watched) — no separate seeding needed.
        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(1, 1), episode(2, 2)],
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();
        assert_eq!(
            library_status(&pool, 9, "series").await,
            Some("completed".to_string())
        );

        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(1, 1)],
            false,
            "2026-01-01T00:00:01.000Z",
        )
        .await
        .unwrap();

        assert_eq!(
            library_status(&pool, 9, "series").await,
            Some("completed".to_string())
        );
    }

    #[tokio::test]
    async fn toggles_a_movie_seen_through_a_real_insert_delete_round_trip() {
        let pool = migrated_pool().await;

        toggle_movie_seen_impl(
            &pool,
            "default",
            movie(55),
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();
        assert!(is_movie_seen_impl(&pool, "default", 55).await.unwrap());

        let rows: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM seen_movies WHERE movie_id = 55")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(rows.0, 1);

        toggle_movie_seen_impl(
            &pool,
            "default",
            movie(55),
            false,
            "2026-01-01T00:00:01.000Z",
        )
        .await
        .unwrap();
        assert!(!is_movie_seen_impl(&pool, "default", 55).await.unwrap());
        let rows: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM seen_movies WHERE movie_id = 55")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(rows.0, 0);
    }

    #[tokio::test]
    async fn records_a_viewing_event_and_history_entry_alongside_the_seen_toggle() {
        let pool = migrated_pool().await;
        toggle_movie_seen_impl(
            &pool,
            "default",
            movie(55),
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        let event: (String, Option<i64>) = sqlx::query_as(
            "SELECT event_type, duration_minutes FROM viewing_events WHERE media_id = 55",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(event.0, "watched");
        assert_eq!(event.1, Some(118));

        let history_count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM activity_log WHERE action = 'movie:watched'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(history_count.0, 1);
    }

    #[tokio::test]
    async fn does_not_reapply_an_already_applied_movie_toggle() {
        let pool = migrated_pool().await;
        toggle_movie_seen_impl(
            &pool,
            "default",
            movie(55),
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();
        // Repeating the same "watched" call (retry, double invoke) must be a
        // no-op — not a second viewing_events/activity_log row.
        toggle_movie_seen_impl(
            &pool,
            "default",
            movie(55),
            true,
            "2026-01-01T00:00:01.000Z",
        )
        .await
        .unwrap();

        let event_count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM viewing_events WHERE media_id = 55")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(event_count.0, 1);

        let history_count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM activity_log WHERE action = 'movie:watched'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(history_count.0, 1);

        // Repeating "unwatched" while already unwatched is likewise a no-op.
        toggle_movie_seen_impl(
            &pool,
            "default",
            movie(55),
            false,
            "2026-01-01T00:00:02.000Z",
        )
        .await
        .unwrap();
        toggle_movie_seen_impl(
            &pool,
            "default",
            movie(55),
            false,
            "2026-01-01T00:00:03.000Z",
        )
        .await
        .unwrap();

        let unwatched_count: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM viewing_events WHERE media_id = 55 AND event_type = 'unwatched'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(unwatched_count.0, 1);
    }

    // Unlike the sequential no-op test above (each call awaited to
    // completion before the next starts), this fires both calls at once so
    // their BEGIN IMMEDIATE transactions genuinely contend for SQLite's
    // write lock — the scenario the sequential test can't exercise. Before
    // moving the idempotency check inside a BEGIN IMMEDIATE transaction,
    // both calls could read "not yet watched" off their own snapshot before
    // either took the write lock, and both would insert their own
    // viewing_events/activity_log row for what's really one logical
    // transition.
    #[tokio::test]
    async fn two_concurrent_movie_toggles_produce_only_one_viewing_event() {
        let pool = migrated_pool().await;

        let (first, second) = tokio::join!(
            toggle_movie_seen_impl(
                &pool,
                "default",
                movie(77),
                true,
                "2026-01-01T00:00:00.000Z"
            ),
            toggle_movie_seen_impl(
                &pool,
                "default",
                movie(77),
                true,
                "2026-01-01T00:00:00.001Z"
            ),
        );
        first.unwrap();
        second.unwrap();

        let event_count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM viewing_events WHERE media_id = 77")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(event_count.0, 1);

        let history_count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM activity_log WHERE action = 'movie:watched'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(history_count.0, 1);
    }

    #[tokio::test]
    async fn marks_an_episode_watched_and_reflects_it_in_progress_and_tracked_series() {
        let pool = migrated_pool().await;
        let s = series(9, None);

        let changed = apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(100, 1)],
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();
        assert_eq!(changed, 1);

        let progress = get_episode_progress_impl(&pool, "default", 9)
            .await
            .unwrap();
        assert_eq!(progress.len(), 1);
        assert_eq!(progress[0].episode_id, 100);

        let tracked = list_tracked_series_impl(&pool, "default").await.unwrap();
        let entry = tracked.iter().find(|item| item.series_id == 9).unwrap();
        assert_eq!(entry.watched_episodes, 1);
    }

    #[tokio::test]
    async fn does_not_reapply_an_already_applied_episode() {
        let pool = migrated_pool().await;
        let s = series(9, None);
        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(100, 1)],
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        let changed = apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(100, 1)],
            true,
            "2026-01-01T00:00:01.000Z",
        )
        .await
        .unwrap();
        assert_eq!(changed, 0);
    }

    // Same scenario as two_concurrent_movie_toggles_produce_only_one_viewing_event
    // above, for the episode/season/series-marking path (apply_episodes_impl
    // is a thin wrapper over apply_episodes_and_log_impl, so this covers
    // "mark whole season/series watched" too, not just a single episode).
    #[tokio::test]
    async fn two_concurrent_episode_applies_produce_only_one_viewing_event() {
        let pool = migrated_pool().await;
        let s = series(9, None);
        let episodes = [episode(100, 1)];

        let (first, second) = tokio::join!(
            apply_episodes_impl(
                &pool,
                "default",
                &s,
                &episodes,
                true,
                "2026-01-01T00:00:00.000Z"
            ),
            apply_episodes_impl(
                &pool,
                "default",
                &s,
                &episodes,
                true,
                "2026-01-01T00:00:00.001Z"
            ),
        );
        let changed = first.unwrap() + second.unwrap();
        assert_eq!(changed, 1);

        let event_count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM viewing_events WHERE episode_id = 100")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(event_count.0, 1);
    }

    #[tokio::test]
    async fn computes_watched_episodes_via_the_tracked_series_join_not_a_stored_counter() {
        let pool = migrated_pool().await;
        let s = series(9, Some(3));

        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(1, 1)],
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();
        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(2, 2)],
            true,
            "2026-01-01T00:00:01.000Z",
        )
        .await
        .unwrap();

        let tracked = list_tracked_series_impl(&pool, "default").await.unwrap();
        let entry = tracked.iter().find(|item| item.series_id == 9).unwrap();
        assert_eq!(entry.total_episodes, 3);
        assert_eq!(entry.watched_episodes, 2);

        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(1, 1)],
            false,
            "2026-01-01T00:00:02.000Z",
        )
        .await
        .unwrap();
        let updated = list_tracked_series_impl(&pool, "default").await.unwrap();
        let entry = updated.iter().find(|item| item.series_id == 9).unwrap();
        assert_eq!(entry.watched_episodes, 1);
    }

    #[tokio::test]
    async fn apply_episodes_only_writes_rows_that_actually_changed_state() {
        let pool = migrated_pool().await;
        let s = series(9, None);

        let first = apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(1, 1), episode(2, 2)],
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();
        assert_eq!(first, 2);

        let second = apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(1, 1), episode(2, 2)],
            true,
            "2026-01-01T00:00:01.000Z",
        )
        .await
        .unwrap();
        assert_eq!(second, 0);

        let count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM episode_progress WHERE series_id = 9")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count.0, 2);
    }

    #[tokio::test]
    async fn marking_a_whole_season_watched_applies_every_episode_in_one_transaction() {
        let pool = migrated_pool().await;
        let s = series(9, None);
        let season_episodes = vec![episode(1, 1), episode(2, 2), episode(3, 3)];

        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &season_episodes,
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        let progress = get_episode_progress_impl(&pool, "default", 9)
            .await
            .unwrap();
        assert_eq!(progress.len(), 3);
    }

    #[tokio::test]
    async fn apply_episodes_does_not_log_history() {
        let pool = migrated_pool().await;
        // Pre-seed the library entry so watching an episode doesn't also
        // auto-create one (which would log its own LibraryAdd entry,
        // unrelated to what this test checks).
        seed_library_status(&pool, 9, "series", "planned").await;
        let s = series(9, None);
        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(1, 1)],
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        let history_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM activity_log")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(history_count.0, 0);
    }

    #[tokio::test]
    async fn apply_episodes_and_log_impl_writes_the_history_entry_in_the_same_transaction() {
        let pool = migrated_pool().await;
        // Pre-seed so the auto-create's own LibraryAdd entry doesn't also
        // land in activity_log and interfere with the single-row fetch below.
        seed_library_status(&pool, 9, "series", "planned").await;
        let s = series(9, None);
        let history = EpisodeHistoryInput {
            action: HistoryAction::EpisodeWatched,
            season_number: Some(1),
            episode_number: Some(1),
            episode_title: Some("Pilot".to_string()),
        };

        let changed = apply_episodes_and_log_impl(
            &pool,
            "default",
            &s,
            &[episode(100, 1)],
            true,
            "2026-01-01T00:00:00.000Z",
            Some(history),
            Some("Great pilot!".to_string()),
        )
        .await
        .unwrap();
        assert_eq!(changed, 1);

        let row: (String, Option<String>, Option<String>) = sqlx::query_as(
            "SELECT action, episode_title, metadata FROM activity_log WHERE media_id = 9",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(row.0, "episode:watched");
        assert_eq!(row.1.as_deref(), Some("Pilot"));
        let metadata: serde_json::Value = serde_json::from_str(&row.2.unwrap()).unwrap();
        assert_eq!(metadata["episodeCount"], 1);
        assert_eq!(metadata["note"], "Great pilot!");

        let event_note: Option<String> =
            sqlx::query_scalar("SELECT note FROM viewing_events WHERE media_id = 9")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(event_note.as_deref(), Some("Great pilot!"));
    }

    #[tokio::test]
    async fn apply_episodes_and_log_impl_skips_history_when_nothing_changed() {
        let pool = migrated_pool().await;
        seed_library_status(&pool, 9, "series", "planned").await;
        let s = series(9, None);
        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(100, 1)],
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        let history = EpisodeHistoryInput {
            action: HistoryAction::EpisodeWatched,
            season_number: Some(1),
            episode_number: Some(1),
            episode_title: Some("Pilot".to_string()),
        };
        let changed = apply_episodes_and_log_impl(
            &pool,
            "default",
            &s,
            &[episode(100, 1)],
            true,
            "2026-01-01T00:00:01.000Z",
            Some(history),
            None,
        )
        .await
        .unwrap();
        assert_eq!(changed, 0);

        let history_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM activity_log")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(history_count.0, 0);
    }

    #[tokio::test]
    async fn refresh_tracked_series_status_writes_back_a_fresh_tmdb_status() {
        let pool = migrated_pool().await;
        let mut s = series(9, None);
        s.status = Some("Returning Series".to_string());
        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(100, 1)],
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        refresh_tracked_series_status_impl(&pool, "default", 9, Some("Ended".to_string()))
            .await
            .unwrap();

        let tracked = list_tracked_series_impl(&pool, "default").await.unwrap();
        let entry = tracked.iter().find(|item| item.series_id == 9).unwrap();
        assert_eq!(entry.status.as_deref(), Some("Ended"));
    }

    #[tokio::test]
    async fn refresh_tracked_series_status_is_a_no_op_when_the_status_is_unchanged() {
        let pool = migrated_pool().await;
        let mut s = series(9, None);
        s.status = Some("Returning Series".to_string());
        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(100, 1)],
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        // Same status passed again — should hit the early `current_status ==
        // status` return rather than issuing a write.
        refresh_tracked_series_status_impl(
            &pool,
            "default",
            9,
            Some("Returning Series".to_string()),
        )
        .await
        .unwrap();

        let tracked = list_tracked_series_impl(&pool, "default").await.unwrap();
        let entry = tracked.iter().find(|item| item.series_id == 9).unwrap();
        assert_eq!(entry.status.as_deref(), Some("Returning Series"));
    }

    #[tokio::test]
    async fn refresh_tracked_series_status_is_a_no_op_for_an_untracked_series() {
        let pool = migrated_pool().await;
        // No tracked_series row exists for series 404 — must not create one.
        refresh_tracked_series_status_impl(&pool, "default", 404, Some("Ended".to_string()))
            .await
            .unwrap();

        let tracked = list_tracked_series_impl(&pool, "default").await.unwrap();
        assert!(tracked.iter().all(|item| item.series_id != 404));
    }

    // --- tauri::command wrapper coverage -----------------------------
    //
    // The wrappers above (toggle_movie_seen, toggle_episodes_watched) and a
    // couple of the profile_scoped_command!-generated ones just resolve the
    // active profile and delegate straight to an already-tested `_impl`
    // function, so these are thin happy-path checks that the wrapper wiring
    // itself (tauri::State extraction, profile resolution) works — not a
    // re-test of the underlying business logic.

    #[tokio::test]
    async fn toggle_movie_seen_command_marks_a_movie_watched() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        toggle_movie_seen(
            movie(1),
            true,
            "2026-01-01T00:00:00.000Z".to_string(),
            None,
            state.clone(),
        )
        .await
        .unwrap();

        assert!(is_movie_seen(1, state).await.unwrap());
    }

    #[tokio::test]
    async fn toggle_episodes_watched_command_marks_episodes_watched_and_logs_history() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let history = EpisodeHistoryInput {
            action: HistoryAction::EpisodeWatched,
            season_number: Some(1),
            episode_number: Some(1),
            episode_title: Some("Pilot".to_string()),
        };

        let changed = toggle_episodes_watched(
            series(9, None),
            vec![episode(100, 1)],
            true,
            "2026-01-01T00:00:00.000Z".to_string(),
            Some(history),
            None,
            state.clone(),
        )
        .await
        .unwrap();

        assert_eq!(changed, 1);
        let progress = get_episode_progress(9, state).await.unwrap();
        assert_eq!(progress.len(), 1);
    }

    #[tokio::test]
    async fn list_tracked_series_command_returns_a_series_tracked_via_the_toggle_command() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        toggle_episodes_watched(
            series(9, None),
            vec![episode(100, 1)],
            true,
            "2026-01-01T00:00:00.000Z".to_string(),
            None,
            None,
            state.clone(),
        )
        .await
        .unwrap();

        let tracked = list_tracked_series(state).await.unwrap();
        assert!(tracked.iter().any(|item| item.series_id == 9));
    }

    /// Every `_impl` fn in this file takes `profile_id` as a plain parameter
    /// with no further check of its own — the same pattern flagged in
    /// custom_lists.rs's/availability.rs's own cross-profile tests. Unlike
    /// those two files, nothing in this one previously proved that marking a
    /// movie/episode watched for one profile is actually invisible to
    /// another, despite `seen_movies`/`episode_progress`/`tracked_series`
    /// all being scoped by a `profile_id` column read from the same
    /// untrusted caller-supplied string as everywhere else.
    #[tokio::test]
    async fn marking_a_movie_and_episodes_watched_is_invisible_to_another_profile() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at)
             VALUES ('other', 'Other', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        toggle_movie_seen_impl(&pool, "default", movie(1), true, "2026-01-01T00:00:00.000Z")
            .await
            .unwrap();
        let s = series(9, Some(3));
        apply_episodes_impl(
            &pool,
            "default",
            &s,
            &[episode(1, 1)],
            true,
            "2026-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        assert!(is_movie_seen_impl(&pool, "default", 1).await.unwrap());
        assert!(!is_movie_seen_impl(&pool, "other", 1).await.unwrap());

        assert_eq!(
            get_episode_progress_impl(&pool, "default", 9)
                .await
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            get_episode_progress_impl(&pool, "other", 9)
                .await
                .unwrap()
                .len(),
            0
        );

        assert!(
            list_tracked_series_impl(&pool, "default")
                .await
                .unwrap()
                .iter()
                .any(|item| item.series_id == 9)
        );
        assert!(
            !list_tracked_series_impl(&pool, "other")
                .await
                .unwrap()
                .iter()
                .any(|item| item.series_id == 9)
        );
    }
}
