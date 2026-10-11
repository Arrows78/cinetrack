//! Two or three devices driven through the real viewing, library and refresh
//! commands (not raw row edits, unlike `simulation_tests.rs`) and synced
//! through the fake server, with the library status invariants checked once
//! everything has settled:
//!
//! - the devices hold the same library (status and origin), the same watched
//!   episodes, the same seen movies;
//! - every automatic status is the one its facts imply (restated here from
//!   `docs/library-status.md`, independently of `library/status.rs`);
//! - nothing is left in any outbox, and the devices stop talking to each
//!   other after a bounded number of rounds (a status two devices keep
//!   re-deciding would never let the outbox stay empty).

use std::collections::BTreeSet;

use sqlx::SqlitePool;
use tauri::{Manager, State};

use super::service;
use super::simulation_tests::{
    FakeServer, Rng, SIM_ACCOUNT, new_device, outbox_len, pull, push, seed_sim_uuids, ts,
};

/// `sync_round` with a small page size, so a pull is cut in several batches.
async fn sync_round(pool: &SqlitePool, server: &mut FakeServer, page: usize) {
    service::prepare_for_account(pool, SIM_ACCOUNT)
        .await
        .unwrap();
    push(pool, server).await.unwrap();
    pull(pool, server, page).await;
    push(pool, server).await.unwrap();
    service::mark_synced(pool).await.unwrap();
}
use crate::library::{
    add_planned_library_item, remove_library_item, reset_library_status_to_auto, save_library_item,
};
use crate::models::MediaType;
use crate::progress::{
    EpisodeInput, SeriesInput, apply_episodes_impl, refresh_tracked_series_status,
    toggle_movie_seen,
};

const SERIES: [i64; 3] = [1, 2, 3];
const MOVIES: [i64; 2] = [11, 12];
/// Episode ids of a series: 1..=6 are regular, 50 is a special (season 0).
const EPISODES: [i64; 7] = [1, 2, 3, 4, 5, 6, 50];

/// What TMDB currently says about each series (shared by every device: a
/// catalogue changing under the viewer).
#[derive(Clone, Copy)]
struct Catalogue {
    total: Option<i64>,
    status: Option<&'static str>,
}

const TMDB_STATUSES: [Option<&str>; 4] = [
    Some("Ended"),
    Some("Returning Series"),
    Some("Canceled"),
    None,
];

struct Device {
    pool: SqlitePool,
    app: tauri::App<tauri::test::MockRuntime>,
}

impl Device {
    async fn new() -> Self {
        let pool = new_device().await;
        let app = tauri::test::mock_app();
        app.manage(pool.clone());
        Self { pool, app }
    }

    fn state(&self) -> State<'_, SqlitePool> {
        self.app.state()
    }
}

fn series_input(id: i64, catalogue: Catalogue) -> SeriesInput {
    SeriesInput {
        id,
        title: format!("Series {id}"),
        poster_path: None,
        backdrop_path: None,
        runtime: Some(40),
        number_of_episodes: catalogue.total,
        year: Some(2020),
        rating: None,
        genres: vec![],
        status: catalogue.status.map(str::to_string),
    }
}

fn episode_input(id: i64) -> EpisodeInput {
    EpisodeInput {
        id,
        season_number: if id == 50 { 0 } else { 1 },
        episode_number: id,
        runtime: None,
        watched_at: None,
    }
}

fn media_summary<T: serde::de::DeserializeOwned>(id: i64, kind: MediaType) -> T {
    serde_json::from_value(serde_json::json!({
        "id": id,
        "mediaType": kind.as_db_str(),
        "title": format!("Title {id}"),
        "posterPath": null,
        "backdropPath": null,
        "year": 2020,
        "rating": null,
        "genres": [],
    }))
    .unwrap()
}

fn movie_input<T: serde::de::DeserializeOwned>(id: i64) -> T {
    serde_json::from_value(serde_json::json!({
        "id": id, "title": format!("Movie {id}"), "posterPath": null, "backdropPath": null,
        "runtime": 100, "year": 2020, "rating": null, "genres": []
    }))
    .unwrap()
}

