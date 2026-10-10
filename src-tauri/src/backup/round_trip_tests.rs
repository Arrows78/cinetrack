//! Property-style round-trip tests for backup export -> import.
//!
//! A seeded generator fills a fully migrated database with realistic rows
//! (several profiles, every table, awkward text, `NULL`s everywhere they are
//! legal, timestamps that deliberately differ from each other), then checks
//! that exporting and importing that snapshot into a second database gives
//! back exactly the same rows. Comparison is done on a column-by-column dump
//! of each SQLite table rather than on the DTOs, so a column the DTO layer
//! forgets about shows up as a failure instead of passing silently.

use serde_json::Value;
use sqlx::SqlitePool;
use sqlx::sqlite::SqlitePoolOptions;

use super::repository::{PortableData, export_impl, import_impl};

struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        // SplitMix64: tiny, deterministic and well distributed.
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    fn below(&mut self, bound: u64) -> u64 {
        self.next() % bound
    }

    fn chance(&mut self, percent: u64) -> bool {
        self.below(100) < percent
    }

    fn pick<'a, T>(&mut self, items: &'a [T]) -> &'a T {
        &items[self.below(items.len() as u64) as usize]
    }

    /// A fixed-width ISO timestamp that sorts chronologically.
    fn timestamp(&mut self) -> String {
        format!(
            "20{:02}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
            20 + self.below(7),
            1 + self.below(12),
            1 + self.below(28),
            self.below(24),
            self.below(60),
            self.below(60),
            self.below(1000)
        )
    }
}

const TITLES: &[&str] = &[
    "Amélie",
    "It's \"quoted\" & <tagged>",
    "100% _wild_ \\ title",
    "日本語のタイトル",
    "Line\nbreak",
    "Emoji 🎬",
    "Plain",
];

async fn migrated_pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    crate::database::migrations::run_migrations(&pool)
        .await
        .unwrap();
    pool
}

async fn exec(pool: &SqlitePool, sql: &str, binds: &[Option<&str>]) {
    let mut query = sqlx::query(sqlx::AssertSqlSafe(sql.to_string()));
    for bind in binds {
        query = query.bind(*bind);
    }
    query.execute(pool).await.unwrap_or_else(|error| {
        panic!("seed statement failed: {error}\n{sql}");
    });
}

