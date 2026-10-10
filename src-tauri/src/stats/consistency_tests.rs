//! Cross-feature consistency under random action sequences.
//!
//! Every view of the same data (stats, milestones, forecast, library extras,
//! tracked series, history) must agree with a direct recount of the tables
//! after *every* step of a seeded random sequence — single and bulk episode
//! toggles, movie toggles, unwatch/rewatch, library saves and removals, and
//! a full backup export/restore in the middle. The recounts below are written
//! against the raw tables on purpose: they are the oracle, not a second copy
//! of the production queries.

use serde_json::json;
use sqlx::SqlitePool;
use sqlx::sqlite::SqlitePoolOptions;
use tauri::{Manager, State};

use crate::library::{list_library, remove_library_item};
use crate::models::MediaType;
use crate::progress::{EpisodeInput, SeriesInput};

const SINCE: &str = "2000-01-01T00:00:00.000Z";
const NOW: &str = "2026-06-01T00:00:00.000Z";

async fn migrated_pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(2)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    crate::database::migrations::run_migrations(&pool)
        .await
        .unwrap();
    pool
}

/// Small deterministic generator (same constants as the progress sequence
/// test) so a failing seed reproduces exactly.
struct Lcg(u64);

impl Lcg {
    fn next(&mut self, bound: u64) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        (self.0 >> 33) % bound
    }
}

struct Series {
    id: i64,
    status: &'static str,
    total: i64,
    /// Fallback runtime TMDB reports for the series as a whole.
    runtime: Option<i64>,
    episodes: Vec<EpisodeInput>,
}

fn episode(id: i64, season: i64, number: i64, runtime: Option<i64>) -> EpisodeInput {
    EpisodeInput {
        id,
        season_number: season,
        episode_number: number,
        runtime,
        watched_at: None,
    }
}

fn catalogue() -> Vec<Series> {
    vec![
        Series {
            id: 9,
            status: "Ended",
            total: 4,
            runtime: Some(30),
            // Mixed runtimes: known, unknown (falls back to the series'),
            // zero (TMDB's "unknown"), and a special.
            episodes: vec![
                episode(901, 1, 1, Some(47)),
                episode(902, 1, 2, None),
                episode(903, 1, 3, Some(0)),
                episode(904, 1, 4, Some(61)),
                episode(950, 0, 1, Some(12)),
            ],
        },
        Series {
            id: 10,
            status: "Returning Series",
            total: 3,
            runtime: None,
            // No runtime anywhere for the second one: NULL durations.
            episodes: vec![
                episode(1001, 1, 1, None),
                episode(1002, 1, 2, Some(25)),
                episode(1003, 1, 3, None),
            ],
        },
    ]
}

/// (movie id, runtime)
const MOVIES: [(i64, Option<i64>); 3] = [(55, Some(118)), (56, None), (57, Some(0))];
/// Titles that exist only in the library, never watched.
const LIBRARY_ONLY: [i64; 2] = [70, 71];
const GENRES: [&str; 4] = ["Drama", "Comedy", "Sci-Fi", "Horror"];

fn series_input(series: &Series) -> SeriesInput {
    serde_json::from_value(json!({
        "id": series.id,
        "title": format!("Series {}", series.id),
        "runtime": series.runtime,
        "numberOfEpisodes": series.total,
        "year": 2019,
        "rating": 8.0,
        "genres": ["Drama"],
        "status": series.status,
    }))
    .unwrap()
}

async fn scalar(pool: &SqlitePool, sql: impl AsRef<str>) -> i64 {
    sqlx::query_scalar::<_, Option<i64>>(sqlx::AssertSqlSafe(sql.as_ref().to_string()))
        .fetch_one(pool)
        .await
        .unwrap()
        .unwrap_or(0)
}

/// Sum of the duration of the most recent watch event of every title or
/// episode that is *currently seen* according to the progress tables — what
/// "minutes watched" must mean, independent of how the stats query finds it.
async fn active_minutes(pool: &SqlitePool, kind: &str) -> i64 {
    let (seen_clause, key_clause) = match kind {
        "movie" => (
            "SELECT movie_id AS media_id, NULL AS episode_id FROM seen_movies",
            "e.media_type = 'movie' AND e.media_id = s.media_id",
        ),
        _ => (
            "SELECT series_id AS media_id, episode_id FROM episode_progress WHERE watched = 1",
            "e.media_type = 'series' AND e.media_id = s.media_id AND e.episode_id = s.episode_id",
        ),
    };
    scalar(
        pool,
        &format!(
            "SELECT SUM((SELECT e.duration_minutes FROM viewing_events e
                         WHERE {key_clause} AND e.event_type IN ('watched','rewatched')
                         ORDER BY e.watched_at DESC, e.rowid DESC LIMIT 1))
             FROM ({seen_clause}) s"
        ),
    )
    .await
}

