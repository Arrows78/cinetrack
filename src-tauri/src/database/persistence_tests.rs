//! "Do something, close the application, start it again, find everything
//! back." Every test here runs on a real SQLite *file* in a temporary
//! directory, drives the real Tauri commands, then reopens the file through
//! the real boot path (`init_pool_at`: open, migrate, verify) and compares
//! the whole state: every table row by row, and the answer of every read
//! command (library, progress, history, statistics, Watch Next sources,
//! lists, alerts, preferences, profiles).
//!
//! Three ways of "closing":
//! - a clean close (pool closed, WAL checkpointed);
//! - a hard kill (files copied while the pool is still open, so the copy holds
//!   exactly what a process killed at that instant leaves behind: the main
//!   file plus a non-empty `-wal`, with or without the `-shm`);
//! - a torn write (the last WAL frame cut in half): the last transaction must
//!   vanish entirely, never half of it.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use sqlx::SqlitePool;
use tauri::test::MockRuntime;
use tauri::{Manager, State};

use super::{BootRecovery, init_pool_at};
use crate::commands::{
    add_custom_list_item, add_planned_library_item, create_custom_list, create_profile,
    create_saved_filter, create_smart_list, dismiss_recommendation, get_activity_stats,
    get_best_recommendation_seed, get_episode_progress, get_library_extras,
    get_library_status_counts, get_monthly_recap, get_preferences, get_rating_distribution,
    get_rewatch_stats, get_stats_overview, get_watch_forecast, get_watch_milestones,
    import_movie_seen, import_series_progress, list_availability_alerts,
    list_availability_snapshots, list_completed_library_candidates, list_custom_list_items,
    list_custom_lists, list_dismissed_recommendations, list_history, list_library,
    list_library_distinct_tags, list_planned_library_candidates, list_profiles,
    list_recent_viewing_events, list_saved_filters, list_smart_lists, list_tracked_series,
    list_viewing_events_for_year, list_yearly_activity, refresh_tracked_series_status,
    remove_custom_list_item, remove_library_item, remove_planned_library_item, remove_smart_list,
    rename_saved_filter, save_availability_snapshot, save_library_item, set_active_profile,
    set_availability_alert, set_episode_rating, set_profile_pin, toggle_episodes_watched,
    toggle_movie_seen, undismiss_recommendation, update_preference, update_smart_list,
    verify_profile_pin,
};
use crate::models::MediaType;
use crate::preferences::PreferencesCache;

type TestApp = tauri::App<MockRuntime>;
type Snapshot = BTreeMap<String, Value>;

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/// A unique directory under the OS temp dir, removed on drop.
struct TempDir(PathBuf);

impl TempDir {
    fn new(label: &str) -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("cinetrack-persist-{label}-{unique}"));
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }

    fn db(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Starts the app the way boot does: real `init_pool_at`, fresh preference
/// cache (a restarted process has an empty one).
async fn boot(path: &Path) -> (TestApp, BootRecovery) {
    let (pool, recovery) = init_pool_at(path).await.unwrap();
    let app = tauri::test::mock_app();
    app.manage(pool);
    app.manage(PreferencesCache::default());
    (app, recovery)
}

fn pool_of(app: &TestApp) -> SqlitePool {
    app.state::<SqlitePool>().inner().clone()
}

fn db<'a>(app: &'a TestApp) -> State<'a, SqlitePool> {
    app.state()
}

fn cache<'a>(app: &'a TestApp) -> State<'a, PreferencesCache> {
    app.state()
}

async fn close(app: TestApp) {
    pool_of(&app).close().await;
}

fn j<T: DeserializeOwned>(value: Value) -> T {
    serde_json::from_value(value).unwrap()
}

fn assert_clean_boot(recovery: &BootRecovery, context: &str) {
    assert!(!recovery.blocked, "{context}: boot blocked");
    assert!(!recovery.recovered, "{context}: database was quarantined");
    assert!(recovery.quarantined_path.is_none(), "{context}");
    assert!(recovery.original_error.is_none(), "{context}");
}

fn media(id: i64, kind: &str) -> Value {
    json!({
        "id": id, "mediaType": kind, "title": format!("{kind} {id}"),
        "posterPath": format!("/p{id}.jpg"), "backdropPath": null,
        "year": 2000 + (id % 25), "rating": 6.5 + (id % 3) as f64,
        "genres": ["Drama", if id % 2 == 0 { "Comedy" } else { "Thriller" }],
    })
}

fn series_input(id: i64, total: i64, status: &str) -> Value {
    json!({
        "id": id, "title": format!("series {id}"), "posterPath": null, "backdropPath": null,
        "runtime": 40, "numberOfEpisodes": total, "year": 2019, "rating": 8.0,
        "genres": ["Drama"], "status": status,
    })
}

