//! Long generated sequences: viewing, manual status edits, library
//! add/remove, catalogue totals changing under the user, and a backup restore
//! in the middle — with a model compared to the database after every step.
//!
//! Rules the model encodes (docs/library-status.md, implemented in
//! library/status.rs — the model re-states them independently):
//! - a status derives from the facts: a movie is Completed when seen and
//!   Planned otherwise; a series is Planned with nothing watched, Watching
//!   with some watched, Completed once every episode is watched and the
//!   series is over (Ended / Canceled);
//! - an automatic status follows the facts in both directions on every
//!   viewing change, TMDB refresh and reset; a status the viewer picked by
//!   hand is left alone, except that watching moves a manual Planned or
//!   Watching entry forward, resumes a Paused or Dropped series, and a
//!   refresh completes a manual Watching one;
//! - a title that is not in the library yet is created by its first watch;
//! - a manual edit sets any status, whatever the viewing says;
//! - re-adding a title that already has progress, and the editor's
//!   "Automatic", adopt the derived status (origin automatic);
//! - rewatches: watching a seen movie again, or raising a seen title's
//!   library rewatch count, logs standing `rewatched` events; lowering the
//!   count takes the most recent back; unwatching a movie cancels its
//!   rewatches and resets its count, as does unwatching a series' last
//!   watched episode; a count set on an unseen title writes
//!   no event.

use std::collections::{BTreeSet, HashMap};

use sqlx::SqlitePool;
use tauri::{Manager, State};

use super::domain::LibraryStatus;
use super::models::{LibraryPatch, MediaSummaryInput};
use super::repository::{add_if_absent_impl, remove_if_planned_impl, remove_impl, upsert_impl};
use super::status::reset_status_to_auto_impl;
use super::status_transitions_tests::{ep, migrated_pool, show, show_media};
use crate::backup::{export_backup_data, import_backup_data};
use crate::models::MediaType;
use crate::progress::{
    EpisodeInput, SeriesInput, apply_episodes_impl, list_tracked_series,
    refresh_tracked_series_status, rewatch_movie, toggle_movie_seen,
};