/// Every aggregate that claims to describe the same viewing state, checked
/// against raw-table recounts.
async fn assert_views_agree(app: &tauri::App<tauri::test::MockRuntime>, context: &str) {
    let pool: State<'_, SqlitePool> = app.state();
    let pool_ref: &SqlitePool = pool.inner();

    // --- Recounts straight from the tables -------------------------------
    let movies_seen = scalar(pool_ref, "SELECT COUNT(*) FROM seen_movies").await;
    let episodes_seen = scalar(
        pool_ref,
        "SELECT COUNT(*) FROM episode_progress WHERE watched = 1",
    )
    .await;
    let movie_minutes = active_minutes(pool_ref, "movie").await;
    let episode_minutes = active_minutes(pool_ref, "episode").await;
    let library_total = scalar(pool_ref, "SELECT COUNT(*) FROM library_items").await;
    let library_completed = scalar(
        pool_ref,
        "SELECT COUNT(*) FROM library_items WHERE status = 'completed'",
    )
    .await;
    let completed_series = scalar(
        pool_ref,
        "SELECT COUNT(*) FROM library_items WHERE status = 'completed' AND media_type = 'series'",
    )
    .await;

    // --- Stats overview ---------------------------------------------------
    let overview = crate::stats::get_stats_overview(SINCE.to_string(), vec![], 0, app.state())
        .await
        .unwrap();
    let totals = overview.totals;
    assert_eq!(totals.movies_watched, movies_seen, "{context}: movies");
    assert_eq!(
        totals.episodes_watched, episodes_seen,
        "{context}: episodes"
    );
    assert_eq!(
        totals.movie_minutes_watched, movie_minutes,
        "{context}: movie minutes"
    );
    assert_eq!(
        totals.episode_minutes_watched, episode_minutes,
        "{context}: episode minutes"
    );
    assert_eq!(
        totals.minutes_watched,
        movie_minutes + episode_minutes,
        "{context}: total minutes == sum of the active events' durations"
    );
    assert_eq!(
        totals.completed_series, completed_series,
        "{context}: completed series"
    );
    let expected_percent = if library_total == 0 {
        0
    } else {
        ((library_completed as f64 / library_total as f64) * 100.0).round() as i64
    };
    assert_eq!(
        totals.library_completion_percent, expected_percent,
        "{context}: completion percent"
    );
    assert!(
        (0..=100).contains(&totals.library_completion_percent),
        "{context}: percent out of range"
    );

    // --- Milestones mirror the same totals --------------------------------
    let milestones = crate::stats::get_watch_milestones(app.state())
        .await
        .unwrap();
    for milestone in &milestones {
        let expected = match milestone.id.split('-').next().unwrap() {
            "episodes" => episodes_seen,
            "movies" => movies_seen,
            "hours" => (movie_minutes + episode_minutes) / 60,
            "series" => completed_series,
            other => panic!("unexpected milestone family {other}"),
        };
        assert_eq!(
            milestone.current_value, expected,
            "{context}: milestone {}",
            milestone.id
        );
        assert_eq!(
            milestone.achieved,
            expected >= milestone.threshold,
            "{context}: milestone {} achieved flag",
            milestone.id
        );
        // Series milestones date from `completed_at`, which a manual status
        // edit may leave empty; the event-based ones always have a date.
        if !milestone.id.starts_with("series-") {
            assert_eq!(
                milestone.achieved_at.is_some(),
                milestone.achieved,
                "{context}: milestone {} date presence",
                milestone.id
            );
        }
    }

    // --- Tracked series, forecast backlog --------------------------------
    let tracked = crate::progress::list_tracked_series(app.state())
        .await
        .unwrap();
    let mut backlog = 0;
    for item in &tracked {
        let regular_seen = scalar(
            pool_ref,
            &format!(
                "SELECT COUNT(*) FROM episode_progress
                 WHERE series_id = {} AND watched = 1 AND season_number > 0",
                item.series_id
            ),
        )
        .await;
        assert_eq!(
            item.watched_episodes, regular_seen,
            "{context}: tracked series {} watched count",
            item.series_id
        );
        backlog += (item.total_episodes - regular_seen).max(0);
    }
    let forecast = crate::stats::get_watch_forecast(
        SINCE.to_string(),
        SINCE.to_string(),
        NOW.to_string(),
        app.state(),
    )
    .await
    .unwrap();
    assert_eq!(forecast.backlog_episodes, backlog, "{context}: backlog");
    assert!(forecast.backlog_minutes >= 0, "{context}: backlog minutes");

    // --- Library extras ---------------------------------------------------
    let rows: Vec<(String, Option<f64>)> =
        sqlx::query_as("SELECT genres, user_rating FROM library_items")
            .fetch_all(pool_ref)
            .await
            .unwrap();
    let mut genre_counts = std::collections::BTreeMap::<String, i64>::new();
    let mut ratings = Vec::new();
    for (genres, rating) in rows {
        for genre in serde_json::from_str::<Vec<String>>(&genres).unwrap() {
            *genre_counts.entry(genre).or_default() += 1;
        }
        ratings.extend(rating);
    }
    let extras = crate::stats::get_library_extras(app.state()).await.unwrap();
    for genre in &extras.favourite_genres {
        assert_eq!(
            Some(&genre.count),
            genre_counts.get(&genre.name),
            "{context}: favourite genre {}",
            genre.name
        );
    }
    assert_eq!(
        extras.favourite_genres.len(),
        genre_counts.len().min(8),
        "{context}: favourite genre list length"
    );
    match (extras.average_user_rating, ratings.is_empty()) {
        (None, true) => {}
        (Some(average), false) => {
            let expected = ratings.iter().sum::<f64>() / ratings.len() as f64;
            assert!(
                (average - expected).abs() < 1e-9,
                "{context}: average rating {average} vs {expected}"
            );
        }
        other => panic!("{context}: average rating presence mismatch {other:?}"),
    }

    // --- Yearly activity is the historical diary: it must add up to the ---
    // --- watch events actually logged, minute for minute. ------------------
    let yearly = crate::stats::list_yearly_activity(0, app.state())
        .await
        .unwrap();
    assert_eq!(
        yearly.iter().map(|y| y.movies_watched).sum::<i64>(),
        scalar(
            pool_ref,
            "SELECT COUNT(*) FROM viewing_events
             WHERE event_type IN ('watched','rewatched') AND media_type = 'movie'"
        )
        .await,
        "{context}: yearly movie events"
    );
    assert_eq!(
        yearly.iter().map(|y| y.minutes_watched).sum::<i64>(),
        scalar(
            pool_ref,
            "SELECT SUM(duration_minutes) FROM viewing_events
             WHERE event_type IN ('watched','rewatched')"
        )
        .await,
        "{context}: yearly minutes"
    );

    // --- History and the watch log describe the same movie transitions ----
    for (action, event_type) in [
        ("movie:watched", "watched"),
        ("movie:unwatched", "unwatched"),
    ] {
        let history = scalar(
            pool_ref,
            &format!("SELECT COUNT(*) FROM activity_log WHERE action = '{action}'"),
        )
        .await;
        let events = scalar(
            pool_ref,
            &format!(
                "SELECT COUNT(*) FROM viewing_events
                 WHERE media_type = 'movie' AND event_type = '{event_type}'"
            ),
        )
        .await;
        assert_eq!(history, events, "{context}: history vs events for {action}");
    }
}