fn episode(id: i64, season: i64, number: i64) -> Value {
    json!({ "id": id, "seasonNumber": season, "episodeNumber": number, "runtime": 42 })
}

fn movie_input(id: i64) -> Value {
    json!({
        "id": id, "title": format!("movie {id}"), "posterPath": null, "backdropPath": null,
        "runtime": 110, "year": 2018, "rating": 7.2, "genres": ["Action"],
    })
}

async fn save(app: &TestApp, id: i64, kind: &str, patch: Value) {
    save_library_item(j(media(id, kind)), Some(j(patch)), db(app))
        .await
        .unwrap();
}

async fn watch_episodes(
    app: &TestApp,
    series: i64,
    total: i64,
    status: &str,
    episodes: Vec<Value>,
    watched: bool,
    at: &str,
) {
    toggle_episodes_watched(
        j(series_input(series, total, status)),
        j(Value::Array(episodes)),
        watched,
        at.to_string(),
        None,
        None,
        db(app),
    )
    .await
    .unwrap();
}

async fn watch_movie(app: &TestApp, id: i64, watched: bool, at: &str) {
    toggle_movie_seen(j(movie_input(id)), watched, at.to_string(), None, db(app))
        .await
        .unwrap();
}

/// Same-instant, same-answer arguments for every windowed statistic.
const WINDOW_START: &str = "2025-01-01T00:00:00.000Z";
const NOW: &str = "2026-03-01T00:00:00.000Z";

fn month_labels() -> Vec<String> {
    (1..=12).map(|month| format!("2026-{month:02}")).collect()
}

/// Every table row by row (all columns, `quote()`d so blobs and types
/// compare exactly) plus the answer of every read command for the active
/// profile. Equality of two snapshots is what "nothing was lost or changed"
/// means.
async fn snapshot(app: &TestApp) -> Snapshot {
    let pool = pool_of(app);
    let mut out = Snapshot::new();

    let tables: Vec<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    for table in tables {
        let columns: Vec<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "SELECT name FROM pragma_table_info('{table}')"
        )))
        .fetch_all(&pool)
        .await
        .unwrap();
        let projected = columns
            .iter()
            .map(|column| format!("'{column}', quote(\"{column}\")"))
            .collect::<Vec<_>>()
            .join(", ");
        let mut rows: Vec<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "SELECT json_object({projected}) FROM \"{table}\""
        )))
        .fetch_all(&pool)
        .await
        .unwrap();
        rows.sort();
        out.insert(format!("table:{table}"), json!(rows));
    }
    out.insert(
        "pragma:user_version".to_string(),
        json!(
            sqlx::query_scalar::<_, i64>("PRAGMA user_version")
                .fetch_one(&pool)
                .await
                .unwrap()
        ),
    );
    out.insert(
        "pragma:integrity_check".to_string(),
        json!(
            sqlx::query_scalar::<_, String>("PRAGMA integrity_check")
                .fetch_one(&pool)
                .await
                .unwrap()
        ),
    );

    macro_rules! read {
        ($name:expr, $call:expr) => {
            out.insert(
                $name.to_string(),
                serde_json::to_value($call.await.unwrap()).unwrap(),
            );
        };
    }

    read!("preferences", get_preferences(db(app), cache(app)));
    read!("profiles", list_profiles(db(app)));
    read!("library", list_library(None, db(app)));
    read!("library:counts", get_library_status_counts(db(app)));
    read!("library:tags", list_library_distinct_tags(db(app)));
    read!(
        "library:planned:movie",
        list_planned_library_candidates(MediaType::Movie, 50, db(app))
    );
    read!(
        "library:planned:series",
        list_planned_library_candidates(MediaType::Series, 50, db(app))
    );
    read!(
        "library:completed",
        list_completed_library_candidates(None, 50, db(app))
    );
    read!("library:seed", get_best_recommendation_seed(db(app)));
    read!("tracked_series", list_tracked_series(db(app)));
    for series in [9_i64, 10, 20] {
        read!(
            format!("episodes:{series}"),
            get_episode_progress(series, db(app))
        );
    }
    read!(
        "history",
        list_history(Some(1000), None, None, None, None, None, db(app))
    );
    read!(
        "events:recent",
        list_recent_viewing_events("2000-01-01T00:00:00.000Z".to_string(), db(app))
    );
    read!(
        "events:year",
        list_viewing_events_for_year(
            "2026-01-01T00:00:00.000Z".to_string(),
            "2027-01-01T00:00:00.000Z".to_string(),
            db(app)
        )
    );
    read!(
        "stats:overview",
        get_stats_overview(WINDOW_START.to_string(), month_labels(), 0, None, db(app))
    );
    read!("stats:yearly", list_yearly_activity(0, None, db(app)));
    read!(
        "stats:recap",
        get_monthly_recap(
            "2026-01".to_string(),
            "2026-01-01T00:00:00.000Z".to_string(),
            "2026-02-01T00:00:00.000Z".to_string(),
            0,
            None,
            db(app)
        )
    );
    read!(
        "stats:rewatch",
        get_rewatch_stats(WINDOW_START.to_string(), month_labels(), 0, None, db(app))
    );
    read!(
        "stats:ratings",
        get_rating_distribution(WINDOW_START.to_string(), 0, None, db(app))
    );
    read!("stats:milestones", get_watch_milestones(db(app)));
    read!(
        "stats:activity",
        get_activity_stats(WINDOW_START.to_string(), NOW.to_string(), 0, None, db(app))
    );
    read!("stats:extras", get_library_extras(db(app)));
    read!(
        "stats:forecast",
        get_watch_forecast(
            WINDOW_START.to_string(),
            "2026-01-01T00:00:00.000Z".to_string(),
            NOW.to_string(),
            db(app)
        )
    );
    read!("custom_lists", list_custom_lists(db(app)));
    for list in list_custom_lists(db(app)).await.unwrap() {
        read!(
            format!("custom_list_items:{}", list.name),
            list_custom_list_items(list.id.clone(), db(app))
        );
    }
    read!("smart_lists", list_smart_lists(db(app)));
    read!(
        "saved_filters",
        list_saved_filters("library".to_string(), db(app))
    );
    read!("alerts", list_availability_alerts(db(app)));
    read!("snapshots", list_availability_snapshots(db(app)));
    read!("dismissed", list_dismissed_recommendations(db(app)));

    out
}

