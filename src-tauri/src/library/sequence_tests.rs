//! Long generated sequences: viewing, manual status edits, library
//! add/remove, catalogue totals changing under the user, and a backup restore
//! in the middle — with a model compared to the database after every step.
//!
//! Rules the model encodes (the observed, documented behaviour):
//! - viewing never lowers a status: Planned < Watching = Paused = Dropped <
//!   Completed, and a title that is not in the library yet is created at the
//!   target status;
//! - a manual edit sets any status, whatever the viewing says;
//! - a refresh from the catalogue reopens a Completed series that now has
//!   unwatched episodes, and only that.

use std::collections::{BTreeSet, HashMap};

use sqlx::SqlitePool;
use tauri::{Manager, State};

use super::domain::LibraryStatus;
use super::models::{LibraryPatch, MediaSummaryInput};
use super::repository::{add_if_absent_impl, remove_if_planned_impl, remove_impl, upsert_impl};
use super::status_transitions_tests::{ep, migrated_pool, show, show_media};
use crate::backup::{export_backup_data, import_backup_data};
use crate::models::MediaType;
use crate::progress::{
    EpisodeInput, SeriesInput, apply_episodes_impl, list_tracked_series,
    refresh_tracked_series_status, toggle_movie_seen,
};

type Key = (i64, &'static str);
/// media_id, media_type, status, started_at, completed_at
type LibraryDatesRow = (i64, String, String, Option<String>, Option<String>);

fn rank(status: &str) -> u8 {
    match status {
        "planned" => 0,
        "watching" | "paused" | "dropped" => 1,
        "completed" => 2,
        other => panic!("unexpected status {other}"),
    }
}

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
    seen_episodes: BTreeSet<(i64, i64)>,
    seen_movies: BTreeSet<i64>,
    /// Cached `tracked_series.total_episodes`, present once a series has been
    /// toggled at least once.
    tracked_total: HashMap<i64, i64>,
    adds: HashMap<Key, i64>,
    removes: HashMap<Key, i64>,
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
        *self.adds.entry(key).or_insert(0) += 1;
    }

    fn drop_entry(&mut self, key: Key) {
        if self.lib.remove(&key).is_some() {
            *self.removes.entry(key).or_insert(0) += 1;
        }
    }

    fn auto_sync(&mut self, key: Key, target: &'static str) {
        match self.lib.get(&key).copied() {
            None => self.create(key, target),
            Some(current) if rank(target) > rank(current) => {
                self.lib.insert(key, target);
            }
            Some(_) => {}
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

        for step in 0..120_u64 {
            let context = format!("seed {seed}, step {step}");
            // One step per hour, strictly increasing.
            let at = format!("2026-01-{:02}T{:02}:00:00.000Z", 1 + step / 24, step % 24);

            match next(10) {
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
                        let total = model.tracked_total.entry(entry.id).or_insert(0);
                        *total = (*total).max(entry.total);
                        if watched {
                            let regular = model.regular_seen(entry.id, &catalogue);
                            let target = if regular >= entry.total && entry.status == "Ended" {
                                Some("completed")
                            } else if regular >= 1 {
                                Some("watching")
                            } else {
                                None
                            };
                            if let Some(target) = target {
                                model.auto_sync((entry.id, "series"), target);
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
                    if watched && changed {
                        model.auto_sync((id, "movie"), "completed");
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
                    match model.lib.get_mut(&key) {
                        Some(current) => *current = status,
                        None => model.create(key, status),
                    }
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
                    if let Some(cached) = model.tracked_total.get_mut(&entry.id) {
                        *cached = total;
                        let regular = model.regular_seen(entry.id, &catalogue);
                        let key = (entry.id, "series");
                        if model.lib.get(&key) == Some(&"completed")
                            && regular >= 1
                            && regular < total
                        {
                            model.lib.insert(key, "watching");
                        }
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
                "SELECT media_id, media_type, status, started_at, completed_at FROM library_items",
            )
            .fetch_all(&pool)
            .await
            .unwrap();
            assert_eq!(rows.len(), model.lib.len(), "{context}: library size");
            for (id, media_type, status, started, completed) in rows {
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

            let events: Vec<(i64, Option<i64>, String)> = sqlx::query_as(
                "SELECT media_id, episode_id, event_type FROM viewing_events
                 ORDER BY watched_at ASC, rowid ASC",
            )
            .fetch_all(&pool)
            .await
            .unwrap();
            let mut last: HashMap<(i64, Option<i64>), String> = HashMap::new();
            for (media_id, episode_id, event_type) in events {
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
