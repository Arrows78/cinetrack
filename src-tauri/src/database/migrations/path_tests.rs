//! Upgrade-path tests: a database created at an old schema version, filled
//! with seeded realistic data, must reach the latest version without losing a
//! row, a column value, a constraint or an index — and an upgrade cut short
//! anywhere must leave the file usable.

use sqlx::SqlitePool;
use sqlx::sqlite::SqlitePoolOptions;

use super::*;

struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
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

async fn pool() -> SqlitePool {
    SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap()
}

async fn run(pool: &SqlitePool, sql: &str) {
    sqlx::query(sqlx::AssertSqlSafe(sql.to_string()))
        .execute(pool)
        .await
        .unwrap_or_else(|error| panic!("statement failed: {error}\n{sql}"));
}

async fn user_version(pool: &SqlitePool) -> i64 {
    sqlx::query_scalar("PRAGMA user_version")
        .fetch_one(pool)
        .await
        .unwrap()
}

/// Tables, indexes and triggers (name, owner table, whitespace-normalised
/// SQL) — what "the same schema" means.
async fn schema_fingerprint(pool: &SqlitePool) -> Vec<String> {
    let rows: Vec<(String, String, String, Option<String>)> = sqlx::query_as(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
    )
    .fetch_all(pool)
    .await
    .unwrap();
    rows.into_iter()
        .map(|(kind, name, table, sql)| {
            let sql = sql
                .unwrap_or_default()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
            format!("{kind}|{name}|{table}|{sql}")
        })
        .collect()
}

async fn table_names(pool: &SqlitePool) -> Vec<String> {
    sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .fetch_all(pool)
    .await
    .unwrap()
}

async fn columns(pool: &SqlitePool, table: &str) -> Vec<String> {
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT name FROM pragma_table_info('{table}') ORDER BY cid"
    )))
    .fetch_all(pool)
    .await
    .unwrap()
}

/// One JSON object per row holding the given columns, sorted.
async fn dump(pool: &SqlitePool, table: &str, wanted: &[String]) -> Vec<String> {
    let pairs = wanted
        .iter()
        .map(|column| format!("'{column}', \"{column}\""))
        .collect::<Vec<_>>()
        .join(", ");
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT json_object({pairs}) AS row FROM {table} ORDER BY row"
    )))
    .fetch_all(pool)
    .await
    .unwrap()
}

type Snapshot = Vec<(String, Vec<String>, Vec<String>)>;

/// Every table's current columns and rows.
async fn snapshot(pool: &SqlitePool) -> Snapshot {
    let mut all = Vec::new();
    for table in table_names(pool).await {
        let cols = columns(pool, &table).await;
        let rows = dump(pool, &table, &cols).await;
        all.push((table, cols, rows));
    }
    all
}

async fn assert_healthy(pool: &SqlitePool, context: &str) {
    let violations: Vec<String> =
        sqlx::query_scalar("SELECT \"table\" FROM pragma_foreign_key_check")
            .fetch_all(pool)
            .await
            .unwrap();
    assert!(
        violations.is_empty(),
        "{context}: dangling references in {violations:?}"
    );
    let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(pool)
        .await
        .unwrap();
    assert_eq!(integrity, "ok", "{context}");
}