#[track_caller]
fn assert_same(before: &Snapshot, after: &Snapshot, context: &str) {
    assert_eq!(
        before.keys().collect::<Vec<_>>(),
        after.keys().collect::<Vec<_>>(),
        "{context}: not the same set of tables/reads"
    );
    for (key, expected) in before {
        assert_eq!(expected, &after[key], "{context}: `{key}` changed");
    }
}

/// The state really contains the session: guards every test below against
/// passing on an empty database.
fn assert_not_vacuous(state: &Snapshot) {
    for (key, minimum) in [
        ("table:library_items", 8),
        ("table:episode_progress", 5),
        ("table:seen_movies", 2),
        ("table:viewing_events", 10),
        ("table:activity_log", 5),
        ("table:custom_lists", 2),
        ("table:custom_list_items", 2),
        ("table:smart_lists", 1),
        ("table:saved_filters", 1),
        ("table:availability_alerts", 1),
        ("table:availability_snapshots", 1),
        ("table:dismissed_recommendations", 1),
        ("table:preferences", 4),
        ("table:profiles", 2),
        ("table:sync_outbox", 5),
    ] {
        let rows = state[key].as_array().unwrap().len();
        assert!(rows >= minimum, "{key} has only {rows} rows (< {minimum})");
    }
    assert!(state["stats:overview"].to_string().len() > 200);
    assert!(!state["tracked_series"].as_array().unwrap().is_empty());
}

// ---------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------