async fn seed(pool: &SqlitePool, seed: u64) {
    let mut rng = Rng(seed);
    let profiles = ["default", "profile-b", "profile-c"];

    for (index, profile) in profiles.iter().enumerate() {
        if index > 0 {
            let created = rng.timestamp();
            let updated = rng.timestamp();
            exec(
                pool,
                "INSERT INTO profiles (uuid, name, avatar, supabase_user_id, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6)",
                &[
                    Some(profile),
                    Some(&format!("Profile {index} é")),
                    if rng.chance(50) { Some("🦊") } else { None },
                    if index == 1 { Some("user_clerk_123") } else { None },
                    Some(&created),
                    Some(&updated),
                ],
            )
            .await;
        }
    }
    // A PIN on one profile: never exported (per-device), see the test below.
    exec(
        pool,
        "UPDATE profiles SET pin_hash = 'hash', pin_salt = 'salt' WHERE uuid = 'profile-b'",
        &[],
    )
    .await;

    let mut next_id = 0u64;
    let mut fresh = || {
        next_id += 1;
        format!("{seed}-{next_id}")
    };

    for profile in profiles {
        for media_id in 0..(1 + rng.below(8)) {
            let media_type = if rng.chance(50) { "movie" } else { "series" };
            let title = *rng.pick(TITLES);
            let created = rng.timestamp();
            let updated = rng.timestamp();
            let status = *rng.pick(&["planned", "watching", "paused", "completed", "dropped"]);
            let rating = if rng.chance(70) {
                Some(format!("{}.5", rng.below(10)))
            } else {
                None
            };
            let user_rating = if rng.chance(50) {
                Some(format!("{}.5", 1 + rng.below(9)))
            } else {
                None
            };
            let year = if rng.chance(70) {
                Some((1900 + rng.below(125)).to_string())
            } else {
                None
            };
            let started = if rng.chance(40) {
                Some(rng.timestamp())
            } else {
                None
            };
            let completed = if rng.chance(40) {
                Some(rng.timestamp())
            } else {
                None
            };
            let rewatch = rng.below(4).to_string();
            let favourite = if rng.chance(30) { "1" } else { "0" };
            let genres = if rng.chance(60) {
                "[\"Action\",\"Drame\"]"
            } else {
                "[]"
            };
            exec(
                pool,
                "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, poster_path, backdrop_path, year, rating, genres, status, favourite, user_rating, notes, tags, started_at, completed_at, rewatch_count, created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,CAST(?8 AS INTEGER),CAST(?9 AS REAL),?10,?11,CAST(?12 AS INTEGER),CAST(?13 AS REAL),?14,?15,?16,?17,CAST(?18 AS INTEGER),?19,?20)",
                &[
                    Some(&fresh()),
                    Some(profile),
                    Some(&media_id.to_string()),
                    Some(media_type),
                    Some(title),
                    if rng.chance(70) { Some("/p.jpg") } else { None },
                    if rng.chance(70) { Some("/b.jpg") } else { None },
                    year.as_deref(),
                    rating.as_deref(),
                    Some(genres),
                    Some(status),
                    Some(favourite),
                    user_rating.as_deref(),
                    if rng.chance(40) { Some("note\nwith \"quotes\" 🎬") } else { None },
                    Some(if rng.chance(50) { "[\"a\",\"b c\"]" } else { "[]" }),
                    started.as_deref(),
                    completed.as_deref(),
                    Some(&rewatch),
                    Some(&created),
                    Some(&updated),
                ],
            )
            .await;
        }

        for movie_id in 0..rng.below(6) {
            let watched = rng.timestamp();
            let created = rng.timestamp();
            let updated = rng.timestamp();
            exec(
                pool,
                "INSERT INTO seen_movies (uuid, profile_id, movie_id, title, poster_path, backdrop_path, watched_at, created_at, updated_at)
                 VALUES (?1,?2,CAST(?3 AS INTEGER),?4,?5,?6,?7,?8,?9)",
                &[
                    Some(&fresh()),
                    Some(profile),
                    Some(&movie_id.to_string()),
                    Some(*rng.pick(TITLES)),
                    if rng.chance(50) { Some("/p.jpg") } else { None },
                    None,
                    Some(&watched),
                    Some(&created),
                    Some(&updated),
                ],
            )
            .await;
        }

        for series_id in 0..(1 + rng.below(3)) {
            let created = rng.timestamp();
            let updated = rng.timestamp();
            let status = *rng.pick(&[None, Some("Ended"), Some("Returning Series")]);
            exec(
                pool,
                "INSERT INTO tracked_series (uuid, profile_id, series_id, title, poster_path, backdrop_path, total_episodes, status, created_at, updated_at)
                 VALUES (?1,?2,CAST(?3 AS INTEGER),?4,?5,?6,CAST(?7 AS INTEGER),?8,?9,?10)",
                &[
                    Some(&fresh()),
                    Some(profile),
                    Some(&series_id.to_string()),
                    Some(*rng.pick(TITLES)),
                    Some("/p.jpg"),
                    None,
                    Some(&rng.below(30).to_string()),
                    status,
                    Some(&created),
                    Some(&updated),
                ],
            )
            .await;
            for episode in 0..rng.below(6) {
                let watched = rng.chance(60);
                let watched_at = if watched { Some(rng.timestamp()) } else { None };
                let created = rng.timestamp();
                let updated = rng.timestamp();
                let rating = if rng.chance(30) {
                    Some((1 + rng.below(5)).to_string())
                } else {
                    None
                };
                exec(
                    pool,
                    "INSERT INTO episode_progress (uuid, profile_id, series_id, episode_id, season_number, episode_number, watched, watched_at, created_at, updated_at, rating)
                     VALUES (?1,?2,CAST(?3 AS INTEGER),CAST(?4 AS INTEGER),CAST(?5 AS INTEGER),CAST(?6 AS INTEGER),CAST(?7 AS INTEGER),?8,?9,?10,CAST(?11 AS INTEGER))",
                    &[
                        Some(&fresh()),
                        Some(profile),
                        Some(&series_id.to_string()),
                        Some(&(series_id * 1000 + episode).to_string()),
                        Some(&(1 + episode / 3).to_string()),
                        Some(&(1 + episode % 3).to_string()),
                        Some(if watched { "1" } else { "0" }),
                        watched_at.as_deref(),
                        Some(&created),
                        Some(&updated),
                        rating.as_deref(),
                    ],
                )
                .await;
            }
        }

        let actions = [
            "movie:watched",
            "movie:unwatched",
            "episode:watched",
            "episode:unwatched",
            "season:watched",
            "season:unwatched",
            "series:watched",
            "series:unwatched",
            "watchlist:add",
            "watchlist:remove",
            "library:update",
            "list:add",
            "list:remove",
        ];
        for _ in 0..rng.below(6) {
            let timestamp = rng.timestamp();
            // Rows written by the sync pull or by older builds can carry no
            // metadata at all: their owner is only known from `profile_id`.
            let metadata = match rng.below(3) {
                0 => None,
                1 => Some(format!("{{\"profileId\":\"{profile}\"}}")),
                _ => Some(format!("{{\"note\":\"n\",\"profileId\":\"{profile}\"}}")),
            };
            exec(
                pool,
                "INSERT INTO activity_log (uuid, profile_id, media_id, media_type, title, action, season_number, episode_number, episode_title, metadata, timestamp, created_at, updated_at)
                 VALUES (?1,?2,CAST(?3 AS INTEGER),?4,?5,?6,CAST(?7 AS INTEGER),CAST(?8 AS INTEGER),?9,?10,?11,?11,?11)",
                &[
                    Some(&fresh()),
                    Some(profile),
                    Some(&rng.below(100).to_string()),
                    Some(*rng.pick(&["movie", "series"])),
                    Some(*rng.pick(TITLES)),
                    Some(*rng.pick(&actions)),
                    if rng.chance(50) { Some("2") } else { None },
                    if rng.chance(50) { Some("5") } else { None },
                    if rng.chance(50) { Some("Pilot") } else { None },
                    metadata.as_deref(),
                    Some(&timestamp),
                ],
            )
            .await;
        }

        for _ in 0..rng.below(6) {
            let watched_at = rng.timestamp();
            let is_episode = rng.chance(50);
            exec(
                pool,
                "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, episode_id, season_number, episode_number, note, created_at)
                 VALUES (?1,?2,CAST(?3 AS INTEGER),?4,?5,?6,?7,CAST(?8 AS INTEGER),CAST(?9 AS INTEGER),CAST(?10 AS INTEGER),CAST(?11 AS INTEGER),?12,?7)",
                &[
                    Some(&fresh()),
                    Some(profile),
                    Some(&rng.below(100).to_string()),
                    Some(*rng.pick(&["movie", "series"])),
                    Some(*rng.pick(TITLES)),
                    Some(*rng.pick(&["watched", "unwatched", "rewatched"])),
                    Some(&watched_at),
                    if rng.chance(60) { Some("95") } else { None },
                    if is_episode { Some("42") } else { None },
                    if is_episode { Some("1") } else { None },
                    if is_episode { Some("2") } else { None },
                    if rng.chance(30) { Some("diary note 🎬") } else { None },
                ],
            )
            .await;
        }

        for list_index in 0..rng.below(3) {
            let list_id = fresh();
            let created = rng.timestamp();
            let updated = rng.timestamp();
            exec(
                pool,
                "INSERT INTO custom_lists (uuid, profile_id, name, description, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6)",
                &[
                    Some(&list_id),
                    Some(profile),
                    Some(&format!("List {list_index}")),
                    if rng.chance(50) { Some("desc") } else { None },
                    Some(&created),
                    Some(&updated),
                ],
            )
            .await;
            for position in 0..rng.below(5) {
                let added = rng.timestamp();
                let updated = rng.timestamp();
                exec(
                    pool,
                    "INSERT INTO custom_list_items (uuid, list_id, media_id, media_type, title, poster_path, position, added_at, updated_at)
                     VALUES (?1,?2,CAST(?3 AS INTEGER),?4,?5,?6,CAST(?7 AS INTEGER),?8,?9)",
                    &[
                        Some(&fresh()),
                        Some(&list_id),
                        Some(&position.to_string()),
                        Some("movie"),
                        Some(*rng.pick(TITLES)),
                        None,
                        Some(&position.to_string()),
                        Some(&added),
                        Some(&updated),
                    ],
                )
                .await;
            }
        }

        for media_id in 0..rng.below(4) {
            let created = rng.timestamp();
            let updated = rng.timestamp();
            exec(
                pool,
                "INSERT INTO availability_alerts (uuid, profile_id, media_id, media_type, title, region, provider_ids, enabled, created_at, updated_at)
                 VALUES (?1,?2,CAST(?3 AS INTEGER),'movie',?4,'FR','[8,337]',CAST(?5 AS INTEGER),?6,?7)",
                &[
                    Some(&fresh()),
                    Some(profile),
                    Some(&media_id.to_string()),
                    Some(*rng.pick(TITLES)),
                    Some(if rng.chance(50) { "1" } else { "0" }),
                    Some(&created),
                    Some(&updated),
                ],
            )
            .await;
        }

        for _ in 0..rng.below(3) {
            let created = rng.timestamp();
            let updated = rng.timestamp();
            exec(
                pool,
                "INSERT INTO smart_lists (uuid, profile_id, name, rules, created_at, updated_at) VALUES (?1,?2,'Smart',?3,?4,?5)",
                &[
                    Some(&fresh()),
                    Some(profile),
                    Some("{\"genre\":null,\"hasEpisodeWaiting\":false,\"status\":\"any\"}"),
                    Some(&created),
                    Some(&updated),
                ],
            )
            .await;
            exec(
                pool,
                "INSERT INTO saved_filters (uuid, profile_id, page, name, filters, created_at, updated_at) VALUES (?1,?2,'library','Filter',?3,?4,?5)",
                &[
                    Some(&fresh()),
                    Some(profile),
                    Some("{\"genres\":[\"Action\"],\"query\":\"x\"}"),
                    Some(&created),
                    Some(&updated),
                ],
            )
            .await;
        }

        for media_id in 0..rng.below(3) {
            let dismissed = rng.timestamp();
            let created = rng.timestamp();
            let updated = rng.timestamp();
            exec(
                pool,
                "INSERT INTO dismissed_recommendations (uuid, profile_id, media_id, media_type, title, poster_path, dismissed_at, created_at, updated_at)
                 VALUES (?1,?2,CAST(?3 AS INTEGER),'series',?4,NULL,?5,?6,?7)",
                &[
                    Some(&fresh()),
                    Some(profile),
                    Some(&media_id.to_string()),
                    Some(*rng.pick(TITLES)),
                    Some(&dismissed),
                    Some(&created),
                    Some(&updated),
                ],
            )
            .await;
        }
    }

    for media_id in 0..rng.below(4) {
        let checked = rng.timestamp();
        exec(
            pool,
            "INSERT INTO availability_snapshots (media_id, media_type, region, provider_ids, checked_at) VALUES (CAST(?1 AS INTEGER),'movie','FR','[8]',?2)",
            &[Some(&media_id.to_string()), Some(&checked)],
        )
        .await;
    }

    for (key, value) in [
        ("theme", "\"light\""),
        ("region", "\"FR\""),
        ("activeProfileId", "\"profile-b\""),
        ("preferredProviderIds", "[8,337]"),
        ("backupDirectory", "null"),
        ("onboardingCompleted", "true"),
    ] {
        exec(
            pool,
            "INSERT INTO preferences (key, value, updated_at) VALUES (?1,?2,'2026-01-01T00:00:00.000Z')",
            &[Some(key), Some(value)],
        )
        .await;
    }
}

