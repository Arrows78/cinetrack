//! Long seeded sequences on one database holding several profiles: viewing,
//! library edits, TMDB refreshes, a TV Time import and its undo, rewatches,
//! switching the active profile and a backup export/restore in the middle.
//!
//! After every step, for every profile:
//!
//! - an automatic library status is the one its facts imply (restated here
//!   from `docs/library-status.md`, independently of `status.rs`);
//! - the statistics count exactly what the progress tables hold as seen;
//! - no row of the profiles that were not active moved;
//! - no library entry, progress row or event exists for a profile that does
//!   not exist (the foreign keys would refuse it, this checks the data the
//!   commands left behind, not only that they succeeded).

use std::collections::BTreeSet;

use serde_json::json;
use sqlx::SqlitePool;
use tauri::{Manager, State};

use super::status_transitions_tests::migrated_pool;
use crate::backup::{export_backup_data, import_backup_data};
use crate::integrations::tvtime::{
    import_movie_seen, import_series_progress, undo_tvtime_import_library,
};
use crate::library::{
    add_planned_library_item, remove_library_item, reset_library_status_to_auto, save_library_item,
};
use crate::models::MediaType;
use crate::progress::{
    refresh_tracked_series_status, rewatch_movie, toggle_episodes_watched, toggle_movie_seen,
};

const PROFILES: [&str; 3] = ["default", "alice", "bob"];
const SERIES: [i64; 3] = [1, 2, 3];
const MOVIES: [i64; 2] = [11, 12];
/// 1..=6 regular episodes of a season, 50 a special (season 0).
const EPISODES: [i64; 7] = [1, 2, 3, 4, 5, 6, 50];

struct Rng(u64);

impl Rng {
    fn new(seed: u64) -> Self {
        Self(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1)
    }
    fn below(&mut self, n: u64) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x % n
    }
}

#[derive(Clone, Copy)]
struct Catalogue {
    total: Option<i64>,
    status: Option<&'static str>,
}

fn ts(tick: u32) -> String {
    format!(
        "2026-02-{:02}T{:02}:{:02}:00.000Z",
        1 + tick / 1440,
        (tick / 60) % 24,
        tick % 60
    )
}

fn from_json<T: serde::de::DeserializeOwned>(value: serde_json::Value) -> T {
    serde_json::from_value(value).unwrap()
}

fn series_json(id: i64, catalogue: Catalogue) -> serde_json::Value {
    json!({
        "id": id, "title": format!("Series {id}"), "posterPath": null, "backdropPath": null,
        "runtime": 40, "numberOfEpisodes": catalogue.total, "year": 2020, "rating": null,
        "genres": [], "status": catalogue.status,
    })
}

fn episodes_json(ids: &[i64]) -> serde_json::Value {
    ids.iter()
        .map(|id| {
            json!({
                "id": id, "seasonNumber": if *id == 50 { 0 } else { 1 },
                "episodeNumber": id, "runtime": null, "watchedAt": null,
            })
        })
        .collect()
}

fn movie_json(id: i64) -> serde_json::Value {
    json!({
        "id": id, "title": format!("Movie {id}"), "posterPath": null, "backdropPath": null,
        "runtime": 100, "year": 2020, "rating": null, "genres": [],
    })
}

fn media_json(id: i64, kind: MediaType) -> serde_json::Value {
    json!({
        "id": id, "mediaType": kind.as_db_str(), "title": format!("Title {id}"),
        "posterPath": null, "backdropPath": null, "year": 2020, "rating": null, "genres": [],
    })
}

async fn activate(pool: &SqlitePool, profile: &str) {
    sqlx::query(
        "INSERT INTO preferences(key,value,updated_at) VALUES('activeProfileId',?1,'t')
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .bind(format!("\"{profile}\""))
    .execute(pool)
    .await
    .unwrap();
}

/// Every row of one profile, table by table, as JSON text (`insert_seq` left
/// out: a restore renumbers it).
async fn profile_rows(pool: &SqlitePool, profile: &str) -> String {
    let mut out = String::new();
    for table in crate::database::PROFILE_SCOPED_TABLES {
        let columns: Vec<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "SELECT name FROM pragma_table_info('{table}') WHERE name <> 'insert_seq' ORDER BY cid"
        )))
        .fetch_all(pool)
        .await
        .unwrap();
        let object = columns
            .iter()
            .map(|column| format!("'{column}', {column}"))
            .collect::<Vec<_>>()
            .join(", ");
        let rows: String = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "SELECT COALESCE(json_group_array(json_object({object})), '[]')
             FROM (SELECT * FROM {table} WHERE profile_id = ?1 ORDER BY {order})",
            order = if *table == "viewing_events" {
                "insert_seq"
            } else {
                "uuid"
            }
        )))
        .bind(profile)
        .fetch_one(pool)
        .await
        .unwrap();
        out.push_str(&format!("{table}: {rows}\n"));
    }
    out
}