/// A realistic first session on the default profile, plus a second profile
/// protected by a PIN. Returns the second profile's id.
async fn first_session(app: &TestApp) -> String {
    // Preferences.
    for (key, value) in [
        ("theme", json!("light")),
        ("accentColor", json!("teal")),
        ("language", json!("fr")),
        ("region", json!("FR")),
        ("reduceMotion", json!(true)),
        ("notifyHoursBefore", json!(6)),
    ] {
        update_preference(key.to_string(), value, db(app), cache(app))
            .await
            .unwrap();
    }

    // Library: rated, tagged, favourite, noted titles in every status.
    save(app, 55, "movie", json!({"status": "completed", "userRating": 8.5, "favourite": true, "tags": ["classic", "rewatch"], "notes": "great"})).await;
    save(
        app,
        56,
        "movie",
        json!({"status": "watching", "userRating": 6.0}),
    )
    .await;
    save(
        app,
        57,
        "movie",
        json!({"status": "dropped", "tags": ["meh"]}),
    )
    .await;
    save(
        app,
        9,
        "series",
        json!({"status": "watching", "userRating": 9.0, "tags": ["classic"]}),
    )
    .await;
    save(
        app,
        10,
        "series",
        json!({"status": "paused", "notes": "back later"}),
    )
    .await;
    save(app, 11, "series", json!({"status": "planned"})).await;
    assert!(
        add_planned_library_item(j(media(78, "movie")), db(app))
            .await
            .unwrap()
    );
    assert!(
        add_planned_library_item(j(media(79, "series")), db(app))
            .await
            .unwrap()
    );
    assert!(
        add_planned_library_item(j(media(80, "movie")), db(app))
            .await
            .unwrap()
    );
    assert!(
        remove_planned_library_item(80, MediaType::Movie, db(app))
            .await
            .unwrap()
    );
    save(app, 81, "movie", json!({"status": "planned"})).await;
    remove_library_item(81, MediaType::Movie, db(app))
        .await
        .unwrap();

    // Episodes: watch, partly unwatch, rate; a specials episode too.
    watch_episodes(
        app,
        9,
        4,
        "Ended",
        vec![episode(901, 1, 1), episode(902, 1, 2), episode(903, 1, 3)],
        true,
        "2026-01-05T20:00:00.000Z",
    )
    .await;
    watch_episodes(
        app,
        9,
        4,
        "Ended",
        vec![episode(902, 1, 2)],
        false,
        "2026-01-06T20:00:00.000Z",
    )
    .await;
    watch_episodes(
        app,
        9,
        4,
        "Ended",
        vec![episode(950, 0, 1)],
        true,
        "2026-01-07T20:00:00.000Z",
    )
    .await;
    set_episode_rating(9, 901, Some(4), db(app)).await.unwrap();
    watch_episodes(
        app,
        10,
        3,
        "Returning Series",
        vec![
            episode(1001, 1, 1),
            episode(1002, 1, 2),
            episode(1003, 1, 3),
        ],
        true,
        "2026-02-10T21:00:00.000Z",
    )
    .await;
    refresh_tracked_series_status(10, Some("Returning Series".to_string()), Some(5), db(app))
        .await
        .unwrap();

    // Movies: seen, seen then unseen, seen again.
    watch_movie(app, 55, true, "2026-01-12T22:00:00.000Z").await;
    watch_movie(app, 56, true, "2026-01-13T22:00:00.000Z").await;
    watch_movie(app, 56, false, "2026-01-14T22:00:00.000Z").await;
    watch_movie(app, 58, true, "2026-02-01T22:00:00.000Z").await;

    // Custom lists, smart list, saved filter.
    let favourites = create_custom_list(
        "Favourites".to_string(),
        Some("best of".to_string()),
        db(app),
    )
    .await
    .unwrap();
    create_custom_list("Weekend".to_string(), None, db(app))
        .await
        .unwrap();
    for (id, kind) in [(55, "movie"), (9, "series"), (78, "movie")] {
        add_custom_list_item(favourites.id.clone(), j(media(id, kind)), db(app))
            .await
            .unwrap();
    }
    remove_custom_list_item(favourites.id.clone(), 78, MediaType::Movie, db(app))
        .await
        .unwrap();
    let smart = create_smart_list(
        "Short comedies".to_string(),
        json!({"status": "any", "mediaType": "movie", "maxRuntime": 100}),
        db(app),
    )
    .await
    .unwrap();
    create_smart_list("Doomed".to_string(), json!({"status": "planned"}), db(app))
        .await
        .map(|doomed| doomed.id)
        .unwrap();
    update_smart_list(
        smart.id.clone(),
        "Short comedies (v2)".to_string(),
        json!({"status": "completed", "mediaType": "movie"}),
        db(app),
    )
    .await
    .unwrap();
    for list in list_smart_lists(db(app)).await.unwrap() {
        if list.name == "Doomed" {
            remove_smart_list(list.id, db(app)).await.unwrap();
        }
    }
    let filter = create_saved_filter(
        "library".to_string(),
        "Dramas".to_string(),
        json!({"genre": "Drama", "status": "watching"}),
        db(app),
    )
    .await
    .unwrap();
    rename_saved_filter(filter.id, "Dramas I follow".to_string(), db(app))
        .await
        .unwrap();

    // Availability alert + snapshot, dismissed recommendation.
    set_availability_alert(
        j(media(78, "movie")),
        "FR".to_string(),
        vec![8, 337],
        true,
        db(app),
    )
    .await
    .unwrap();
    save_availability_snapshot(
        j(json!({"mediaId": 78, "mediaType": "movie", "region": "FR", "providerIds": [8], "checkedAt": "2026-02-02T08:00:00.000Z"})),
        db(app),
    )
    .await
    .unwrap();
    dismiss_recommendation(j(media(999, "movie")), db(app))
        .await
        .unwrap();
    dismiss_recommendation(j(media(998, "series")), db(app))
        .await
        .unwrap();
    undismiss_recommendation(998, MediaType::Series, db(app))
        .await
        .unwrap();

    // TV Time import: a series with dated episodes, a movie.
    import_series_progress(
        j(series_input(20, 3, "Ended")),
        j(json!([
            {"episodeId": 2001, "seasonNumber": 1, "episodeNumber": 1, "watchedAt": "2024-05-01T20:00:00.000Z", "runtimeMinutes": 45},
            {"episodeId": 2002, "seasonNumber": 1, "episodeNumber": 2, "watchedAt": "2024-05-02T20:00:00.000Z", "runtimeMinutes": 45},
            {"episodeId": 2003, "seasonNumber": 1, "episodeNumber": 3, "watchedAt": "2024-05-03T20:00:00.000Z", "runtimeMinutes": 45},
        ])),
        db(app),
    )
    .await
    .unwrap();
    import_movie_seen(
        j(json!({"movieId": 60, "title": "Imported", "posterPath": null, "backdropPath": null, "runtime": 95, "watchedAt": "2023-12-24T19:00:00.000Z", "year": 2010, "rating": 7.7, "genres": ["Drama"]})),
        db(app),
    )
    .await
    .unwrap();

    // A second profile with a PIN lock; its own library entry.
    let kids = create_profile("Kids".to_string(), Some("🧒".to_string()), None, db(app))
        .await
        .unwrap();
    set_profile_pin(kids.id.clone(), "1234".to_string(), None, db(app))
        .await
        .unwrap();
    kids.id
}

