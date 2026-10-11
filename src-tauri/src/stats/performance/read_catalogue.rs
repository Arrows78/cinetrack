//! A catalogue of every read the application runs against the personal
//! tables, with the plan SQLite picks for each. Three properties, none of them
//! a latency threshold:
//!
//! 1. no read scans a table, or sorts rows it could have read in order, unless
//!    that is its declared job (a backup export, a random pick, ...), and the
//!    catalogue says so next to the read;
//! 2. every index the schema declares is the plan of at least one read, so an
//!    index nobody queries — which every insert still pays for — cannot be
//!    added or survive a rewrite of its last reader;
//! 3. every foreign key that is joined or cascaded through has an index that
//!    starts with its column, so deleting a profile or a list never scans a
//!    child table.
//!
//! Plans are taken on an empty migrated database, like the other plan tests:
//! with no statistics gathered, SQLite plans from the schema alone, which is
//! also how the application's database is planned.

use std::collections::BTreeSet;

use serde_json::json;
use sqlx::SqlitePool;

use super::fixtures::migrated_pool;
use crate::database::PROFILE_SCOPED_TABLES;
use crate::library::explain_page_query;
use crate::stats::queries::active_events_cte;

/// What a plan is allowed to do beyond reading by index.
#[derive(Clone, Copy, Default)]
struct Allow {
    /// A full scan (of the table or of a covering index), with the reason.
    scan: Option<&'static str>,
    /// A sort of the rows read, with the reason.
    sort: Option<&'static str>,
}

struct Read {
    label: String,
    plan: String,
    allow: Allow,
}

#[derive(sqlx::FromRow)]
struct PlanRow {
    detail: String,
}

async fn plan_of(pool: &SqlitePool, sql: &str) -> String {
    let rows: Vec<PlanRow> =
        sqlx::query_as(sqlx::AssertSqlSafe(format!("EXPLAIN QUERY PLAN {sql}")))
            .fetch_all(pool)
            .await
            .unwrap_or_else(|error| panic!("cannot plan `{sql}`: {error}"));
    rows.into_iter()
        .map(|row| row.detail)
        .collect::<Vec<_>>()
        .join(" | ")
}

async fn page_plan(pool: &SqlitePool, params: serde_json::Value) -> String {
    let mut params = params;
    params["limit"] = json!(50);
    explain_page_query(pool, "default", serde_json::from_value(params).unwrap())
        .await
        .unwrap()
}

async fn sql(pool: &SqlitePool, label: &str, statement: &str, allow: Allow) -> Read {
    Read {
        label: label.to_string(),
        plan: plan_of(pool, statement).await,
        allow,
    }
}

async fn page(pool: &SqlitePool, label: &str, params: serde_json::Value) -> Read {
    Read {
        label: format!("library page: {label}"),
        plan: page_plan(pool, params).await,
        allow: Allow::default(),
    }
}

const NONE: Allow = Allow {
    scan: None,
    sort: None,
};

fn sort(reason: &'static str) -> Allow {
    Allow {
        scan: None,
        sort: Some(reason),
    }
}