async fn library(pool: &SqlitePool, profile: &str) -> Vec<(i64, String, String, String)> {
    sqlx::query_as(
        "SELECT media_id, media_type, status, status_origin FROM library_items
         WHERE profile_id = ?1 ORDER BY media_type, media_id",
    )
    .bind(profile)
    .fetch_all(pool)
    .await
    .unwrap()
}

async fn seen_keys(pool: &SqlitePool, profile: &str) -> Vec<(String, i64, Option<i64>)> {
    let mut keys: Vec<(String, i64, Option<i64>)> =
        sqlx::query_scalar::<_, i64>("SELECT movie_id FROM seen_movies WHERE profile_id = ?1")
            .bind(profile)
            .fetch_all(pool)
            .await
            .unwrap()
            .into_iter()
            .map(|id| ("movie".to_string(), id, None))
            .collect();
    let episodes: Vec<(i64, i64)> = sqlx::query_as(
        "SELECT series_id, episode_id FROM episode_progress WHERE profile_id = ?1 AND watched = 1",
    )
    .bind(profile)
    .fetch_all(pool)
    .await
    .unwrap();
    keys.extend(
        episodes
            .into_iter()
            .map(|(series, episode)| ("series".to_string(), series, Some(episode))),
    );
    keys.sort();
    keys
}

async fn expected_auto_status(
    pool: &SqlitePool,
    profile: &str,
    id: i64,
    media_type: &str,
) -> &'static str {
    if media_type == "movie" {
        let seen: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM seen_movies WHERE profile_id = ?1 AND movie_id = ?2",
        )
        .bind(profile)
        .bind(id)
        .fetch_one(pool)
        .await
        .unwrap();
        return if seen > 0 { "completed" } else { "planned" };
    }
    let watched: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM episode_progress
         WHERE profile_id = ?1 AND series_id = ?2 AND watched = 1 AND season_number > 0",
    )
    .bind(profile)
    .bind(id)
    .fetch_one(pool)
    .await
    .unwrap();
    let cached: Option<(i64, Option<String>)> = sqlx::query_as(
        "SELECT total_episodes, status FROM tracked_series WHERE profile_id = ?1 AND series_id = ?2",
    )
    .bind(profile)
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

async fn check_invariants(pool: &SqlitePool, seed: u64, step: usize, trace: &[String]) {
    let fail = |message: String| -> ! {
        panic!(
            "seed {seed}, after step {step}: {message}\ntrace:\n{}",
            trace.join("\n")
        )
    };
    for profile in PROFILES {
        let counted = crate::stats::counted_seen_keys(pool, profile).await;
        let tables = seen_keys(pool, profile).await;
        if counted != tables {
            fail(format!(
                "{profile}: the statistics count {counted:?}, the tables say {tables:?}"
            ));
        }
        for (id, media_type, status, origin) in library(pool, profile).await {
            if origin == "auto" {
                let expected = expected_auto_status(pool, profile, id, &media_type).await;
                if status != expected {
                    fail(format!(
                        "{profile}: automatic {media_type} {id} is {status}, its facts say {expected}"
                    ));
                }
            }
        }
    }
    for table in crate::database::PROFILE_SCOPED_TABLES {
        let orphans: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "SELECT COUNT(*) FROM {table} WHERE profile_id NOT IN (SELECT uuid FROM profiles)"
        )))
        .fetch_one(pool)
        .await
        .unwrap();
        if orphans != 0 {
            fail(format!(
                "{table} holds {orphans} rows of a profile that does not exist"
            ));
        }
    }
}