/// Realistic data at the very first schema (version 1): several profiles, the
/// `rewatching` status (removed by migration 12), a `watchlist_items` table
/// (merged by migration 10) overlapping the library on some keys, duplicate
/// availability alerts (deduplicated by migration 9), a legacy preference.
async fn seed_version_one(pool: &SqlitePool, seed: u64) {
    let mut rng = Rng(seed);
    let profiles = ["default", "p2", "p3"];
    for profile in &profiles[1..] {
        run(
            pool,
            &format!(
                "INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('{profile}', 'Profile {profile}', '{0}', '{0}')",
                rng.timestamp()
            ),
        )
        .await;
    }

    let statuses = [
        "planned",
        "watching",
        "paused",
        "completed",
        "dropped",
        "rewatching",
    ];
    let mut counter = 0u64;
    let mut id = || {
        counter += 1;
        format!("s{seed}-{counter}")
    };
    for profile in profiles {
        for media_id in 0..(2 + rng.below(6)) {
            let media_type = if rng.chance(50) { "movie" } else { "series" };
            let status = statuses[rng.below(6) as usize];
            run(
                pool,
                &format!(
                    "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, genres, status, favourite, user_rating, notes, tags, rewatch_count, created_at, updated_at)
                     VALUES ('{}', '{profile}', {media_id}, '{media_type}', 'Library {media_id} é', '[\"Action\"]', '{status}', {}, {}, {}, '[\"t\"]', {}, '{}', '{}')",
                    id(),
                    rng.below(2),
                    if rng.chance(50) { "7.5" } else { "NULL" },
                    if rng.chance(50) { "'a note'" } else { "NULL" },
                    rng.below(3),
                    rng.timestamp(),
                    rng.timestamp()
                ),
            )
            .await;
            // A legacy watchlist row for the same title (conflict: the
            // library row must win) or for a title only on the watchlist.
            let watch_media_id = if rng.chance(40) {
                media_id
            } else {
                100 + media_id
            };
            let watch_type = if watch_media_id == media_id {
                media_type
            } else {
                "movie"
            };
            run(
                pool,
                &format!(
                    "INSERT OR IGNORE INTO watchlist_items (uuid, profile_id, media_id, media_type, title, year, rating, created_at, updated_at)
                     VALUES ('{}', '{profile}', {watch_media_id}, '{watch_type}', 'Watchlist {watch_media_id}', 2001, 6.5, '{}', '{}')",
                    id(),
                    rng.timestamp(),
                    rng.timestamp()
                ),
            )
            .await;
        }

        for movie_id in 0..rng.below(4) {
            run(
                pool,
                &format!(
                    "INSERT INTO seen_movies (uuid, profile_id, movie_id, title, watched_at, created_at, updated_at)
                     VALUES ('{}', '{profile}', {movie_id}, 'Seen {movie_id}', '{1}', '{1}', '{1}')",
                    id(),
                    rng.timestamp()
                ),
            )
            .await;
        }
        run(
            pool,
            &format!(
                "INSERT INTO tracked_series (uuid, profile_id, series_id, title, total_episodes, created_at, updated_at)
                 VALUES ('{}', '{profile}', 7, 'Tracked', 12, '{1}', '{1}')",
                id(),
                rng.timestamp()
            ),
        )
        .await;
        for episode in 0..rng.below(5) {
            run(
                pool,
                &format!(
                    "INSERT INTO episode_progress (uuid, profile_id, series_id, episode_id, season_number, episode_number, watched, watched_at, created_at, updated_at)
                     VALUES ('{}', '{profile}', 7, {episode}, 1, {episode}, 1, '{1}', '{1}', '{1}')",
                    id(),
                    rng.timestamp()
                ),
            )
            .await;
        }
        for _ in 0..rng.below(4) {
            run(
                pool,
                &format!(
                    "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, created_at)
                     VALUES ('{}', '{profile}', 3, 'movie', 'Event', 'watched', '{1}', '{1}')",
                    id(),
                    rng.timestamp()
                ),
            )
            .await;
            run(
                pool,
                &format!(
                    "INSERT INTO activity_log (uuid, profile_id, media_id, media_type, title, action, metadata, timestamp, created_at, updated_at)
                     VALUES ('{}', '{profile}', 3, 'movie', 'Event', 'movie:watched', '{{\"profileId\":\"{profile}\"}}', '{1}', '{1}', '{1}')",
                    id(),
                    rng.timestamp()
                ),
            )
            .await;
        }
        run(
            pool,
            &format!(
                "INSERT INTO custom_lists (uuid, profile_id, name, created_at, updated_at) VALUES ('list-{profile}', '{profile}', 'My list', '{0}', '{0}')",
                rng.timestamp()
            ),
        )
        .await;
        for position in 0..rng.below(4) {
            run(
                pool,
                &format!(
                    "INSERT INTO custom_list_items (uuid, list_id, media_id, media_type, title, position, added_at, updated_at)
                     VALUES ('{}', 'list-{profile}', {position}, 'movie', 'Item', {position}, '{1}', '{1}')",
                    id(),
                    rng.timestamp()
                ),
            )
            .await;
        }
        // Two alerts for the same title before the unique index existed.
        for _ in 0..2 {
            run(
                pool,
                &format!(
                    "INSERT INTO availability_alerts (uuid, profile_id, media_id, media_type, title, region, provider_ids, enabled, created_at, updated_at)
                     VALUES ('{}', '{profile}', 5, 'movie', 'Alert', 'FR', '[8]', 1, '{1}', '{1}')",
                    id(),
                    rng.timestamp()
                ),
            )
            .await;
        }
    }
    run(
        pool,
        "INSERT INTO availability_snapshots (media_id, media_type, region, provider_ids, checked_at) VALUES (5, 'movie', 'FR', '[8]', '2026-01-01T00:00:00.000Z')",
    )
    .await;
    run(
        pool,
        "INSERT INTO preferences (key, value, updated_at) VALUES ('notificationsEnabled', 'true', '2026-01-01T00:00:00.000Z'), ('theme', '\"light\"', '2026-01-01T00:00:00.000Z')",
    )
    .await;
}