fn pick_episodes(rng: &mut Rng) -> Vec<EpisodeInput> {
    let count = 1 + rng.below(4) as usize;
    let mut picked = BTreeSet::new();
    for _ in 0..count {
        picked.insert(EPISODES[rng.below(EPISODES.len() as u64) as usize]);
    }
    picked.into_iter().map(episode_input).collect()
}

async fn random_edit(
    device: &Device,
    rng: &mut Rng,
    catalogue: &mut [Catalogue; 3],
    tick: u32,
) -> String {
    let at = ts(tick);
    let index = rng.below(3) as usize;
    let series = SERIES[index];
    let movie = MOVIES[rng.below(2) as usize];
    match rng.below(20) {
        0..=4 => {
            let episodes = pick_episodes(rng);
            apply_episodes_impl(
                &device.pool,
                "default",
                &series_input(series, catalogue[index]),
                &episodes,
                true,
                &at,
            )
            .await
            .unwrap();
            format!(
                "watch series {series} {:?}",
                episodes.iter().map(|e| e.id).collect::<Vec<_>>()
            )
        }
        5..=7 => {
            let episodes = pick_episodes(rng);
            apply_episodes_impl(
                &device.pool,
                "default",
                &series_input(series, catalogue[index]),
                &episodes,
                false,
                &at,
            )
            .await
            .unwrap();
            format!(
                "unwatch series {series} {:?}",
                episodes.iter().map(|e| e.id).collect::<Vec<_>>()
            )
        }
        8 | 9 => {
            let watched = rng.below(2) == 0;
            toggle_movie_seen(movie_input(movie), watched, at, None, device.state())
                .await
                .unwrap();
            format!("movie {movie} watched={watched}")
        }
        10 | 11 => {
            // A refresh from TMDB's current word (the series page, the Hub).
            let known = catalogue[index];
            refresh_tracked_series_status(
                series,
                known.status.map(str::to_string),
                known.total,
                device.state(),
            )
            .await
            .unwrap();
            format!(
                "refresh series {series} {:?} {:?}",
                known.status, known.total
            )
        }
        12 => {
            let total = if rng.below(4) == 0 {
                None
            } else {
                Some(2 + rng.below(6) as i64)
            };
            let status = TMDB_STATUSES[rng.below(4) as usize];
            catalogue[index] = Catalogue { total, status };
            format!("catalogue series {series} {total:?} {status:?}")
        }
        13 => {
            let status =
                ["planned", "watching", "paused", "completed", "dropped"][rng.below(5) as usize];
            let is_movie = rng.below(3) == 0;
            let (id, kind) = if is_movie {
                (movie, MediaType::Movie)
            } else {
                (series, MediaType::Series)
            };
            save_library_item(
                media_summary(id, kind),
                Some(serde_json::from_value(serde_json::json!({ "status": status })).unwrap()),
                device.state(),
            )
            .await
            .unwrap();
            format!("manual {id} {kind:?} {status}")
        }
        14 => {
            let is_movie = rng.below(3) == 0;
            let (id, kind) = if is_movie {
                (movie, MediaType::Movie)
            } else {
                (series, MediaType::Series)
            };
            reset_library_status_to_auto(id, kind, device.state())
                .await
                .unwrap();
            format!("reset {id} {kind:?}")
        }
        15 => {
            let is_movie = rng.below(3) == 0;
            let (id, kind) = if is_movie {
                (movie, MediaType::Movie)
            } else {
                (series, MediaType::Series)
            };
            add_planned_library_item(media_summary(id, kind), device.state())
                .await
                .unwrap();
            format!("add {id} {kind:?}")
        }
        16 => {
            let is_movie = rng.below(3) == 0;
            let (id, kind) = if is_movie {
                (movie, MediaType::Movie)
            } else {
                (series, MediaType::Series)
            };
            remove_library_item(id, kind, device.state()).await.unwrap();
            format!("remove {id} {kind:?}")
        }
        _ => "noop".to_string(),
    }
}

async fn library(pool: &SqlitePool) -> Vec<(i64, String, String, String)> {
    sqlx::query_as(
        "SELECT media_id, media_type, status, status_origin FROM library_items
         WHERE profile_id = 'default' ORDER BY media_type, media_id",
    )
    .fetch_all(pool)
    .await
    .unwrap()
}