fn media_input(id: i64, media_type: &str, genres: &[&str]) -> serde_json::Value {
    json!({
        "id": id,
        "mediaType": media_type,
        "title": format!("Title {id}"),
        "posterPath": null,
        "backdropPath": null,
        "year": 2020,
        "rating": 7.0,
        "genres": genres,
    })
}

#[tokio::test]
async fn random_action_sequences_keep_every_aggregate_equal_to_a_recount_of_the_tables() {
    let catalogue = catalogue();

    for seed in [3_u64, 11, 97, 2026, 31337] {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool.clone());
        let mut rng = Lcg(seed);

        assert_views_agree(&app, &format!("seed {seed}, empty")).await;
        let mut exercised = std::collections::BTreeMap::<String, u32>::new();

        for step in 0..90_u64 {
            let at = format!(
                "2026-01-{:02}T{:02}:{:02}:00.000Z",
                1 + step / 1440,
                (step / 60) % 24,
                step % 60
            );
            let watched = rng.next(3) != 0;
            let action;
            match rng.next(10) {
                // One episode, or a whole season/series mark.
                0..=3 => {
                    let series = &catalogue[rng.next(catalogue.len() as u64) as usize];
                    let picked: Vec<EpisodeInput> = if rng.next(2) == 0 {
                        vec![
                            series.episodes[rng.next(series.episodes.len() as u64) as usize]
                                .clone(),
                        ]
                    } else {
                        series.episodes.clone()
                    };
                    action = format!("episodes of {} watched={watched}", series.id);
                    crate::progress::toggle_episodes_watched(
                        series_input(series),
                        picked,
                        watched,
                        at.clone(),
                        None,
                        None,
                        app.state(),
                    )
                    .await
                    .unwrap();
                }
                // A movie toggle (unwatch and rewatch included).
                4..=5 => {
                    let (id, runtime) = MOVIES[rng.next(MOVIES.len() as u64) as usize];
                    action = format!("movie {id} watched={watched}");
                    crate::progress::toggle_movie_seen(
                        serde_json::from_value(json!({
                            "id": id,
                            "title": format!("Movie {id}"),
                            "runtime": runtime,
                            "year": 2020,
                            "rating": 7.5,
                            "genres": [GENRES[(id % 4) as usize]],
                        }))
                        .unwrap(),
                        watched,
                        at.clone(),
                        None,
                        app.state(),
                    )
                    .await
                    .unwrap();
                }
                // A library edit: rating (or none), genres, status.
                6..=7 => {
                    let id = LIBRARY_ONLY[rng.next(2) as usize];
                    let genres = [GENRES[rng.next(4) as usize], GENRES[rng.next(4) as usize]];
                    let rating = match rng.next(3) {
                        0 => json!(null),
                        _ => json!((1 + rng.next(10)) as f64),
                    };
                    let status =
                        ["planned", "watching", "completed", "dropped"][rng.next(4) as usize];
                    action = format!("save library {id} {status} rating {rating}");
                    crate::library::save_library_item(
                        serde_json::from_value(media_input(id, "movie", &genres)).unwrap(),
                        Some(
                            serde_json::from_value(
                                json!({ "status": status, "userRating": rating }),
                            )
                            .unwrap(),
                        ),
                        app.state(),
                    )
                    .await
                    .unwrap();
                }
                // Deleting a title from the library (progress is kept).
                8 => {
                    let candidates: Vec<(i64, MediaType)> = list_library(None, app.state())
                        .await
                        .unwrap()
                        .into_iter()
                        .map(|item| (item.media_id, item.media_type))
                        .collect();
                    if candidates.is_empty() {
                        continue;
                    }
                    let (id, media_type) = candidates[rng.next(candidates.len() as u64) as usize];
                    action = format!("remove library {id}");
                    remove_library_item(id, media_type, app.state())
                        .await
                        .unwrap();
                }
                // A full backup export followed by a restore of it.
                _ => {
                    action = "export + restore".to_string();
                    let snapshot = crate::backup::export_backup_data(app.state())
                        .await
                        .unwrap();
                    crate::backup::import_backup_data(snapshot, app.state())
                        .await
                        .unwrap();
                }
            }

            *exercised
                .entry(action.split_whitespace().next().unwrap_or("").to_string())
                .or_default() += 1;
            assert_views_agree(&app, &format!("seed {seed}, step {step} ({action})")).await;
        }

        // The sequence must actually have reached every kind of action and
        // left something to count, or the equalities above prove nothing.
        for kind in ["episodes", "movie", "save", "remove", "export"] {
            assert!(
                exercised.get(kind).copied().unwrap_or(0) > 0,
                "seed {seed}: no `{kind}` step was drawn ({exercised:?})"
            );
        }
        let minutes: i64 = scalar(&pool, "SELECT SUM(duration_minutes) FROM viewing_events").await;
        assert!(minutes > 0, "seed {seed}: no runtime was ever logged");
    }
}

