//! Helpers shared by the Rust unit tests, so each module doesn't carry its
//! own copy of the same in-memory database setup.

use sqlx::SqlitePool;
use sqlx::sqlite::SqlitePoolOptions;

/// A fresh in-memory database with every migration applied. One connection,
/// because each `sqlite::memory:` connection is its own private database.
pub(crate) async fn migrated_pool() -> SqlitePool {
    migrated_pool_with_connections(1).await
}

pub(crate) async fn migrated_pool_with_connections(max_connections: u32) -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(max_connections)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    crate::database::migrations::run_migrations(&pool)
        .await
        .unwrap();
    pool
}