async fn run(seed: u64, steps: usize) {
    let pool = migrated_pool().await;
    let app = tauri::test::mock_app();
    app.manage(pool.clone());
    for profile in &PROFILES[1..] {
        sqlx::query("INSERT INTO profiles(uuid,name,created_at,updated_at) VALUES(?1,?1,'t','t')")
            .bind(profile)
            .execute(&pool)
            .await
            .unwrap();
    }
    let state = || -> State<'_, SqlitePool> { app.state() };

    let mut rng = Rng::new(seed);
    let mut active = "default";
    let mut catalogue = [Catalogue {
        total: Some(4),
        status: Some("Returning Series"),
    }; 3];
    let mut imports: Vec<serde_json::Value> = Vec::new();
    let mut trace: Vec<String> = Vec::new();

    for step in 0..steps {
        let at = ts(step as u32 + 1);
        let index = rng.below(3) as usize;
        let series = SERIES[index];
        let movie = MOVIES[rng.below(2) as usize];
        let is_movie = rng.below(3) == 0;
        let (title_id, kind) = if is_movie {
            (movie, MediaType::Movie)
        } else {
            (series, MediaType::Series)
        };
        let others: Vec<(&str, String)> = {
            let mut rows = Vec::new();
            for profile in PROFILES {
                if profile != active {
                    rows.push((profile, profile_rows(&pool, profile).await));
                }
            }
            rows
        };
        let mut restores = false;

        let what = match rng.below(26) {
            0..=4 => {
                let picked = pick(&mut rng);
                toggle_episodes_watched(
                    from_json(series_json(series, catalogue[index])),
                    from_json(episodes_json(&picked)),
                    true,
                    at,
                    None,
                    None,
                    state(),
                )
                .await
                .unwrap();
                format!("{active}: watch series {series} {picked:?}")
            }
            5..=7 => {
                let picked = pick(&mut rng);
                toggle_episodes_watched(
                    from_json(series_json(series, catalogue[index])),
                    from_json(episodes_json(&picked)),
                    false,
                    at,
                    None,
                    None,
                    state(),
                )
                .await
                .unwrap();
                format!("{active}: unwatch series {series} {picked:?}")
            }
            8 | 9 => {
                let watched = rng.below(2) == 0;
                toggle_movie_seen(from_json(movie_json(movie)), watched, at, None, state())
                    .await
                    .unwrap();
                format!("{active}: movie {movie} watched={watched}")
            }
            10 => {
                // A watch again: refused (conflict) when the movie is not seen.
                let outcome = rewatch_movie(from_json(movie_json(movie)), at, None, state()).await;
                format!("{active}: rewatch movie {movie} ok={}", outcome.is_ok())
            }
            11 | 12 => {
                let known = catalogue[index];
                refresh_tracked_series_status(
                    series,
                    known.status.map(str::to_string),
                    known.total,
                    state(),
                )
                .await
                .unwrap();
                format!("{active}: refresh series {series}")
            }
            13 => {
                let total = if rng.below(4) == 0 {
                    None
                } else {
                    Some(2 + rng.below(6) as i64)
                };
                let status = [
                    Some("Ended"),
                    Some("Returning Series"),
                    Some("Canceled"),
                    None,
                ][rng.below(4) as usize];
                catalogue[index] = Catalogue { total, status };
                format!("catalogue series {series} {total:?} {status:?}")
            }
            14 => {
                let status = ["planned", "watching", "paused", "completed", "dropped"]
                    [rng.below(5) as usize];
                save_library_item(
                    from_json(media_json(title_id, kind)),
                    Some(from_json(json!({ "status": status }))),
                    state(),
                )
                .await
                .unwrap();
                format!("{active}: manual {title_id} {kind:?} {status}")
            }
            15 => {
                reset_library_status_to_auto(title_id, kind, state())
                    .await
                    .unwrap();
                format!("{active}: reset {title_id} {kind:?}")
            }
            16 => {
                add_planned_library_item(from_json(media_json(title_id, kind)), state())
                    .await
                    .unwrap();
                format!("{active}: add {title_id} {kind:?}")
            }
            17 => {
                remove_library_item(title_id, kind, state()).await.unwrap();
                format!("{active}: remove {title_id} {kind:?}")
            }
            18 => {
                let count = rng.below(4) as i64;
                save_library_item(
                    from_json(media_json(title_id, kind)),
                    Some(from_json(json!({ "rewatchCount": count }))),
                    state(),
                )
                .await
                .unwrap();
                format!("{active}: rewatch count {title_id} {kind:?} = {count}")
            }
            19 | 20 => {
                active = PROFILES[rng.below(3) as usize];
                activate(&pool, active).await;
                format!("switch to {active}")
            }
            21 | 22 => {
                // A TV Time import of one series (old dates) or one movie.
                if rng.below(3) == 0 {
                    let outcome = import_movie_seen(
                        from_json(json!({
                            "movieId": movie, "title": format!("Movie {movie}"),
                            "posterPath": null, "backdropPath": null, "runtime": 100,
                            "watchedAt": "2019-05-01T00:00:00.000Z", "year": 2019,
                            "rating": null, "genres": [],
                        })),
                        state(),
                    )
                    .await
                    .unwrap();
                    if let Some(id) = outcome.created_library_item_id {
                        imports.push(json!({ "id": id, "importedAt": "2030-01-01T00:00:00.000Z" }));
                    }
                    format!("{active}: import movie {movie}")
                } else {
                    let picked = pick(&mut rng);
                    let outcome = import_series_progress(
                        from_json(series_json(
                            series,
                            Catalogue {
                                total: None,
                                status: None,
                            },
                        )),
                        from_json(
                            picked
                                .iter()
                                .map(|id| {
                                    json!({
                                        "episodeId": id,
                                        "seasonNumber": if *id == 50 { 0 } else { 1 },
                                        "episodeNumber": id,
                                        "watchedAt": "2019-06-01T00:00:00.000Z",
                                        "runtimeMinutes": 30,
                                    })
                                })
                                .collect::<serde_json::Value>(),
                        ),
                        state(),
                    )
                    .await
                    .unwrap();
                    if let Some(id) = outcome.created_library_item_id {
                        imports.push(json!({ "id": id, "importedAt": "2030-01-01T00:00:00.000Z" }));
                    }
                    format!("{active}: import series {series} {picked:?}")
                }
            }
            23 => {
                let items = std::mem::take(&mut imports);
                let count = items.len();
                undo_tvtime_import_library(from_json(json!(items)), state())
                    .await
                    .unwrap();
                format!("{active}: undo {count} imported entries")
            }
            24 => {
                restores = true;
                let before: Vec<_> = {
                    let mut all = Vec::new();
                    for profile in PROFILES {
                        all.push((
                            library(&pool, profile).await,
                            seen_keys(&pool, profile).await,
                        ));
                    }
                    all
                };
                let snapshot = export_backup_data(state()).await.unwrap();
                import_backup_data(snapshot, state()).await.unwrap();
                let mut after = Vec::new();
                for profile in PROFILES {
                    after.push((
                        library(&pool, profile).await,
                        seen_keys(&pool, profile).await,
                    ));
                }
                trace.push("backup export + restore".to_string());
                if before != after {
                    panic!(
                        "seed {seed}, step {step}: a restore changed the library or what is seen\nbefore {before:?}\nafter {after:?}\ntrace:\n{}",
                        trace.join("\n")
                    );
                }
                "restore done".to_string()
            }
            _ => "noop".to_string(),
        };
        trace.push(what);

        if !restores {
            for (profile, before) in &others {
                let after = profile_rows(&pool, profile).await;
                if *before != after {
                    panic!(
                        "seed {seed}, step {step}: profile {profile} changed while {active} was active\nbefore:\n{before}\nafter:\n{after}\ntrace:\n{}",
                        trace.join("\n")
                    );
                }
            }
        }
        check_invariants(&pool, seed, step, &trace).await;
    }
}

fn pick(rng: &mut Rng) -> Vec<i64> {
    let count = 1 + rng.below(4) as usize;
    let mut picked = BTreeSet::new();
    for _ in 0..count {
        picked.insert(EPISODES[rng.below(EPISODES.len() as u64) as usize]);
    }
    picked.into_iter().collect()
}

#[tokio::test]
async fn long_sequences_across_several_profiles_keep_every_profile_consistent_and_apart() {
    let (from, to) = std::env::var("PROFILE_SIM_RANGE")
        .ok()
        .and_then(|value| {
            let (from, to) = value.split_once('-')?;
            Some((from.parse().ok()?, to.parse().ok()?))
        })
        .unwrap_or((1u64, 12u64));
    for seed in from..=to {
        run(seed, 120).await;
    }
}