/// A second session, run after a restart: more writes, plus repeated calls
/// that must be no-ops (no duplicate history).
async fn second_session(app: &TestApp) {
    let events_before: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM viewing_events")
        .fetch_one(&pool_of(app))
        .await
        .unwrap();

    // Repeating what is already true changes nothing.
    watch_episodes(
        app,
        10,
        3,
        "Returning Series",
        vec![episode(1001, 1, 1)],
        true,
        "2026-03-01T10:00:00.000Z",
    )
    .await;
    watch_movie(app, 55, true, "2026-03-01T10:00:00.000Z").await;
    let events_after: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM viewing_events")
        .fetch_one(&pool_of(app))
        .await
        .unwrap();
    assert_eq!(events_before, events_after, "a repeated call logged again");

    // New writes on top of the reopened file.
    watch_episodes(
        app,
        9,
        4,
        "Ended",
        vec![episode(902, 1, 2), episode(904, 1, 4)],
        true,
        "2026-03-02T20:00:00.000Z",
    )
    .await;
    save(
        app,
        11,
        "series",
        json!({"status": "watching", "userRating": 7.0, "tags": ["new"]}),
    )
    .await;
    watch_movie(app, 56, true, "2026-03-03T20:00:00.000Z").await;
    update_preference("theme".to_string(), json!("dark"), db(app), cache(app))
        .await
        .unwrap();
}

fn sidecar(path: &Path, suffix: &str) -> PathBuf {
    PathBuf::from(format!("{}{suffix}", path.display()))
}

fn wal_len(path: &Path) -> u64 {
    std::fs::metadata(sidecar(path, "-wal"))
        .map(|meta| meta.len())
        .unwrap_or(0)
}