async fn watched_episodes(pool: &SqlitePool) -> Vec<(i64, i64)> {
    sqlx::query_as(
        "SELECT series_id, episode_id FROM episode_progress
         WHERE profile_id = 'default' AND watched = 1 ORDER BY series_id, episode_id",
    )
    .fetch_all(pool)
    .await
    .unwrap()
}

async fn seen_movies(pool: &SqlitePool) -> Vec<i64> {
    sqlx::query_scalar(
        "SELECT movie_id FROM seen_movies WHERE profile_id = 'default' ORDER BY movie_id",
    )
    .fetch_all(pool)
    .await
    .unwrap()
}

/// What the tables say is seen, in the shape `counted_seen_keys` answers.
async fn seen_keys_from_tables(pool: &SqlitePool) -> Vec<(String, i64, Option<i64>)> {
    let mut keys: Vec<(String, i64, Option<i64>)> = seen_movies(pool)
        .await
        .into_iter()
        .map(|id| ("movie".to_string(), id, None))
        .collect();
    keys.extend(
        watched_episodes(pool)
            .await
            .into_iter()
            .map(|(series, episode)| ("series".to_string(), series, Some(episode))),
    );
    keys.sort();
    keys
}

/// The status the facts imply, restated from docs/library-status.md.
async fn expected_auto_status(pool: &SqlitePool, id: i64, media_type: &str) -> &'static str {
    if media_type == "movie" {
        let seen: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM seen_movies WHERE profile_id = 'default' AND movie_id = ?1",
        )
        .bind(id)
        .fetch_one(pool)
        .await
        .unwrap();
        return if seen > 0 { "completed" } else { "planned" };
    }
    let watched: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM episode_progress
         WHERE profile_id = 'default' AND series_id = ?1 AND watched = 1 AND season_number > 0",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .unwrap();
    let cached: Option<(i64, Option<String>)> = sqlx::query_as(
        "SELECT total_episodes, status FROM tracked_series WHERE profile_id = 'default' AND series_id = ?1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .unwrap();
    let (total, status) = cached.unwrap_or((0, None));
    if watched < 1 {
        "planned"
    } else if total > 0
        && watched >= total
        && matches!(status.as_deref(), Some("Ended" | "Canceled"))
    {
        "completed"
    } else {
        "watching"
    }
}

async fn run(seed: u64, steps: u32, devices: usize, page: usize) {
    let mut rng = Rng::new(seed);
    seed_sim_uuids(seed);
    let mut server = FakeServer::default();
    let mut fleet = Vec::new();
    for _ in 0..devices {
        fleet.push(Device::new().await);
    }
    let mut catalogue = [Catalogue {
        total: Some(4),
        status: Some("Returning Series"),
    }; 3];
    let mut trace: Vec<String> = Vec::new();
    let mut tick = 0;
    for _ in 0..steps {
        let which = rng.below(devices as u64) as usize;
        if rng.below(4) == 0 {
            trace.push(format!("device {which}: sync"));
            sync_round(&fleet[which].pool, &mut server, page).await;
        } else {
            tick += 1;
            let what = random_edit(&fleet[which], &mut rng, &mut catalogue, tick).await;
            trace.push(format!("device {which}: {what}"));
        }
    }

    // Settle: rounds of every device syncing, until a whole round changes
    // nothing anywhere (bounded: a status two devices keep re-deciding would
    // never stop).
    let mut quiet = false;
    for round in 0..12 {
        let before = server.changes.len();
        for device in &fleet {
            sync_round(&device.pool, &mut server, page).await;
        }
        if server.changes.len() == before {
            quiet = true;
            trace.push(format!("quiet after {} rounds", round + 1));
            break;
        }
    }
    let fail = |message: String| -> ! {
        panic!("seed {seed}: {message}\ntrace:\n{}", trace.join("\n"));
    };
    if !quiet {
        fail("the devices never stopped sending each other changes".to_string());
    }

    let first_library = library(&fleet[0].pool).await;
    let first_episodes = watched_episodes(&fleet[0].pool).await;
    let first_movies = seen_movies(&fleet[0].pool).await;
    for (index, device) in fleet.iter().enumerate() {
        if outbox_len(&device.pool).await != 0 {
            fail(format!("device {index} still has a pending outbox"));
        }
        if index > 0 {
            if library(&device.pool).await != first_library {
                fail(format!(
                    "library differs between device 0 and {index}\n0: {first_library:?}\n{index}: {:?}",
                    library(&device.pool).await
                ));
            }
            if watched_episodes(&device.pool).await != first_episodes {
                fail(format!(
                    "watched episodes differ between device 0 and {index}"
                ));
            }
            if seen_movies(&device.pool).await != first_movies {
                fail(format!("seen movies differ between device 0 and {index}"));
            }
        }
        let counted = crate::stats::counted_seen_keys(&device.pool, "default").await;
        let tables = seen_keys_from_tables(&device.pool).await;
        if counted != tables {
            let only_stats: Vec<_> = counted.iter().filter(|k| !tables.contains(k)).collect();
            let only_tables: Vec<_> = tables.iter().filter(|k| !counted.contains(k)).collect();
            fail(format!(
                "device {index}: the statistics count what the tables do not say is seen\nonly in the statistics: {only_stats:?}\nonly in the tables: {only_tables:?}"
            ));
        }
        for (id, media_type, status, origin) in library(&device.pool).await {
            if origin == "auto" {
                let expected = expected_auto_status(&device.pool, id, &media_type).await;
                if status != expected {
                    fail(format!(
                        "device {index}: automatic {media_type} {id} is {status}, its facts say {expected}"
                    ));
                }
            }
        }
    }
}