async fn library_reads(pool: &SqlitePool) -> Vec<Read> {
    let cursor = |sort: &str, key: &str, value: serde_json::Value| {
        json!({"sort": sort, key: value, "media_id": 7, "media_type": "movie"}).to_string()
    };
    vec![
        // The Library page and the locked hubs' paged reads, one per sort.
        page(pool, "recent", json!({"sort": "recent"})).await,
        page(
            pool,
            "recent, next page",
            json!({"sort": "recent", "cursor": cursor("recent", "updated_at", json!("2026-01-01"))}),
        )
        .await,
        page(pool, "title", json!({"sort": "title"})).await,
        page(
            pool,
            "title, next page",
            json!({"sort": "title", "cursor": cursor("title", "title", json!("Alien"))}),
        )
        .await,
        page(pool, "rating", json!({"sort": "rating"})).await,
        page(
            pool,
            "rating, next page",
            json!({"sort": "rating", "cursor": cursor("rating", "rating", json!(7.5))}),
        )
        .await,
        page(pool, "date added", json!({"sort": "dateAdded"})).await,
        page(
            pool,
            "date added, next page",
            json!({"sort": "dateAdded", "cursor": cursor("dateAdded", "created_at", json!("2026-01-01"))}),
        )
        .await,
        page(pool, "date completed", json!({"sort": "dateCompleted"})).await,
        page(
            pool,
            "date completed, next page",
            json!({"sort": "dateCompleted", "cursor": cursor("dateCompleted", "completed_at", json!("2026-01-01"))}),
        )
        .await,
        page(pool, "status", json!({"sort": "recent", "status": "paused"})).await,
        page(
            pool,
            "status, next page",
            json!({"sort": "recent", "status": "paused", "cursor": cursor("recent", "updated_at", json!("2026-01-01"))}),
        )
        .await,
        page(
            pool,
            "media type",
            json!({"sort": "recent", "mediaType": "series"}),
        )
        .await,
        page(
            pool,
            "status and media type",
            json!({"sort": "recent", "mediaType": "series", "status": "watching"}),
        )
        .await,
        page(
            pool,
            "favourites",
            json!({"sort": "recent", "favouritesOnly": true}),
        )
        .await,
        page(pool, "genre", json!({"sort": "recent", "genre": "Drama"})).await,
        page(
            pool,
            "title search",
            json!({"sort": "title", "search": "alien"}),
        )
        .await,
        // The rest of the library domain.
        sql(
            pool,
            "library list (full read, unscoped)",
            "SELECT * FROM library_items WHERE profile_id = 'default'
             ORDER BY updated_at DESC, media_id DESC, media_type DESC LIMIT 200000",
            NONE,
        )
        .await,
        sql(
            pool,
            "library list (full read, one media type)",
            "SELECT * FROM library_items WHERE profile_id = 'default' AND media_type = 'movie'
             ORDER BY updated_at DESC, media_id DESC, media_type DESC LIMIT 200000",
            NONE,
        )
        .await,
        sql(
            pool,
            "library item by key",
            "SELECT * FROM library_items
             WHERE profile_id = 'default' AND media_id = 1 AND media_type = 'movie' LIMIT 1",
            NONE,
        )
        .await,
        sql(
            pool,
            "library item membership keys",
            "SELECT media_id, media_type FROM library_items WHERE profile_id = 'default' LIMIT 200000",
            NONE,
        )
        .await,
        sql(
            pool,
            "library random pick",
            "SELECT media_id, media_type FROM library_items
             WHERE profile_id = 'default' AND media_type = 'movie' ORDER BY RANDOM() LIMIT 1",
            sort("a fair random pick has to rank every candidate; it reads a covering index"),
        )
        .await,
        sql(
            pool,
            "library items by keys",
            "SELECT * FROM library_items WHERE profile_id = 'default'
             AND ((media_id = 1 AND media_type = 'movie') OR (media_id = 2 AND media_type = 'series'))",
            NONE,
        )
        .await,
        sql(
            pool,
            "library status counts",
            "SELECT status, COUNT(*) FROM library_items WHERE profile_id = 'default' GROUP BY status",
            NONE,
        )
        .await,
        sql(
            pool,
            "planned candidates",
            "SELECT * FROM library_items
             WHERE profile_id = 'default' AND media_type = 'movie' AND status = 'planned'
             ORDER BY updated_at DESC, media_id DESC LIMIT 20",
            NONE,
        )
        .await,
        sql(
            pool,
            "stale planned titles",
            "SELECT * FROM library_items
             WHERE profile_id = 'default' AND status = 'planned' AND updated_at <= '2026-01-01'
             ORDER BY updated_at DESC, media_id DESC, media_type DESC LIMIT 4",
            NONE,
        )
        .await,
        sql(
            pool,
            "completed candidates (one media type)",
            "SELECT * FROM library_items
             WHERE profile_id = 'default' AND status = 'completed' AND media_type = 'series'
             ORDER BY completed_at DESC, media_id DESC LIMIT 20",
            sort("only ties on one completion date are re-ordered by id, in memory"),
        )
        .await,
        sql(
            pool,
            "completed candidates (any media type)",
            "SELECT * FROM library_items
             WHERE profile_id = 'default' AND status = 'completed'
             ORDER BY completed_at DESC, media_id DESC LIMIT 20",
            sort("the completion order is only indexed per media type"),
        )
        .await,
        sql(
            pool,
            "recommendation seed, rated completed title",
            "SELECT * FROM library_items
             WHERE profile_id = 'default' AND status = 'completed' AND user_rating IS NOT NULL
             ORDER BY user_rating DESC, completed_at DESC LIMIT 1",
            sort("ties on the rating are ordered by completion date, among the rated titles only"),
        )
        .await,
        sql(
            pool,
            "recommendation seed, favourite",
            "SELECT * FROM library_items WHERE profile_id = 'default' AND favourite = 1
             ORDER BY updated_at DESC LIMIT 1",
            NONE,
        )
        .await,
        sql(
            pool,
            "recommendation seed, any completed title",
            "SELECT * FROM library_items WHERE profile_id = 'default' AND status = 'completed'
             ORDER BY completed_at DESC LIMIT 1",
            sort("the completion order is only indexed per media type"),
        )
        .await,
        sql(
            pool,
            "recommendation seed, watching",
            "SELECT * FROM library_items WHERE profile_id = 'default' AND status = 'watching'
             ORDER BY updated_at DESC LIMIT 1",
            NONE,
        )
        .await,
        sql(
            pool,
            "distinct tags",
            "SELECT DISTINCT tags FROM library_items WHERE profile_id = 'default' AND tags != '[]'
             ORDER BY created_at ASC, media_id ASC",
            sort("the tag editor's suggestions are deduplicated over the whole profile"),
        )
        .await,
        sql(
            pool,
            "ids matching filters",
            "SELECT media_id, media_type FROM library_items
             WHERE profile_id = 'default' AND media_type = 'movie' AND status = 'completed'
               AND genres LIKE '%\"Drama\"%' AND COALESCE(user_rating, rating, -1.0) >= 7
             LIMIT 200000",
            NONE,
        )
        .await,
    ]
}