/// Fills the columns and tables that only exist from `version` on, so rows
/// holding values in them also have to survive the remaining upgrade.
async fn seed_newer_features(pool: &SqlitePool, version: i64) {
    if version >= 11 {
        run(pool, "UPDATE tracked_series SET status = 'Ended'").await;
    }
    if version >= 13 {
        run(pool, "UPDATE viewing_events SET note = 'diary note'").await;
    }
    if version >= 14 {
        run(
            pool,
            "INSERT INTO smart_lists (uuid, profile_id, name, rules, created_at, updated_at) VALUES ('sl1', 'default', 'Smart', '{}', 't', 't')",
        )
        .await;
    }
    if version >= 15 {
        run(
            pool,
            "INSERT INTO saved_filters (uuid, profile_id, page, name, filters, created_at, updated_at) VALUES ('sf1', 'default', 'library', 'F', '{}', 't', 't')",
        )
        .await;
    }
    if version >= 19 {
        run(pool, "UPDATE episode_progress SET rating = 4").await;
    }
    if version >= 20 {
        run(
            pool,
            "INSERT INTO dismissed_recommendations (uuid, profile_id, media_id, media_type, title, dismissed_at, created_at, updated_at) VALUES ('dr1', 'default', 1, 'movie', 'Nope', 't', 't', 't')",
        )
        .await;
    }
}

const REGISTERED_VERSIONS: [i64; 16] =
    [1, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

/// No table may vanish (except the merged `watchlist_items`) or lose a column.
fn assert_tables_and_columns_survived(before: &Snapshot, after: &Snapshot, context: &str) {
    for (table, before_columns, _) in before {
        let Some((_, after_columns, _)) = after.iter().find(|(name, _, _)| name == table) else {
            assert_eq!(
                table, "watchlist_items",
                "{context}: table {table} vanished"
            );
            continue;
        };
        assert!(
            before_columns
                .iter()
                .all(|column| after_columns.contains(column)),
            "{context}: {table} lost a column"
        );
    }
}

async fn expected_library(pool: &SqlitePool, upgrading_across_12: bool) -> Vec<String> {
    let status = if upgrading_across_12 {
        "CASE WHEN status = 'rewatching' THEN 'watching' ELSE status END"
    } else {
        "status"
    };
    let cols = columns(pool, "library_items").await;
    let projected = cols
        .iter()
        .map(|column| {
            if column == "status" {
                format!("'status', {status}")
            } else {
                format!("'{column}', \"{column}\"")
            }
        })
        .collect::<Vec<_>>()
        .join(", ");
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT json_object({projected}) AS row FROM library_items ORDER BY row"
    )))
    .fetch_all(pool)
    .await
    .unwrap()
}