/// Every table that a backup must restore, with the columns that a backup is
/// documented NOT to carry. Anything else must survive byte for byte.
///
/// - `uuid` of tables whose rows get a fresh identity on import (their DTO id
///   is not reused, see `import_impl`'s header).
/// - `pin_hash`/`pin_salt`: a PIN is a per-device secret, never exported.
/// - timestamps the portable DTOs have no field for (kept in this list so a
///   future change to the format shows up here).
const TABLES: &[(&str, &[&str])] = &[
    ("profiles", &["pin_hash", "pin_salt", "updated_at"]),
    ("library_items", &["uuid"]),
    ("seen_movies", &["uuid", "created_at", "updated_at"]),
    ("episode_progress", &["uuid"]),
    ("tracked_series", &["uuid"]),
    ("activity_log", &["created_at", "updated_at", "metadata"]),
    ("viewing_events", &["created_at"]),
    ("custom_lists", &[]),
    ("custom_list_items", &["uuid"]),
    ("availability_alerts", &["updated_at"]),
    ("availability_snapshots", &[]),
    ("smart_lists", &[]),
    ("saved_filters", &[]),
    ("dismissed_recommendations", &[]),
    ("preferences", &["updated_at"]),
];

async fn dump_table(pool: &SqlitePool, table: &str, ignored: &[&str]) -> Vec<String> {
    let columns: Vec<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT name FROM pragma_table_info('{table}')"
    )))
    .fetch_all(pool)
    .await
    .unwrap();
    let mut pairs = columns
        .iter()
        .filter(|column| !ignored.contains(&column.as_str()))
        .map(|column| format!("'{column}', \"{column}\""))
        .collect::<Vec<_>>();
    if table == "activity_log" {
        // `metadata.profileId` mirrors the `profile_id` column and is allowed
        // to be added or corrected by an export (see the invariant test
        // below); everything else in the blob must survive untouched.
        pairs.push(
            "'metadata_without_profile_id', json_remove(COALESCE(metadata, '{}'), '$.profileId')"
                .to_string(),
        );
    }
    let pairs = pairs.join(", ");
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT json_object({pairs}) AS row FROM {table} ORDER BY row"
    )))
    .fetch_all(pool)
    .await
    .unwrap()
}