async fn progress_history_and_list_reads(pool: &SqlitePool) -> Vec<Read> {
    vec![
        sql(
            pool,
            "episodes watched of one series",
            "SELECT uuid, series_id, episode_id, season_number, episode_number, watched, watched_at, created_at, updated_at, rating
             FROM episode_progress WHERE profile_id = 'default' AND series_id = 1 AND watched = 1",
            NONE,
        )
        .await,
        sql(
            pool,
            "tracked series with their progress",
            "SELECT ts.uuid, ts.series_id, COUNT(ep.episode_id) AS watched_episodes
             FROM tracked_series ts
             LEFT JOIN episode_progress ep ON ep.profile_id = ts.profile_id AND ep.series_id = ts.series_id AND ep.watched = 1 AND ep.season_number > 0
             WHERE ts.profile_id = 'default'
               AND EXISTS (SELECT 1 FROM library_items li WHERE li.profile_id = ts.profile_id AND li.media_id = ts.series_id AND li.media_type = 'series')
             GROUP BY ts.uuid, ts.series_id
             ORDER BY ts.updated_at DESC",
            sort("the list is ordered by the cached row's date, after the per-series count"),
        )
        .await,
        sql(
            pool,
            "movie seen",
            "SELECT COUNT(*) FROM seen_movies WHERE profile_id = 'default' AND movie_id = 1",
            NONE,
        )
        .await,
        sql(
            pool,
            "movie already rewatched at that date",
            "SELECT EXISTS(SELECT 1 FROM viewing_events
             WHERE profile_id = 'default' AND media_id = 1 AND media_type = 'movie'
               AND event_type = 'rewatched' AND watched_at = '2026-01-01')",
            NONE,
        )
        .await,
        sql(
            pool,
            "latest watch of a movie (rewatch runtime)",
            "SELECT duration_minutes FROM viewing_events
             WHERE profile_id = 'default' AND media_id = 1 AND media_type = 'movie' AND event_type = 'watched'
             ORDER BY insert_seq DESC LIMIT 1",
            sort("the events of one title, a handful of rows"),
        )
        .await,
        sql(
            pool,
            "next viewing event position",
            "SELECT COALESCE(MAX(insert_seq), 0) + 1 FROM viewing_events",
            NONE,
        )
        .await,
        sql(
            pool,
            "activity log page",
            "SELECT uuid, media_id FROM activity_log WHERE profile_id = 'default'
               AND (timestamp < '2026-01-01' OR (timestamp = '2026-01-01' AND uuid < 'x'))
             ORDER BY timestamp DESC, uuid DESC LIMIT 50",
            sort("only ties on one timestamp are re-ordered, in memory, with the limit applied"),
        )
        .await,
        sql(
            pool,
            "custom lists",
            "SELECT * FROM custom_lists WHERE profile_id = 'default' ORDER BY updated_at DESC",
            NONE,
        )
        .await,
        sql(
            pool,
            "custom list items",
            "SELECT * FROM custom_list_items WHERE list_id = 'list' ORDER BY position",
            NONE,
        )
        .await,
        sql(
            pool,
            "next position in a custom list",
            "SELECT COALESCE(MAX(position) + 1, 0) FROM custom_list_items WHERE list_id = 'list'",
            NONE,
        )
        .await,
        sql(
            pool,
            "title in a custom list",
            "DELETE FROM custom_list_items WHERE list_id = 'list' AND media_id = 1 AND media_type = 'movie'",
            NONE,
        )
        .await,
        sql(
            pool,
            "smart lists",
            "SELECT * FROM smart_lists WHERE profile_id = 'default' ORDER BY updated_at DESC",
            NONE,
        )
        .await,
        sql(
            pool,
            "saved filters of a page",
            "SELECT * FROM saved_filters WHERE profile_id = 'default' AND page = 'library' ORDER BY updated_at DESC",
            NONE,
        )
        .await,
        sql(
            pool,
            "availability alerts",
            "SELECT * FROM availability_alerts WHERE profile_id = 'default' ORDER BY created_at DESC",
            NONE,
        )
        .await,
        sql(
            pool,
            "availability alert of a title",
            "SELECT * FROM availability_alerts WHERE profile_id = 'default' AND media_id = 1 AND media_type = 'movie'",
            NONE,
        )
        .await,
        sql(
            pool,
            "availability snapshot of a title and region",
            "SELECT * FROM availability_snapshots WHERE media_id = 1 AND media_type = 'movie' AND region = 'FR'",
            NONE,
        )
        .await,
        sql(
            pool,
            "availability snapshots",
            "SELECT * FROM availability_snapshots ORDER BY checked_at DESC LIMIT 200000",
            Allow {
                scan: Some("a global cache with one row per alert and region, never per library title"),
                sort: Some("same table"),
            },
        )
        .await,
        sql(
            pool,
            "dismissed recommendations",
            "SELECT * FROM dismissed_recommendations WHERE profile_id = 'default' ORDER BY created_at DESC",
            NONE,
        )
        .await,
        sql(
            pool,
            "dismissed recommendation of a title",
            "SELECT uuid FROM dismissed_recommendations WHERE profile_id = 'default' AND media_id = 1 AND media_type = 'movie'",
            NONE,
        )
        .await,
        sql(
            pool,
            "profiles",
            "SELECT * FROM profiles ORDER BY CASE WHEN uuid = 'default' THEN 0 ELSE 1 END, created_at ASC",
            Allow {
                scan: Some("a handful of local profiles"),
                sort: Some("same table"),
            },
        )
        .await,
        sql(
            pool,
            "profile linked to a cloud account",
            "SELECT * FROM profiles WHERE supabase_user_id = 'user' LIMIT 1",
            NONE,
        )
        .await,
    ]
}