#[tokio::test]
async fn upgrading_from_every_registered_version_keeps_all_data_and_ends_on_the_fresh_install_schema()
 {
    let fresh = pool().await;
    apply_pending_migrations(&fresh).await.unwrap();
    let fresh_schema = schema_fingerprint(&fresh).await;
    let latest = user_version(&fresh).await;

    for seed in [1u64, 2, 3] {
        for start in REGISTERED_VERSIONS {
            let db = pool().await;
            apply_migrations_up_to(&db, 1).await.unwrap();
            seed_version_one(&db, seed * 1000 + start as u64).await;
            apply_migrations_up_to(&db, start).await.unwrap();
            assert_eq!(user_version(&db).await, start);
            seed_newer_features(&db, start).await;

            let before = snapshot(&db).await;
            let crosses_10 = start < 10;
            let crosses_12 = start < 12;
            let context = format!("seed {seed}, upgrading from version {start}");

            // Expectations that depend on the documented data migrations.
            let library_before = expected_library(&db, crosses_12).await;
            let watchlist_only: i64 = if crosses_10 {
                sqlx::query_scalar(
                    "SELECT COUNT(*) FROM watchlist_items w WHERE NOT EXISTS (SELECT 1 FROM library_items l WHERE l.profile_id = w.profile_id AND l.media_id = w.media_id AND l.media_type = w.media_type)",
                )
                .fetch_one(&db)
                .await
                .unwrap()
            } else {
                0
            };
            let duplicate_alerts: i64 = if start < 9 {
                sqlx::query_scalar(
                    "SELECT COUNT(*) - COUNT(DISTINCT profile_id || media_id || media_type) FROM availability_alerts",
                )
                .fetch_one(&db)
                .await
                .unwrap()
            } else {
                0
            };

            apply_pending_migrations(&db).await.unwrap();
            run_migrations(&db).await.unwrap();

            assert_eq!(user_version(&db).await, latest, "{context}");
            assert_healthy(&db, &context).await;
            assert_eq!(
                schema_fingerprint(&db).await,
                fresh_schema,
                "{context}: schema differs from a fresh install"
            );

            let after = snapshot(&db).await;
            assert_tables_and_columns_survived(&before, &after, &context);

            for (table, before_columns, before_rows) in &before {
                if table == "library_items" || table == "watchlist_items" {
                    continue;
                }
                let after_rows = dump(&db, table, before_columns).await;
                if table == "availability_alerts" {
                    assert_eq!(
                        after_rows.len() as i64,
                        before_rows.len() as i64 - duplicate_alerts,
                        "{context}: alerts must only lose their duplicates"
                    );
                    assert!(
                        after_rows.iter().all(|row| before_rows.contains(row)),
                        "{context}: an alert changed"
                    );
                    continue;
                }
                if table == "preferences" {
                    // Migration 22 only adds rows.
                    assert!(
                        before_rows.iter().all(|row| after_rows.contains(row)),
                        "{context}: a preference changed"
                    );
                    continue;
                }
                if table == "sync_outbox" || table == "sync_entity_state" {
                    // Triggers may legitimately have queued more rows after
                    // the data was seeded, never fewer.
                    assert!(
                        before_rows.iter().all(|row| after_rows.contains(row)),
                        "{context}: {table} lost a row"
                    );
                    continue;
                }
                assert_eq!(before_rows, &after_rows, "{context}: table {table} changed");
            }

            let library_after =
                dump(&db, "library_items", &columns(&db, "library_items").await).await;
            let migrated_watchlist = library_after.len() as i64 - library_before.len() as i64;
            assert_eq!(
                migrated_watchlist, watchlist_only,
                "{context}: watchlist rows merged"
            );
            assert!(
                library_before.iter().all(|row| library_after.contains(row)),
                "{context}: a library row was lost or altered"
            );
            let rewatching: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM library_items WHERE status = 'rewatching'",
            )
            .fetch_one(&db)
            .await
            .unwrap();
            assert_eq!(rewatching, 0, "{context}");
        }
    }
}

