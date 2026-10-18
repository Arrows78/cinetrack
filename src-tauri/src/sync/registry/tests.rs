use sqlx::SqlitePool;
use sqlx::sqlite::SqlitePoolOptions;
use std::collections::BTreeSet;

use super::*;
use crate::database::PROFILE_SCOPED_TABLES;
use crate::sync::service::bootstrap::{
    SAVED_FILTER_SEED_SQL, VIEWING_EVENT_SEED_SQL, account_preferences_seed_sql,
};

/// Profile-scoped tables that deliberately do not sync. Empty today: every
/// table in `PROFILE_SCOPED_TABLES` has a capture trigger. A table added to
/// `PROFILE_SCOPED_TABLES` must either get a registry entry (and capture
/// triggers) or be listed here with the reason it stays on this install.
const NOT_SYNCED_PROFILE_TABLES: &[&str] = &[];

async fn pool() -> SqlitePool {
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

/// The argument keys of the first `json_object(...)` call in `sql`
/// (every even-position argument, unquoted).
fn json_object_keys(sql: &str) -> BTreeSet<String> {
    let start = sql.find("json_object(").expect("no json_object call") + "json_object(".len();
    let mut depth = 1;
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_quote = false;
    for ch in sql[start..].chars() {
        match ch {
            '\'' => {
                in_quote = !in_quote;
                current.push(ch);
            }
            '(' if !in_quote => {
                depth += 1;
                current.push(ch);
            }
            ')' if !in_quote => {
                depth -= 1;
                if depth == 0 {
                    args.push(current.trim().to_string());
                    break;
                }
                current.push(ch);
            }
            ',' if !in_quote && depth == 1 => {
                args.push(current.trim().to_string());
                current.clear();
            }
            _ => current.push(ch),
        }
    }
    args.iter()
        .step_by(2)
        .map(|key| key.trim_matches('\'').to_string())
        .collect()
}

/// Every `json_extract(?1,'$.field')` field an upsert statement reads.
fn upsert_fields(sql: &str) -> BTreeSet<String> {
    sql.split("json_extract(?1,'$.")
        .skip(1)
        .map(|rest| rest[..rest.find('\'').unwrap()].to_string())
        .collect()
}

#[test]
fn entity_types_and_tables_are_unique() {
    let types: BTreeSet<_> = ENTITY_REGISTRY.iter().map(|e| e.entity_type).collect();
    let tables: BTreeSet<_> = ENTITY_REGISTRY.iter().map(|e| e.table).collect();
    assert_eq!(types.len(), ENTITY_REGISTRY.len());
    assert_eq!(tables.len(), ENTITY_REGISTRY.len());
}

#[test]
fn registry_covers_every_profile_scoped_table_that_syncs() {
    let registry: BTreeSet<_> = profile_scoped_registry_tables().into_iter().collect();
    let expected: BTreeSet<_> = PROFILE_SCOPED_TABLES
        .iter()
        .copied()
        .filter(|table| !NOT_SYNCED_PROFILE_TABLES.contains(table))
        .collect();
    assert_eq!(registry, expected);
    for table in NOT_SYNCED_PROFILE_TABLES {
        assert!(
            PROFILE_SCOPED_TABLES.contains(table),
            "stale exemption {table}"
        );
    }
}

#[tokio::test]
async fn every_synced_table_has_capture_triggers() {
    let pool = pool().await;
    for entity in ENTITY_REGISTRY {
        if entity.scope == Scope::Account {
            // `preferences` is captured by the preferences layer, not by a trigger.
            continue;
        }
        for operation in ["insert", "delete"] {
            let name = format!("sync_{}_{operation}", entity.table);
            let found: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name=?1 AND tbl_name=?2",
            )
            .bind(&name)
            .bind(entity.table)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(found, 1, "missing trigger {name}");
        }
    }
}

async fn trigger_keys(pool: &SqlitePool, table: &str, operation: &str) -> Option<BTreeSet<String>> {
    let sql: Option<String> =
        sqlx::query_scalar("SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?1")
            .bind(format!("sync_{table}_{operation}"))
            .fetch_optional(pool)
            .await
            .unwrap();
    sql.filter(|sql| sql.contains("json_object("))
        .map(|sql| json_object_keys(&sql))
}

#[tokio::test]
async fn upserts_read_exactly_the_keys_the_capture_triggers_write() {
    let pool = pool().await;
    for entity in ENTITY_REGISTRY {
        if entity.scope == Scope::Account {
            continue;
        }
        let insert = trigger_keys(&pool, entity.table, "insert")
            .await
            .unwrap_or_else(|| panic!("no insert payload for {}", entity.table));
        if let Some(update) = trigger_keys(&pool, entity.table, "update").await {
            assert_eq!(
                insert, update,
                "{}: insert/update payloads differ",
                entity.table
            );
        }
        let read = upsert_fields(entity.upsert_sql);
        let written = insert;
        let only_read: Vec<_> = read.difference(&written).collect();
        let only_written: Vec<_> = written.difference(&read).collect();
        assert!(
            only_read.is_empty() && only_written.is_empty(),
            "{}: upsert reads {only_read:?} the trigger never writes; trigger writes {only_written:?} the upsert never reads",
            entity.entity_type
        );
    }
}

#[tokio::test]
async fn bootstrap_direct_seeds_match_the_capture_payloads() {
    let pool = pool().await;
    let seeds: [(&str, String); 3] = [
        ("viewing_event", VIEWING_EVENT_SEED_SQL.to_string()),
        ("saved_filter", SAVED_FILTER_SEED_SQL.to_string()),
        ("account_preferences", account_preferences_seed_sql()),
    ];
    for (entity_type, sql) in &seeds {
        let entity = descriptor(entity_type).unwrap();
        let seeded = json_object_keys(sql);
        let expected = if entity.scope == Scope::Account {
            upsert_fields(entity.upsert_sql)
        } else {
            trigger_keys(&pool, entity.table, "insert").await.unwrap()
        };
        assert_eq!(seeded, expected, "{entity_type}");
    }
}

#[test]
fn title_lookups_follow_the_registry() {
    for entity in ENTITY_REGISTRY {
        if entity.title != TitleRef::None {
            assert_eq!(entity.scope, Scope::Profile);
            assert!(entity.title.select_sql(entity.table).is_some());
        }
    }
    assert!(validate_entity_type("library_item"));
    assert!(!validate_entity_type("nope"));
}