async fn stats_and_sync_reads(pool: &SqlitePool) -> Vec<Read> {
    let current_state = |tail: &str| {
        format!(
            "{} {}",
            active_events_cte!().replace("$1", "'default'"),
            tail
        )
    };
    vec![
        sql(
            pool,
            "current viewing state",
            &current_state("SELECT COUNT(*) FROM counted WHERE rk = 1"),
            sort("the window functions re-partition the profile's events in memory"),
        )
        .await,
        sql(
            pool,
            "history of one title",
            "SELECT uuid, event_type, watched_at FROM viewing_events
             WHERE profile_id = 'default' AND media_id = 42 AND media_type = 'movie'
             ORDER BY watched_at DESC",
            NONE,
        )
        .await,
        sql(
            pool,
            "year favourite genre, events of the year",
            "SELECT DISTINCT media_id, media_type FROM viewing_events
             WHERE profile_id = 'default' AND event_type <> 'unwatched'
               AND watched_at >= '2026-01-01' AND watched_at < '2027-01-01'",
            sort("DISTINCT over the titles of one year"),
        )
        .await,
        sql(
            pool,
            "rating distribution",
            "SELECT user_rating AS rating, COUNT(*) AS count FROM library_items
             WHERE profile_id = 'default' AND user_rating IS NOT NULL
             GROUP BY user_rating ORDER BY user_rating ASC",
            NONE,
        )
        .await,
        sql(
            pool,
            "rated titles",
            "SELECT media_id, media_type, user_rating AS rating FROM library_items
             WHERE profile_id = 'default' AND user_rating IS NOT NULL",
            NONE,
        )
        .await,
        sql(
            pool,
            "library totals",
            "SELECT COUNT(*), COUNT(CASE WHEN status = 'completed' THEN 1 END) FROM library_items WHERE profile_id = 'default'",
            NONE,
        )
        .await,
        sql(
            pool,
            "completed series dates",
            "SELECT completed_at FROM library_items
             WHERE profile_id = 'default' AND media_type = 'series' AND status = 'completed' AND completed_at IS NOT NULL
             ORDER BY completed_at ASC",
            NONE,
        )
        .await,
        sql(
            pool,
            "watch forecast backlog",
            "SELECT COALESCE(SUM(MAX(ts.total_episodes - COALESCE(watched.count, 0), 0)), 0)
             FROM tracked_series ts
             LEFT JOIN (SELECT series_id, COUNT(*) AS count FROM episode_progress
                        WHERE profile_id = 'default' AND watched = 1 AND season_number > 0 GROUP BY series_id) watched
               ON watched.series_id = ts.series_id
             WHERE ts.profile_id = 'default'
               AND EXISTS (SELECT 1 FROM library_items li WHERE li.profile_id = ts.profile_id AND li.media_id = ts.series_id AND li.media_type = 'series')",
            NONE,
        )
        .await,
        sql(
            pool,
            "sync outbox, next batch",
            "SELECT mutation_id, entity_type FROM sync_outbox WHERE profile_id = 'default'
             ORDER BY CASE WHEN entity_type = 'custom_list' AND operation = 'upsert' THEN 0
                           WHEN entity_type = 'custom_list_item' THEN 2 ELSE 1 END ASC,
                      created_at ASC, mutation_id ASC LIMIT 200",
            sort("the push order puts lists before their items, which no index can express"),
        )
        .await,
        sql(
            pool,
            "sync outbox, conflicts",
            "SELECT mutation_id FROM sync_outbox WHERE profile_id = 'default' AND last_error = 'conflict'
             ORDER BY created_at DESC LIMIT 50",
            NONE,
        )
        .await,
        sql(
            pool,
            "sync outbox entry of an entity",
            "SELECT operation FROM sync_outbox WHERE profile_id = 'default' AND entity_type = 'library_item' AND entity_id = 'x'",
            NONE,
        )
        .await,
        sql(
            pool,
            "sync remote version of an entity",
            "SELECT remote_version FROM sync_entity_state WHERE profile_id = 'default' AND entity_type = 'library_item' AND entity_id = 'x'",
            NONE,
        )
        .await,
    ]
}