/// Copies a live file-backed database the way a killed process leaves it:
/// the main file and its `-wal` (and, optionally, `-shm`) sidecar.
fn copy_db_files(from: &Path, to: &Path, with_shm: bool) {
    std::fs::copy(from, to).unwrap();
    std::fs::copy(sidecar(from, "-wal"), sidecar(to, "-wal")).unwrap();
    if with_shm {
        std::fs::copy(sidecar(from, "-shm"), sidecar(to, "-shm")).unwrap();
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[tokio::test]
async fn a_session_survives_a_clean_restart_and_keeps_working() {
    let dir = TempDir::new("clean");
    let path = dir.db("app.db");

    let (app, recovery) = boot(&path).await;
    assert_clean_boot(&recovery, "first boot");
    first_session(&app).await;
    let before = snapshot(&app).await;
    assert_not_vacuous(&before);
    close(app).await;

    let (app, recovery) = boot(&path).await;
    assert_clean_boot(&recovery, "second boot");
    assert_same(&before, &snapshot(&app).await, "after a clean restart");

    second_session(&app).await;
    let middle = snapshot(&app).await;
    assert_ne!(
        before["table:viewing_events"],
        middle["table:viewing_events"]
    );
    close(app).await;

    let (app, recovery) = boot(&path).await;
    assert_clean_boot(&recovery, "third boot");
    assert_same(&middle, &snapshot(&app).await, "after a second restart");
    close(app).await;
}

#[tokio::test]
async fn a_hard_kill_loses_nothing_that_was_committed() {
    for with_shm in [true, false] {
        let dir = TempDir::new("kill");
        let live_path = dir.db("live.db");
        let crash_dir = TempDir::new("kill-copy");
        let crashed_path = crash_dir.db("app.db");
        let context = format!("hard kill (shm kept: {with_shm})");

        // The live pool is never closed: only its files are copied, as the
        // OS would have left them after SIGKILL.
        let (app, _) = boot(&live_path).await;
        first_session(&app).await;
        let live = snapshot(&app).await;
        assert_not_vacuous(&live);
        assert!(
            wal_len(&live_path) > 0,
            "{context}: expected a non-empty WAL, the scenario would prove nothing"
        );
        copy_db_files(&live_path, &crashed_path, with_shm);

        let (recovered, recovery) = boot(&crashed_path).await;
        assert_clean_boot(&recovery, &context);
        assert_same(&live, &snapshot(&recovered).await, &context);

        // The recovered file is fully usable and survives yet another restart.
        second_session(&recovered).await;
        let after = snapshot(&recovered).await;
        close(recovered).await;
        let (reopened, recovery) = boot(&crashed_path).await;
        assert_clean_boot(&recovery, &context);
        assert_same(&after, &snapshot(&reopened).await, &context);
        close(reopened).await;

        close(app).await;
    }
}

#[tokio::test]
async fn a_dropped_pool_without_a_clean_close_loses_nothing() {
    let dir = TempDir::new("drop");
    let path = dir.db("app.db");

    let (app, _) = boot(&path).await;
    first_session(&app).await;
    let before = snapshot(&app).await;
    // Drop everything without `pool.close()`.
    drop(app);

    let (app, recovery) = boot(&path).await;
    assert_clean_boot(&recovery, "boot after a dropped pool");
    assert_same(&before, &snapshot(&app).await, "after a dropped pool");
    close(app).await;
}

#[tokio::test]
async fn a_torn_last_write_disappears_atomically() {
    let dir = TempDir::new("torn");
    let live_path = dir.db("live.db");
    let (app, _) = boot(&live_path).await;
    first_session(&app).await;
    let before_last = snapshot(&app).await;

    // One more command, one transaction: the one we then tear.
    watch_episodes(
        &app,
        9,
        4,
        "Ended",
        vec![episode(904, 1, 4)],
        true,
        "2026-03-05T20:00:00.000Z",
    )
    .await;
    let after_last = snapshot(&app).await;
    assert_ne!(before_last, after_last);

    for cut in [1_u64, 5, 700, 4000] {
        let crash_dir = TempDir::new("torn-copy");
        let crashed = crash_dir.db("app.db");
        copy_db_files(&live_path, &crashed, false);
        let wal = sidecar(&crashed, "-wal");
        let length = std::fs::metadata(&wal).unwrap().len();
        assert!(length > cut, "WAL shorter than the cut");
        std::fs::OpenOptions::new()
            .write(true)
            .open(&wal)
            .unwrap()
            .set_len(length - cut)
            .unwrap();

        let (recovered, recovery) = boot(&crashed).await;
        assert_clean_boot(&recovery, &format!("torn write (cut {cut})"));
        let state = snapshot(&recovered).await;
        assert_eq!(
            state["pragma:integrity_check"],
            json!("ok"),
            "cut {cut}: integrity"
        );
        // Either the whole last command or none of it: with a single
        // transaction in it, the previous complete state.
        assert!(
            state == before_last || state == after_last,
            "cut {cut}: neither the state before nor after the last command"
        );
        assert_eq!(state, before_last, "cut {cut}: the torn commit must vanish");
        close(recovered).await;
    }
    close(app).await;
}

#[tokio::test]
async fn profiles_pin_and_active_profile_survive_a_restart() {
    let dir = TempDir::new("profiles");
    let path = dir.db("app.db");

    let (app, _) = boot(&path).await;
    let kids = first_session(&app).await;
    // Switching to the locked profile needs the PIN.
    assert!(
        set_active_profile(kids.clone(), None, None, db(&app), cache(&app))
            .await
            .is_err()
    );
    assert!(
        set_active_profile(
            kids.clone(),
            None,
            Some("0000".to_string()),
            db(&app),
            cache(&app)
        )
        .await
        .is_err()
    );
    set_active_profile(
        kids.clone(),
        None,
        Some("1234".to_string()),
        db(&app),
        cache(&app),
    )
    .await
    .unwrap();
    // Its own data, invisible from the default profile.
    save(
        &app,
        700,
        "movie",
        json!({"status": "completed", "userRating": 5.0}),
    )
    .await;
    watch_movie(&app, 700, true, "2026-02-20T18:00:00.000Z").await;
    let kids_state = snapshot(&app).await;
    assert_eq!(kids_state["library"].as_array().unwrap().len(), 1);
    close(app).await;

    // Restart: the active profile, its data and its PIN are all still there.
    let (app, recovery) = boot(&path).await;
    assert_clean_boot(&recovery, "restart on the kids profile");
    assert_same(
        &kids_state,
        &snapshot(&app).await,
        "kids profile after restart",
    );
    let prefs = get_preferences(db(&app), cache(&app)).await.unwrap();
    assert_eq!(prefs.active_profile_id, kids);
    assert!(
        verify_profile_pin(kids.clone(), "1234".to_string(), db(&app))
            .await
            .unwrap()
    );
    assert!(
        !verify_profile_pin(kids.clone(), "4321".to_string(), db(&app))
            .await
            .unwrap()
    );
    let profiles = list_profiles(db(&app)).await.unwrap();
    assert!(
        profiles
            .iter()
            .any(|profile| profile.id == kids && profile.has_pin)
    );

    // Back to the default profile: its data is exactly what the first
    // session left, untouched by what the other profile did.
    set_active_profile("default".to_string(), None, None, db(&app), cache(&app))
        .await
        .unwrap();
    let default_state = snapshot(&app).await;
    assert!(default_state["library"].as_array().unwrap().len() >= 8);
    close(app).await;

    let (app, recovery) = boot(&path).await;
    assert_clean_boot(&recovery, "restart on the default profile");
    assert_same(
        &default_state,
        &snapshot(&app).await,
        "default profile after restart",
    );
    close(app).await;
}

#[tokio::test]
async fn a_failed_read_after_restart_does_not_reset_anything() {
    // The "read failed" case at the Rust boundary: an unreadable stored
    // preference value must not wipe the others, and a later write keeps
    // everything else. (The TypeScript side of this is covered in
    // src/features/preferences/__tests__/preferences-restart.test.tsx.)
    let dir = TempDir::new("badpref");
    let path = dir.db("app.db");
    let (app, _) = boot(&path).await;
    first_session(&app).await;
    sqlx::query("UPDATE preferences SET value = 'not json {' WHERE key = 'accentColor'")
        .execute(&pool_of(&app))
        .await
        .unwrap();
    let theme_before = get_preferences(db(&app), cache(&app)).await.unwrap().theme;
    close(app).await;

    let (app, _) = boot(&path).await;
    let prefs = get_preferences(db(&app), cache(&app)).await.unwrap();
    assert_eq!(prefs.theme, theme_before, "other preferences survive");
    assert_eq!(prefs.region, "FR");
    update_preference("region".to_string(), json!("BE"), db(&app), cache(&app))
        .await
        .unwrap();
    let raw: String = sqlx::query_scalar("SELECT value FROM preferences WHERE key = 'accentColor'")
        .fetch_one(&pool_of(&app))
        .await
        .unwrap();
    assert_eq!(
        raw, "not json {",
        "the unreadable value is not overwritten by a write elsewhere"
    );
    close(app).await;
}

// ---------------------------------------------------------------------------
// Random sequence with restarts in the middle
// ---------------------------------------------------------------------------

#[derive(Default)]
struct Model {
    episodes: BTreeSet<(i64, i64)>,
    movies: BTreeSet<i64>,
}

#[tokio::test]
async fn random_sequences_with_restarts_in_the_middle_stay_identical_across_each_restart() {
    const CATALOGUE: [(i64, i64, &str, [i64; 4]); 3] = [
        (9, 4, "Ended", [901, 902, 903, 904]),
        (10, 3, "Returning Series", [1001, 1002, 1003, 0]),
        (20, 2, "Ended", [2001, 2002, 0, 0]),
    ];
    const MOVIES: [i64; 3] = [55, 56, 57];
    const STATUSES: [&str; 5] = ["planned", "watching", "paused", "completed", "dropped"];

    for seed in [5_u64, 21, 404, 9001] {
        let dir = TempDir::new("random");
        let mut current = dir.db("run-0.db");
        let mut restarts = 0;
        let (mut app, _) = boot(&current).await;
        let list = create_custom_list("Random".to_string(), None, db(&app))
            .await
            .unwrap();

        let mut state = seed;
        let mut next = |bound: u64| {
            state = state
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            (state >> 33) % bound
        };
        let mut model = Model::default();

        for step in 0..160_u64 {
            let context = format!("seed {seed}, step {step}");
            let at = format!("2026-01-{:02}T{:02}:00:00.000Z", 1 + step / 24, step % 24);

            match next(11) {
                0..=2 => {
                    let (id, total, status, ids) = CATALOGUE[next(3) as usize];
                    let usable: Vec<i64> = ids.iter().copied().filter(|id| *id != 0).collect();
                    let picked: Vec<i64> = if next(2) == 0 {
                        vec![usable[next(usable.len() as u64) as usize]]
                    } else {
                        usable.clone()
                    };
                    let watched = next(3) != 0;
                    for episode_id in &picked {
                        if watched {
                            model.episodes.insert((id, *episode_id));
                        } else {
                            model.episodes.remove(&(id, *episode_id));
                        }
                    }
                    let episodes = picked
                        .iter()
                        .map(|episode_id| episode(*episode_id, 1, episode_id % 100))
                        .collect();
                    watch_episodes(&app, id, total, status, episodes, watched, &at).await;
                }
                3 => {
                    let id = MOVIES[next(3) as usize];
                    let watched = next(3) != 0;
                    if watched {
                        model.movies.insert(id);
                    } else {
                        model.movies.remove(&id);
                    }
                    watch_movie(&app, id, watched, &at).await;
                }
                4 | 5 => {
                    let (id, kind) = if next(3) == 0 {
                        (MOVIES[next(3) as usize], "movie")
                    } else {
                        (CATALOGUE[next(3) as usize].0, "series")
                    };
                    let rating = 1.0 + next(10) as f64;
                    save(
                        &app,
                        id,
                        kind,
                        json!({
                            "status": STATUSES[next(5) as usize],
                            "favourite": next(2) == 0,
                            "userRating": rating,
                            "tags": [format!("t{}", next(4))],
                            "notes": format!("note {step}"),
                        }),
                    )
                    .await;
                }
                6 => {
                    let id = 100 + next(6) as i64;
                    match next(3) {
                        0 => {
                            add_planned_library_item(j(media(id, "movie")), db(&app))
                                .await
                                .unwrap();
                        }
                        1 => {
                            remove_planned_library_item(id, MediaType::Movie, db(&app))
                                .await
                                .unwrap();
                        }
                        _ => remove_library_item(id, MediaType::Movie, db(&app))
                            .await
                            .unwrap(),
                    }
                }
                7 => {
                    let id = MOVIES[next(3) as usize];
                    if next(2) == 0 {
                        add_custom_list_item(list.id.clone(), j(media(id, "movie")), db(&app))
                            .await
                            .unwrap();
                    } else {
                        remove_custom_list_item(list.id.clone(), id, MediaType::Movie, db(&app))
                            .await
                            .unwrap();
                    }
                }
                8 => {
                    let id = 200 + next(4) as i64;
                    let region = ["FR", "BE", "CA"][next(3) as usize];
                    set_availability_alert(
                        j(media(id, "movie")),
                        region.to_string(),
                        vec![8],
                        next(2) == 0,
                        db(&app),
                    )
                    .await
                    .unwrap();
                }
                9 => {
                    let theme = ["dark", "light"][next(2) as usize];
                    update_preference("theme".to_string(), json!(theme), db(&app), cache(&app))
                        .await
                        .unwrap();
                    let id = 300 + next(3) as i64;
                    if next(2) == 0 {
                        dismiss_recommendation(j(media(id, "movie")), db(&app))
                            .await
                            .unwrap();
                    } else {
                        undismiss_recommendation(id, MediaType::Movie, db(&app))
                            .await
                            .unwrap();
                    }
                }
                _ => {
                    let (id, _, _, ids) = CATALOGUE[next(3) as usize];
                    if model.episodes.contains(&(id, ids[0])) {
                        set_episode_rating(id, ids[0], Some(1 + next(5) as i64), db(&app))
                            .await
                            .unwrap();
                    }
                }
            }

            // Seen state follows the model, before and after any restart.
            let check_model = |model: &Model, rows: Vec<(i64, i64)>, movies: Vec<i64>| {
                assert_eq!(rows.into_iter().collect::<BTreeSet<_>>(), model.episodes);
                assert_eq!(movies.into_iter().collect::<BTreeSet<_>>(), model.movies);
            };
            let read_seen = |app: &TestApp| {
                let pool = pool_of(app);
                async move {
                    let episodes: Vec<(i64, i64)> = sqlx::query_as(
                        "SELECT series_id, episode_id FROM episode_progress WHERE watched = 1",
                    )
                    .fetch_all(&pool)
                    .await
                    .unwrap();
                    let movies: Vec<i64> = sqlx::query_scalar("SELECT movie_id FROM seen_movies")
                        .fetch_all(&pool)
                        .await
                        .unwrap();
                    (episodes, movies)
                }
            };
            let (episodes, movies) = read_seen(&app).await;
            check_model(&model, episodes, movies);

            // Restart at random points: cleanly, or as a hard kill.
            if next(10) == 0 {
                restarts += 1;
                let before = snapshot(&app).await;
                let hard_kill = next(2) == 0;
                if hard_kill {
                    // The old pool is left alone while its files are copied;
                    // it is only dropped once the copy has been reopened.
                    let killed = dir.db(&format!("run-{restarts}.db"));
                    copy_db_files(&current, &killed, next(2) == 0);
                    let restarted = restart_at(&killed).await;
                    close(app).await;
                    app = restarted;
                    current = killed;
                } else {
                    close(app).await;
                    app = restart_at(&current).await;
                }
                let kind = if hard_kill {
                    "hard kill"
                } else {
                    "clean restart"
                };
                assert_same(
                    &before,
                    &snapshot(&app).await,
                    &format!("{context}: {kind}"),
                );
                let (episodes, movies) = read_seen(&app).await;
                check_model(&model, episodes, movies);
            }
        }
        assert!(restarts >= 5, "seed {seed}: only {restarts} restarts");
        close(app).await;
    }
}

async fn restart_at(path: &Path) -> TestApp {
    let (app, recovery) = boot(path).await;
    assert_clean_boot(&recovery, "restart");
    app
}