/// Confirmed inconsistency, left ignored until the product rule is decided:
/// the stats read "seen" from the latest event by `watched_at`, but a TV Time
/// import writes its events at the *original* watch date. Unwatching a movie
/// and then importing a history that predates the unwatch leaves the movie
/// seen (progress tables, Library, Watch Next) yet not counted by the stats,
/// milestones and minutes. Either the import must skip titles the user
/// explicitly unwatched, or "seen" for stats must come from the progress
/// tables — a product decision, so no behaviour is changed here.
#[tokio::test]
#[ignore = "needs a product decision: should a TV Time import override an explicit unwatch?"]
async fn an_import_older_than_an_unwatch_leaves_progress_and_stats_in_agreement() {
    let pool = migrated_pool().await;
    let app = tauri::test::mock_app();
    app.manage(pool.clone());

    let movie = |runtime: i64| -> serde_json::Value {
        json!({ "id": 55, "title": "Movie 55", "runtime": runtime, "year": 2020, "rating": 7.5, "genres": ["Drama"] })
    };
    crate::progress::toggle_movie_seen(
        serde_json::from_value(movie(100)).unwrap(),
        true,
        "2026-03-01T10:00:00.000Z".to_string(),
        None,
        app.state(),
    )
    .await
    .unwrap();
    crate::progress::toggle_movie_seen(
        serde_json::from_value(movie(100)).unwrap(),
        false,
        "2026-03-02T10:00:00.000Z".to_string(),
        None,
        app.state(),
    )
    .await
    .unwrap();
    crate::integrations::tvtime::import_movie_seen(
        serde_json::from_value(json!({
            "movieId": 55, "title": "Movie 55", "runtime": 100, "watchedAt": "2020-01-01T00:00:00.000Z",
        }))
        .unwrap(),
        app.state(),
    )
    .await
    .unwrap();

    assert_views_agree(&app, "import older than an unwatch").await;
}