/// Deleting a profile cascades to every profile-scoped table; each one is
/// found by its `profile_id`.
async fn profile_cascade_reads(pool: &SqlitePool) -> Vec<Read> {
    let mut reads = Vec::new();
    for table in PROFILE_SCOPED_TABLES {
        reads.push(
            sql(
                pool,
                &format!("profile delete cascade: {table}"),
                &format!("SELECT uuid FROM {table} WHERE profile_id = 'default'"),
                NONE,
            )
            .await,
        );
    }
    reads
}

async fn every_read(pool: &SqlitePool) -> Vec<Read> {
    let mut reads = library_reads(pool).await;
    reads.extend(progress_history_and_list_reads(pool).await);
    reads.extend(stats_and_sync_reads(pool).await);
    reads.extend(profile_cascade_reads(pool).await);
    reads
}

/// A `SCAN` of a table or of an index. The scans of a subquery, a common table
/// expression's result or a constant row read rows already in memory, not the
/// database.
fn scans_a_table(plan: &str) -> bool {
    const IN_MEMORY: [&str; 6] = [
        "CONSTANT ROW",
        "(subquery-",
        "ordered",
        "marked",
        "active",
        "counted",
    ];
    plan.split(" | ").any(|step| {
        step.trim_start_matches(['|', '-', '`', ' '])
            .strip_prefix("SCAN ")
            .is_some_and(|target| !IN_MEMORY.iter().any(|name| target.starts_with(name)))
    })
}