#[tokio::test]
async fn an_upgrade_cut_short_at_any_statement_rolls_back_and_can_be_retried() {
    for migration in migrations().unwrap() {
        if migration.version == 1 {
            continue;
        }
        for cut in 0..=migration.statements.len() {
            let db = pool().await;
            apply_migrations_up_to(&db, 1).await.unwrap();
            seed_version_one(&db, migration.version as u64 * 31).await;
            apply_migrations_up_to(&db, migration.version - 1)
                .await
                .unwrap();
            let schema = schema_fingerprint(&db).await;
            let before = snapshot(&db).await;
            let version_before = user_version(&db).await;

            // A crash: the transaction runs `cut` statements, never commits.
            {
                let mut tx = db.begin().await.unwrap();
                for statement in migration.statements.iter().take(cut) {
                    let _ = sqlx::query(*statement).execute(&mut *tx).await;
                }
                if cut == migration.statements.len() {
                    sqlx::query(sqlx::AssertSqlSafe(format!(
                        "PRAGMA user_version = {}",
                        migration.version
                    )))
                    .execute(&mut *tx)
                    .await
                    .unwrap();
                }
                drop(tx);
            }

            let context = format!("migration {} cut after {cut} statements", migration.version);
            assert_eq!(user_version(&db).await, version_before, "{context}");
            assert_eq!(
                schema_fingerprint(&db).await,
                schema,
                "{context}: schema changed"
            );
            assert_eq!(snapshot(&db).await, before, "{context}: data changed");
            assert_healthy(&db, &context).await;

            // The retry on the next launch finishes the upgrade.
            apply_pending_migrations(&db).await.unwrap();
            run_migrations(&db).await.unwrap();
            assert_healthy(&db, &context).await;
        }
    }
}

#[tokio::test]
async fn a_failing_statement_rolls_back_the_whole_migration() {
    let db = pool().await;
    apply_migrations_up_to(&db, 1).await.unwrap();
    seed_version_one(&db, 5).await;
    apply_migrations_up_to(&db, 11).await.unwrap();
    let before = snapshot(&db).await;
    let schema = schema_fingerprint(&db).await;

    // Migration 12 rebuilds library_items in several steps: break its last
    // statement and check the first ones (new table, copied rows, dropped old
    // table) are not left half done.
    let mut broken = migrations()
        .unwrap()
        .into_iter()
        .find(|migration| migration.version == 12)
        .unwrap();
    *broken.statements.last_mut().unwrap() = "CREATE INDEX this_is_not_valid ON missing_table(x)";

    assert!(apply_migration(&db, &broken).await.is_err());

    assert_eq!(user_version(&db).await, 11);
    assert_eq!(schema_fingerprint(&db).await, schema);
    assert_eq!(snapshot(&db).await, before);

    // And the real migration still applies afterwards.
    apply_pending_migrations(&db).await.unwrap();
    assert_healthy(&db, "after retry").await;
}

#[tokio::test]
async fn replaying_the_full_chain_changes_nothing() {
    let db = pool().await;
    apply_migrations_up_to(&db, 1).await.unwrap();
    seed_version_one(&db, 9).await;
    apply_pending_migrations(&db).await.unwrap();
    let schema = schema_fingerprint(&db).await;
    let data = snapshot(&db).await;

    apply_pending_migrations(&db).await.unwrap();
    run_migrations(&db).await.unwrap();

    assert_eq!(schema_fingerprint(&db).await, schema);
    assert_eq!(snapshot(&db).await, data);
}

#[tokio::test]
async fn migration_22_does_not_block_startup_when_a_split_preference_already_exists() {
    let db = pool().await;
    apply_migrations_up_to(&db, 21).await.unwrap();
    run(
        &db,
        "INSERT INTO preferences (key, value, updated_at) VALUES ('notificationsEnabled', 'true', 't'), ('availabilityAlertsEnabled', 'false', 't')",
    )
    .await;

    apply_pending_migrations(&db).await.unwrap();

    // The user's explicit choice is kept; the missing sibling is backfilled.
    let alerts: String =
        sqlx::query_scalar("SELECT value FROM preferences WHERE key = 'availabilityAlertsEnabled'")
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(alerts, "false");
    let desktop: String = sqlx::query_scalar(
        "SELECT value FROM preferences WHERE key = 'desktopNotificationsEnabled'",
    )
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(desktop, "true");
}

#[tokio::test]
async fn migration_23_leaves_every_existing_profile_without_a_pin() {
    let db = pool().await;
    apply_migrations_up_to(&db, 22).await.unwrap();
    run(
        &db,
        "INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('p', 'P', 't', 't')",
    )
    .await;

    apply_pending_migrations(&db).await.unwrap();

    let locked: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM profiles WHERE pin_hash IS NOT NULL OR pin_salt IS NOT NULL",
    )
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(locked, 0);
}