type Key = (i64, &'static str);
/// media_id, media_type, status, started_at, completed_at
type LibraryDatesRow = (i64, String, String, Option<String>, Option<String>, String);

fn status_of(name: &str) -> LibraryStatus {
    match name {
        "planned" => LibraryStatus::Planned,
        "watching" => LibraryStatus::Watching,
        "paused" => LibraryStatus::Paused,
        "completed" => LibraryStatus::Completed,
        "dropped" => LibraryStatus::Dropped,
        other => panic!("{other}"),
    }
}

struct Entry {
    id: i64,
    status: &'static str,
    total: i64,
    episodes: Vec<EpisodeInput>,
}

#[derive(Clone, Default)]
struct Model {
    lib: HashMap<Key, &'static str>,
    /// Who set each entry's status: "manual" or "auto".
    origin: HashMap<Key, &'static str>,
    seen_episodes: BTreeSet<(i64, i64)>,
    seen_movies: BTreeSet<i64>,
    /// Cached `tracked_series.total_episodes`, present once a series has been
    /// toggled at least once.
    tracked_total: HashMap<i64, i64>,
    /// Cached `tracked_series.status` (TMDB's series status).
    tracked_status: HashMap<i64, &'static str>,
    adds: HashMap<Key, i64>,
    removes: HashMap<Key, i64>,
    /// `library_items.rewatch_count` of every library entry.
    counters: HashMap<Key, i64>,
    /// Standing `rewatched` events per title (the log keeps them across a
    /// library removal; the library entry's count does not).
    rewatches: HashMap<Key, i64>,
}

impl Model {
    fn regular_seen(&self, series_id: i64, catalogue: &[Entry]) -> i64 {
        let entry = catalogue.iter().find(|e| e.id == series_id).unwrap();
        entry
            .episodes
            .iter()
            .filter(|ep| ep.season_number > 0 && self.seen_episodes.contains(&(series_id, ep.id)))
            .count() as i64
    }

    fn create(&mut self, key: Key, status: &'static str) {
        self.lib.insert(key, status);
        self.origin.insert(key, "manual");
        self.counters.insert(key, 0);
        *self.adds.entry(key).or_insert(0) += 1;
    }

    fn drop_entry(&mut self, key: Key) {
        if self.lib.remove(&key).is_some() {
            self.origin.remove(&key);
            self.counters.remove(&key);
            *self.removes.entry(key).or_insert(0) += 1;
        }
    }

    fn is_seen(&self, key: Key) -> bool {
        match key.1 {
            "movie" => self.seen_movies.contains(&key.0),
            _ => self
                .seen_episodes
                .iter()
                .any(|(series, _)| *series == key.0),
        }
    }

    /// The library editor saved `new` as the rewatch count of an existing
    /// entry.
    fn set_counter(&mut self, key: Key, new: i64) {
        let previous = self.counters.insert(key, new).unwrap_or(0);
        if new > previous && self.is_seen(key) {
            *self.rewatches.entry(key).or_insert(0) += new - previous;
        } else if new < previous {
            let standing = self.rewatches.entry(key).or_insert(0);
            *standing -= (previous - new).min(*standing);
        }
    }

    /// The status the facts imply (see the module docs).
    fn derived(
        &self,
        key: Key,
        catalogue: &[Entry],
        total: Option<i64>,
        series_status: Option<&str>,
    ) -> &'static str {
        if key.1 == "movie" {
            return if self.seen_movies.contains(&key.0) {
                "completed"
            } else {
                "planned"
            };
        }
        let regular = self.regular_seen(key.0, catalogue);
        if regular < 1 {
            "planned"
        } else if matches!(total, Some(t) if t > 0 && regular >= t)
            && matches!(series_status, Some("Ended" | "Canceled"))
        {
            "completed"
        } else {
            "watching"
        }
    }

    /// The facts as the database stores them (cached total and status).
    fn stored_derived(&self, key: Key, catalogue: &[Entry]) -> &'static str {
        let total = self.tracked_total.get(&key.0).copied().filter(|t| *t > 0);
        let status = self.tracked_status.get(&key.0).copied();
        self.derived(key, catalogue, total, status)
    }

    /// Re-states `library::status::decide`: how a trigger ("watched",
    /// "unwatched", "refreshed", "reset") moves the status of `key`, given the
    /// derived status for the facts the caller has.
    fn react(&mut self, key: Key, trigger: &str, derived: &'static str) {
        let Some(current) = self.lib.get(&key).copied() else {
            if trigger == "watched" {
                self.create(key, derived);
                self.origin.insert(key, "auto");
            }
            return;
        };
        let origin = self.origin.get(&key).copied().unwrap_or("manual");
        let next = match (origin, trigger) {
            (_, "reset") | ("auto", _) => derived,
            ("manual", "unwatched") => return,
            ("manual", "watched") => match current {
                "planned" => derived,
                "watching" if derived == "completed" => "completed",
                "watching" | "completed" => return,
                // paused / dropped: resume, or complete if finished
                _ => match derived {
                    "completed" => "completed",
                    "planned" => return,
                    _ => "watching",
                },
            },
            ("manual", "refreshed") => match current {
                "watching" if derived == "completed" => "completed",
                _ => return,
            },
            other => panic!("unexpected {other:?}"),
        };
        if next == current && (origin == "auto" || trigger != "reset") {
            return;
        }
        self.lib.insert(key, next);
        self.origin.insert(key, "auto");
    }

    /// A status the viewer picks: manual whenever it actually changes.
    fn manual_edit(&mut self, key: Key, status: &'static str) {
        match self.lib.get_mut(&key) {
            Some(current) => {
                if *current != status {
                    *current = status;
                    self.origin.insert(key, "manual");
                }
            }
            None => self.create(key, status),
        }
    }
}

fn movie_media(id: i64) -> MediaSummaryInput {
    MediaSummaryInput {
        media_type: MediaType::Movie,
        ..show_media(id)
    }
}

fn media_for(is_movie: bool, id: i64) -> MediaSummaryInput {
    if is_movie {
        movie_media(id)
    } else {
        show_media(id)
    }
}