async fn assert_same_content(source: &SqlitePool, restored: &SqlitePool, context: &str) {
    let mut differing = Vec::new();
    for (table, ignored) in TABLES {
        let before = dump_table(source, table, ignored).await;
        let after = dump_table(restored, table, ignored).await;
        if before != after {
            let first_difference = before
                .iter()
                .zip(after.iter())
                .find(|(left, right)| left != right)
                .map(|(left, right)| format!("{left}\n      vs {right}"))
                .unwrap_or_else(|| format!("{} rows vs {} rows", before.len(), after.len()));
            differing.push(format!("  {table}: {first_difference}"));
        }
    }
    assert!(
        differing.is_empty(),
        "{context}: tables differ after export -> import:\n{}",
        differing.join("\n")
    );
}

async fn export_to_json_and_back(snapshot: &PortableData) -> PortableData {
    // Same hop the real IPC makes: DTO -> JSON text -> DTO.
    serde_json::from_str(&serde_json::to_string(snapshot).unwrap()).unwrap()
}

#[tokio::test]
async fn export_then_import_restores_every_table_exactly_across_seeded_datasets() {
    for seed_value in 1..=12u64 {
        let source = migrated_pool().await;
        seed(&source, seed_value).await;

        let snapshot = export_to_json_and_back(&export_impl(&source).await.unwrap()).await;

        let restored = migrated_pool().await;
        import_impl(&restored, snapshot).await.unwrap();

        assert_same_content(&source, &restored, &format!("seed {seed_value}")).await;
    }
}