#[tokio::test]
async fn no_read_scans_or_sorts_more_than_it_declares() {
    let pool = migrated_pool().await;
    let mut problems = Vec::new();
    for read in every_read(&pool).await {
        if scans_a_table(&read.plan) && read.allow.scan.is_none() {
            problems.push(format!("{}: scans a table: {}", read.label, read.plan));
        }
        if read.plan.contains("USE TEMP B-TREE") && read.allow.sort.is_none() {
            problems.push(format!("{}: sorts its rows: {}", read.label, read.plan));
        }
    }
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

async fn declared_indexes(pool: &SqlitePool) -> BTreeSet<String> {
    let names: Vec<(String,)> = sqlx::query_as(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex%'",
    )
    .fetch_all(pool)
    .await
    .unwrap();
    names.into_iter().map(|(name,)| name).collect()
}

#[tokio::test]
async fn every_declared_index_is_the_plan_of_a_read() {
    let pool = migrated_pool().await;
    let plans: String = every_read(&pool)
        .await
        .into_iter()
        .map(|read| read.plan)
        .collect::<Vec<_>>()
        .join("\n");
    let unused: Vec<String> = declared_indexes(&pool)
        .await
        .into_iter()
        .filter(|index| !plans.contains(index.as_str()))
        .collect();
    assert!(
        unused.is_empty(),
        "no read in the catalogue uses these indexes (drop them, or add the read that needs them): {unused:?}"
    );
}

#[derive(sqlx::FromRow)]
struct ForeignKey {
    child_table: String,
    child_column: String,
    parent_table: String,
}

/// Every foreign key of a table that is cascaded or joined through must start
/// an index of its child table (the primary key and unique constraints count),
/// or deleting a parent scans the child.
#[tokio::test]
async fn every_foreign_key_column_leads_an_index() {
    let pool = migrated_pool().await;
    let foreign_keys: Vec<ForeignKey> = sqlx::query_as(
        "SELECT m.name AS child_table, f.\"from\" AS child_column, f.\"table\" AS parent_table
         FROM sqlite_master m, pragma_foreign_key_list(m.name) f
         WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert!(!foreign_keys.is_empty());

    let mut orphans = Vec::new();
    for key in foreign_keys {
        let leading: Vec<(String,)> = sqlx::query_as(
            "SELECT i.name FROM pragma_index_list(?1) l, pragma_index_info(l.name) i
             WHERE i.seqno = 0 AND i.name = ?2",
        )
        .bind(&key.child_table)
        .bind(&key.child_column)
        .fetch_all(&pool)
        .await
        .unwrap();
        if leading.is_empty() {
            orphans.push(format!(
                "{}.{} -> {}",
                key.child_table, key.child_column, key.parent_table
            ));
        }
    }
    assert!(
        orphans.is_empty(),
        "foreign keys with no index starting at their column: {orphans:?}"
    );
}