#[tokio::test]
async fn random_sequences_keep_library_progress_history_and_dates_consistent() {
    const STATUSES: [&str; 5] = ["planned", "watching", "paused", "completed", "dropped"];
    let catalogue = vec![
        Entry {
            id: 9,
            status: "Ended",
            total: 4,
            episodes: vec![
                ep(901, 1),
                ep(902, 2),
                ep(903, 3),
                ep(904, 4),
                EpisodeInput {
                    season_number: 0,
                    ..ep(950, 1)
                },
            ],
        },
        Entry {
            id: 10,
            status: "Returning Series",
            total: 3,
            episodes: vec![ep(1001, 1), ep(1002, 2), ep(1003, 3)],
        },
    ];
    let movies = [55_i64, 56];

    for seed in [3_u64, 11, 99, 4242, 31337] {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool.clone());
        let mut state = seed;
        let mut next = |bound: u64| {
            state = state
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            (state >> 33) % bound
        };

        let mut model = Model::default();
        let mut snapshot: Option<(_, Model)> = None;
        let mut peak_rewatches = 0_i64;

        for step in 0..120_u64 {
            let context = format!("seed {seed}, step {step}");
            // One step per hour, strictly increasing.
            let at = format!("2026-01-{:02}T{:02}:00:00.000Z", 1 + step / 24, step % 24);

            match next(13) {
                // Episodes (single or whole list), watch or unwatch.
                0..=2 => {
                    let entry = &catalogue[next(catalogue.len() as u64) as usize];
                    let watched = next(3) != 0;
                    let picked: Vec<EpisodeInput> = if next(2) == 0 {
                        vec![entry.episodes[next(entry.episodes.len() as u64) as usize].clone()]
                    } else {
                        entry.episodes.clone()
                    };
                    let changed = picked
                        .iter()
                        .any(|e| model.seen_episodes.contains(&(entry.id, e.id)) != watched);
                    for e in &picked {
                        if watched {
                            model.seen_episodes.insert((entry.id, e.id));
                        } else {
                            model.seen_episodes.remove(&(entry.id, e.id));
                        }
                    }
                    let input: SeriesInput = show(entry.id, entry.total, entry.status);
                    apply_episodes_impl(&pool, "default", &input, &picked, watched, &at)
                        .await
                        .unwrap();
                    if changed {
                        // A viewing action writes TMDB's own total (never below
                        // what is watched) and status into the cache, and the
                        // status is decided from that cache.
                        let regular = model.regular_seen(entry.id, &catalogue);
                        model
                            .tracked_total
                            .insert(entry.id, entry.total.max(regular));
                        model.tracked_status.insert(entry.id, entry.status);
                        let key = (entry.id, "series");
                        let derived = model.stored_derived(key, &catalogue);
                        model.react(key, if watched { "watched" } else { "unwatched" }, derived);
                        // Unwatching the last watched episode cancels the
                        // series' rewatches and resets its count.
                        if !watched && !model.is_seen(key) {
                            model.rewatches.remove(&key);
                            if let Some(counter) = model.counters.get_mut(&key) {
                                *counter = 0;
                            }
                        }
                    }
                }
                // Movie toggle.
                3 => {
                    let id = movies[next(2) as usize];
                    let watched = next(3) != 0;
                    let changed = model.seen_movies.contains(&id) != watched;
                    if watched {
                        model.seen_movies.insert(id);
                    } else {
                        model.seen_movies.remove(&id);
                    }
                    let movie = serde_json::from_value(serde_json::json!({
                        "id": id, "title": "Movie", "posterPath": null, "backdropPath": null,
                        "runtime": 100, "year": 2020, "rating": 7.0, "genres": []
                    }))
                    .unwrap();
                    let pool_state: State<'_, SqlitePool> = app.state();
                    toggle_movie_seen(movie, watched, at.clone(), None, pool_state)
                        .await
                        .unwrap();
                    if changed {
                        let key = (id, "movie");
                        let derived = model.derived(key, &catalogue, None, None);
                        model.react(key, if watched { "watched" } else { "unwatched" }, derived);
                    }
                    if !watched && changed {
                        model.rewatches.remove(&(id, "movie"));
                        if let Some(counter) = model.counters.get_mut(&(id, "movie")) {
                            *counter = 0;
                        }
                    }
                }
                // Manual status edit (creates the entry if absent).
                4 | 5 => {
                    let is_movie = next(3) == 0;
                    let id = if is_movie {
                        movies[next(2) as usize]
                    } else {
                        catalogue[next(2) as usize].id
                    };
                    let key: Key = (id, if is_movie { "movie" } else { "series" });
                    let status = STATUSES[next(5) as usize];
                    upsert_impl(
                        &pool,
                        media_for(is_movie, id),
                        LibraryPatch {
                            status: Some(status_of(status)),
                            ..Default::default()
                        },
                        "default",
                    )
                    .await
                    .unwrap();
                    model.manual_edit(key, status);
                }
                // Quick add / quick remove / full remove.
                6 => {
                    let is_movie = next(3) == 0;
                    let id = if is_movie {
                        movies[next(2) as usize]
                    } else {
                        catalogue[next(2) as usize].id
                    };
                    let key: Key = (id, if is_movie { "movie" } else { "series" });
                    let media_type = if is_movie {
                        MediaType::Movie
                    } else {
                        MediaType::Series
                    };
                    match next(3) {
                        0 => {
                            let added =
                                add_if_absent_impl(&pool, media_for(is_movie, id), "default")
                                    .await
                                    .unwrap();
                            assert_eq!(added, !model.lib.contains_key(&key), "{context}: add");
                            if added {
                                model.create(key, "planned");
                                // Progress that outlived an earlier stay decides the status.
                                let derived = model.stored_derived(key, &catalogue);
                                if derived != "planned" {
                                    model.react(key, "reset", derived);
                                }
                            }
                        }
                        1 => {
                            let removed = remove_if_planned_impl(&pool, "default", id, media_type)
                                .await
                                .unwrap();
                            assert_eq!(
                                removed,
                                model.lib.get(&key) == Some(&"planned"),
                                "{context}: remove_if_planned"
                            );
                            if removed {
                                model.drop_entry(key);
                            }
                        }
                        _ => {
                            remove_impl(&pool, "default", id, media_type).await.unwrap();
                            model.drop_entry(key);
                        }
                    }
                }
                // Catalogue total changes under the user (refresh from TMDB).
                7 | 8 => {
                    let entry = &catalogue[next(2) as usize];
                    let total = 1 + next(6) as i64;
                    let pool_state: State<'_, SqlitePool> = app.state();
                    refresh_tracked_series_status(
                        entry.id,
                        Some(entry.status.to_string()),
                        Some(total),
                        pool_state,
                    )
                    .await
                    .unwrap();
                    let regular = model.regular_seen(entry.id, &catalogue);
                    if let Some(cached) = model.tracked_total.get_mut(&entry.id) {
                        // A refresh never stores a total below what is already watched.
                        *cached = total.max(regular);
                        model.tracked_status.insert(entry.id, entry.status);
                        let key = (entry.id, "series");
                        let derived = model.stored_derived(key, &catalogue);
                        model.react(key, "refreshed", derived);
                    }
                }
                // Watch a movie again (an explicit "watch again").
                9 => {
                    let id = movies[next(2) as usize];
                    let key: Key = (id, "movie");
                    let movie = serde_json::from_value(serde_json::json!({
                        "id": id, "title": "Movie", "posterPath": null, "backdropPath": null,
                        "runtime": 100, "year": 2020, "rating": 7.0, "genres": []
                    }))
                    .unwrap();
                    let pool_state: State<'_, SqlitePool> = app.state();
                    let outcome = rewatch_movie(movie, at.clone(), None, pool_state).await;
                    if model.seen_movies.contains(&id) {
                        outcome.unwrap();
                        *model.rewatches.entry(key).or_insert(0) += 1;
                        if let Some(counter) = model.counters.get_mut(&key) {
                            *counter += 1;
                        }
                    } else {
                        assert!(outcome.is_err(), "{context}: rewatch of an unseen movie");
                    }
                }
                // The library editor saves a rewatch count (creating the
                // entry if absent).
                10 => {
                    let is_movie = next(2) == 0;
                    let id = if is_movie {
                        movies[next(2) as usize]
                    } else {
                        catalogue[next(2) as usize].id
                    };
                    let key: Key = (id, if is_movie { "movie" } else { "series" });
                    let count = next(5) as i64;
                    upsert_impl(
                        &pool,
                        media_for(is_movie, id),
                        LibraryPatch {
                            rewatch_count: Some(count),
                            ..Default::default()
                        },
                        "default",
                    )
                    .await
                    .unwrap();
                    if !model.lib.contains_key(&key) {
                        model.create(key, "planned");
                    }
                    model.set_counter(key, count);
                }
                // The editor's "Automatic": the status follows the viewing again.
                11 => {
                    let is_movie = next(3) == 0;
                    let id = if is_movie {
                        movies[next(2) as usize]
                    } else {
                        catalogue[next(2) as usize].id
                    };
                    let key: Key = (id, if is_movie { "movie" } else { "series" });
                    let media_type = if is_movie {
                        MediaType::Movie
                    } else {
                        MediaType::Series
                    };
                    let exists = reset_status_to_auto_impl(&pool, "default", id, media_type)
                        .await
                        .unwrap();
                    assert_eq!(exists, model.lib.contains_key(&key), "{context}: reset");
                    if exists {
                        let derived = model.stored_derived(key, &catalogue);
                        model.react(key, "reset", derived);
                    }
                }
                // Backup: take a snapshot, or restore the last one.
                _ => {
                    let pool_state: State<'_, SqlitePool> = app.state();
                    if let Some((data, saved)) = snapshot.take().filter(|_| next(2) == 0) {
                        import_backup_data(data, pool_state).await.unwrap();
                        model = saved;
                    } else {
                        let data = export_backup_data(pool_state).await.unwrap();
                        snapshot = Some((data, model.clone()));
                    }
                }
            }

            // ---- invariants -------------------------------------------------
            // Library status and presence follow the model; dates follow status.
            let rows: Vec<LibraryDatesRow> = sqlx::query_as(
                "SELECT media_id, media_type, status, started_at, completed_at, status_origin FROM library_items",
            )
            .fetch_all(&pool)
            .await
            .unwrap();
            assert_eq!(rows.len(), model.lib.len(), "{context}: library size");
            for (id, media_type, status, started, completed, origin) in rows {
                let key: Key = (
                    id,
                    if media_type == "movie" {
                        "movie"
                    } else {
                        "series"
                    },
                );
                assert_eq!(
                    model.lib.get(&key).copied(),
                    Some(status.as_str()),
                    "{context}: status of {key:?}"
                );
                assert_eq!(
                    model.origin.get(&key).copied(),
                    Some(origin.as_str()),
                    "{context}: status origin of {key:?}"
                );
                assert_eq!(
                    completed.is_some(),
                    status == "completed",
                    "{context}: completed_at of {key:?} ({status}, {completed:?})"
                );
                if status == "watching" {
                    assert!(
                        started.is_some(),
                        "{context}: {key:?} watching without started_at"
                    );
                }
            }

            // Library add/remove history matches the model and never repeats.
            for key in [(9, "series"), (10, "series"), (55, "movie"), (56, "movie")] {
                let actions: Vec<(String,)> = sqlx::query_as(
                    "SELECT action FROM activity_log
                     WHERE media_id = $1 AND media_type = $2
                       AND action IN ('watchlist:add','watchlist:remove')
                     ORDER BY rowid",
                )
                .bind(key.0)
                .bind(key.1)
                .fetch_all(&pool)
                .await
                .unwrap();
                let adds = actions.iter().filter(|(a,)| a == "watchlist:add").count() as i64;
                let removes = actions.len() as i64 - adds;
                assert_eq!(
                    adds,
                    model.adds.get(&key).copied().unwrap_or(0),
                    "{context}: add log {key:?}"
                );
                assert_eq!(
                    removes,
                    model.removes.get(&key).copied().unwrap_or(0),
                    "{context}: remove log {key:?}"
                );
                for pair in actions.windows(2) {
                    assert_ne!(
                        pair[0], pair[1],
                        "{context}: repeated library log for {key:?}"
                    );
                }
                assert_eq!(
                    actions
                        .last()
                        .map(|(a,)| a == "watchlist:add")
                        .unwrap_or(false),
                    model.lib.contains_key(&key),
                    "{context}: last library log vs presence for {key:?}"
                );
            }

            // Seen state == model == latest viewing event.
            let stored_episodes: BTreeSet<(i64, i64)> = sqlx::query_as(
                "SELECT series_id, episode_id FROM episode_progress WHERE watched = 1",
            )
            .fetch_all(&pool)
            .await
            .unwrap()
            .into_iter()
            .collect();
            assert_eq!(
                stored_episodes, model.seen_episodes,
                "{context}: episode_progress"
            );
            let stored_movies: BTreeSet<i64> =
                sqlx::query_scalar("SELECT movie_id FROM seen_movies")
                    .fetch_all(&pool)
                    .await
                    .unwrap()
                    .into_iter()
                    .collect();
            assert_eq!(stored_movies, model.seen_movies, "{context}: seen_movies");

            // Log order, not dates, is what the invariants below read.
            let events: Vec<(i64, String, Option<i64>, String)> = sqlx::query_as(
                "SELECT media_id, media_type, episode_id, event_type FROM viewing_events
                 ORDER BY insert_seq ASC",
            )
            .fetch_all(&pool)
            .await
            .unwrap();
            let mut last: HashMap<(i64, Option<i64>), String> = HashMap::new();
            for (media_id, media_type, episode_id, event_type) in events {
                // A series' own rewatch events (no episode) and every
                // rewatch are not watch/unwatch toggles.
                if event_type == "rewatched" || (media_type == "series" && episode_id.is_none()) {
                    continue;
                }
                let previous = last.insert((media_id, episode_id), event_type.clone());
                assert_ne!(
                    previous.as_deref(),
                    Some(event_type.as_str()),
                    "{context}: repeated {event_type} for {media_id}/{episode_id:?}"
                );
            }
            for ((media_id, episode_id), event_type) in &last {
                let seen = match episode_id {
                    Some(episode_id) => model.seen_episodes.contains(&(*media_id, *episode_id)),
                    None => model.seen_movies.contains(media_id),
                };
                assert_eq!(
                    event_type == "watched",
                    seen,
                    "{context}: latest event {media_id}/{episode_id:?}"
                );
            }

            // Rewatches: the library editor's counters and the standing
            // `rewatched` events (those logged after the title's last
            // unwatch) follow the model, and the statistics read the same.
            let counters: Vec<(i64, String, i64)> =
                sqlx::query_as("SELECT media_id, media_type, rewatch_count FROM library_items")
                    .fetch_all(&pool)
                    .await
                    .unwrap();
            let stored_counters: HashMap<Key, i64> = counters
                .into_iter()
                .map(|(id, media_type, count)| {
                    (
                        (
                            id,
                            if media_type == "movie" {
                                "movie"
                            } else {
                                "series"
                            },
                        ),
                        count,
                    )
                })
                .collect();
            assert_eq!(stored_counters, model.counters, "{context}: rewatch counts");
            let standing: Vec<(i64, String, i64)> = sqlx::query_as(
                "SELECT e.media_id, e.media_type, COUNT(*) FROM viewing_events e
                 WHERE e.event_type = 'rewatched'
                   AND e.insert_seq > COALESCE((
                     SELECT MAX(u.insert_seq) FROM viewing_events u
                     WHERE u.media_id = e.media_id AND u.media_type = e.media_type
                       AND u.episode_id IS e.episode_id AND u.event_type = 'unwatched'), 0)
                 GROUP BY e.media_id, e.media_type",
            )
            .fetch_all(&pool)
            .await
            .unwrap();
            let stored_rewatches: HashMap<Key, i64> = standing
                .into_iter()
                .map(|(id, media_type, count)| {
                    (
                        (
                            id,
                            if media_type == "movie" {
                                "movie"
                            } else {
                                "series"
                            },
                        ),
                        count,
                    )
                })
                .collect();
            let expected_rewatches: HashMap<Key, i64> = model
                .rewatches
                .iter()
                .filter(|(_, count)| **count > 0)
                .map(|(key, count)| (*key, *count))
                .collect();
            assert_eq!(
                stored_rewatches, expected_rewatches,
                "{context}: standing rewatch events"
            );
            peak_rewatches = peak_rewatches.max(expected_rewatches.values().sum::<i64>());
            if step == 119 {
                assert!(
                    peak_rewatches > 0,
                    "seed {seed}: no rewatch ever stood, the checks above proved nothing"
                );
            }
            let pool_state: State<'_, SqlitePool> = app.state();
            let rewatch_stats = serde_json::to_value(
                crate::stats::get_rewatch_stats(
                    "2000-01-01T00:00:00.000Z".to_string(),
                    vec![],
                    0,
                    None,
                    pool_state,
                )
                .await
                .unwrap(),
            )
            .unwrap();
            assert_eq!(
                rewatch_stats["totalRewatches"].as_i64().unwrap(),
                expected_rewatches.values().sum::<i64>(),
                "{context}: total rewatches in the statistics"
            );
            let pool_state: State<'_, SqlitePool> = app.state();
            let most = crate::stats::get_library_extras(pool_state)
                .await
                .unwrap()
                .most_rewatched_title
                .map(|title| title.count);
            assert_eq!(
                most,
                expected_rewatches.values().max().copied(),
                "{context}: most rewatched title"
            );

            // Tracked-series counters equal a recount, and the cached total
            // matches the model.
            let pool_state: State<'_, SqlitePool> = app.state();
            for tracked in list_tracked_series(pool_state).await.unwrap() {
                assert_eq!(
                    tracked.watched_episodes,
                    model.regular_seen(tracked.series_id, &catalogue),
                    "{context}: watched count of series {}",
                    tracked.series_id
                );
                assert_eq!(
                    Some(&tracked.total_episodes),
                    model.tracked_total.get(&tracked.series_id),
                    "{context}: cached total of series {}",
                    tracked.series_id
                );
            }
        }
    }
}