#[tokio::test]
async fn export_is_a_fixed_point_of_import_across_seeded_datasets() {
    for seed_value in 100..=106u64 {
        let source = migrated_pool().await;
        seed(&source, seed_value).await;

        let first = export_impl(&source).await.unwrap();
        let restored = migrated_pool().await;
        import_impl(&restored, export_to_json_and_back(&first).await)
            .await
            .unwrap();
        let second = export_impl(&restored).await.unwrap();

        // Fresh uuids are expected for the tables that do not reuse them, so
        // compare with those ids masked.
        fn masked(data: &PortableData) -> Value {
            let mut value = serde_json::to_value(data).unwrap();
            for key in [
                "library",
                "episodeProgress",
                "trackedSeries",
                "customListItems",
            ] {
                if let Some(rows) = value.get_mut(key).and_then(Value::as_array_mut) {
                    for row in rows.iter_mut() {
                        row.as_object_mut().unwrap().remove("id");
                    }
                    rows.sort_by_key(|row| row.to_string());
                }
            }
            for key in [
                "seenMovies",
                "history",
                "viewingEvents",
                "profiles",
                "customLists",
                "availabilitySnapshots",
                "availabilityAlerts",
                "smartLists",
                "savedFilters",
                "dismissedRecommendations",
            ] {
                if let Some(rows) = value.get_mut(key).and_then(Value::as_array_mut) {
                    rows.sort_by_key(|row| row.to_string());
                }
            }
            value
        }
        assert_eq!(
            masked(&first),
            masked(&second),
            "seed {seed_value}: a second export differs from the first"
        );
    }
}