/// `NAME=from-to` widens a sweep (`STATUS_SIM_RANGE=1-300 cargo test ...`).
fn seed_range(name: &str, default: (u64, u64)) -> (u64, u64) {
    std::env::var(name)
        .ok()
        .and_then(|value| {
            let (from, to) = value.split_once('-')?;
            Some((from.parse().ok()?, to.parse().ok()?))
        })
        .unwrap_or(default)
}

#[tokio::test]
async fn devices_driven_through_the_real_commands_converge_on_the_same_statuses() {
    let (from, to) = seed_range("STATUS_SIM_RANGE", (1, 20));
    for seed in from..=to {
        run(seed, 80, 2, 200).await;
        run(seed, 80, 2, 1 + seed as usize % 4).await;
    }
}

#[tokio::test]
async fn three_devices_driven_through_the_real_commands_converge_too() {
    let (from, to) = seed_range("STATUS_SIM_RANGE3", (200, 208));
    for seed in from..=to {
        run(seed, 90, 3, 200).await;
        run(seed, 90, 3, 2 + seed as usize % 3).await;
    }
}

/// Two devices record the same episode concurrently, one of them taking it
/// back: whatever order the events reach each device in, the statistics must
/// count what the progress tables hold.
#[tokio::test]
async fn concurrent_watch_and_unwatch_leave_the_statistics_agreeing_with_progress() {
    let (a, b) = (Device::new().await, Device::new().await);
    let mut server = FakeServer::default();
    let catalogue = Catalogue {
        total: Some(4),
        status: Some("Returning Series"),
    };
    let show = series_input(1, catalogue);
    let ep = [episode_input(3)];
    apply_episodes_impl(&a.pool, "default", &show, &ep, true, &ts(1))
        .await
        .unwrap();
    apply_episodes_impl(&b.pool, "default", &show, &ep, true, &ts(2))
        .await
        .unwrap();
    apply_episodes_impl(&b.pool, "default", &show, &ep, false, &ts(3))
        .await
        .unwrap();
    for _ in 0..3 {
        sync_round(&a.pool, &mut server, 200).await;
        sync_round(&b.pool, &mut server, 200).await;
    }
    for (name, device) in [("a", &a), ("b", &b)] {
        assert_eq!(
            crate::stats::counted_seen_keys(&device.pool, "default").await,
            seen_keys_from_tables(&device.pool).await,
            "device {name}"
        );
    }
}

/// `STATUS_SIM_SEED=7 STATUS_SIM_STEPS=80 STATUS_SIM_DEVICES=2 cargo test
/// replay_one_status_simulation -- --ignored`
#[tokio::test]
#[ignore]
async fn replay_one_status_simulation() {
    let read = |name: &str, default: u64| {
        std::env::var(name)
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(default)
    };
    run(
        read("STATUS_SIM_SEED", 1),
        read("STATUS_SIM_STEPS", 80) as u32,
        read("STATUS_SIM_DEVICES", 2) as usize,
        read("STATUS_SIM_PAGE", 200) as usize,
    )
    .await;
}