#[tokio::test]
async fn importing_the_same_snapshot_twice_gives_the_same_database() {
    let source = migrated_pool().await;
    seed(&source, 7).await;
    let snapshot = export_to_json_and_back(&export_impl(&source).await.unwrap()).await;

    let target = migrated_pool().await;
    import_impl(&target, snapshot.clone()).await.unwrap();
    import_impl(&target, snapshot).await.unwrap();

    assert_same_content(&source, &target, "double import").await;
}

#[tokio::test]
async fn importing_into_a_database_full_of_other_data_leaves_nothing_of_the_old_content() {
    let source = migrated_pool().await;
    seed(&source, 21).await;
    let snapshot = export_to_json_and_back(&export_impl(&source).await.unwrap()).await;

    // A non-empty target holding different, overlapping business keys.
    let target = migrated_pool().await;
    seed(&target, 22).await;
    import_impl(&target, snapshot).await.unwrap();

    assert_same_content(&source, &target, "import over a non-empty database").await;
}

#[tokio::test]
async fn a_restored_history_row_keeps_the_mirrored_metadata_profile_id_in_sync() {
    let source = migrated_pool().await;
    seed(&source, 31).await;
    let snapshot = export_to_json_and_back(&export_impl(&source).await.unwrap()).await;

    let restored = migrated_pool().await;
    import_impl(&restored, snapshot).await.unwrap();

    let mismatched: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM activity_log WHERE json_extract(metadata, '$.profileId') IS NOT profile_id",
    )
    .fetch_one(&restored)
    .await
    .unwrap();
    assert_eq!(mismatched, 0);
}
