//! Multi-device simulation: two (or more) real, migrated SQLite databases talk
//! to an in-memory fake of the `apply_sync_batch` / `pull_sync_changes`
//! Supabase RPCs (same version / conflict / mutation-id dedup rules as
//! `supabase/migrations/*sync*`), driven through the very same service
//! functions the Tauri commands call, in the same order `sync-service.ts`'s
//! `execute()` does (push -> pull -> push).

use std::collections::{BTreeMap, BTreeSet, HashMap};

use sqlx::SqlitePool;
use sqlx::sqlite::SqlitePoolOptions;

use super::models::{RemoteSyncChange, SyncConflict, SyncMutationAck, SyncOutboxMutation};
use super::service;

// ---------------------------------------------------------------------------
// Fake server
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub(super) struct Doc {
    pub(super) version: i64,
    pub(super) deleted: bool,
    pub(super) data: Option<serde_json::Value>,
}

#[derive(Default)]
pub(super) struct FakeServer {
    pub(super) docs: BTreeMap<(String, String), Doc>,
    pub(super) changes: Vec<RemoteSyncChange>,
    mutations: HashMap<String, i64>,
    /// Entity ids (any type) whose mutations the server refuses with an
    /// error for the whole batch, to model a rejected / failing request.
    pub(super) fail_next_batches: usize,
    pub(super) batches_seen: Vec<Vec<(String, String, String)>>,
}

impl FakeServer {
    pub(super) fn apply_batch(
        &mut self,
        mutations: &[SyncOutboxMutation],
    ) -> Result<(Vec<SyncMutationAck>, Vec<SyncConflict>), String> {
        if self.fail_next_batches > 0 {
            self.fail_next_batches -= 1;
            return Err("network down".to_string());
        }
        self.batches_seen.push(
            mutations
                .iter()
                .map(|m| {
                    (
                        m.entity_type.clone(),
                        m.entity_id.clone(),
                        m.operation.clone(),
                    )
                })
                .collect(),
        );
        let mut acks = Vec::new();
        let mut conflicts = Vec::new();
        for m in mutations {
            let key = (m.entity_type.clone(), m.entity_id.clone());
            if let Some(version) = self.mutations.get(&m.mutation_id) {
                acks.push(SyncMutationAck {
                    mutation_id: m.mutation_id.clone(),
                    entity_type: m.entity_type.clone(),
                    entity_id: m.entity_id.clone(),
                    version: *version,
                });
                continue;
            }
            let current = self.docs.get(&key).cloned();
            match &current {
                Some(doc) if doc.version != m.base_version => {
                    conflicts.push(SyncConflict {
                        mutation_id: m.mutation_id.clone(),
                        entity_type: m.entity_type.clone(),
                        entity_id: m.entity_id.clone(),
                        server_version: doc.version,
                    });
                    continue;
                }
                None if m.base_version != 0 => {
                    conflicts.push(SyncConflict {
                        mutation_id: m.mutation_id.clone(),
                        entity_type: m.entity_type.clone(),
                        entity_id: m.entity_id.clone(),
                        server_version: 0,
                    });
                    continue;
                }
                _ => {}
            }
            let version = current.map_or(1, |doc| doc.version + 1);
            let data = if m.operation == "delete" {
                None
            } else {
                m.payload.clone()
            };
            self.docs.insert(
                key,
                Doc {
                    version,
                    deleted: m.operation == "delete",
                    data: data.clone(),
                },
            );
            let sequence = self.changes.len() as i64 + 1;
            self.changes.push(RemoteSyncChange {
                sequence,
                entity_type: m.entity_type.clone(),
                entity_id: m.entity_id.clone(),
                operation: m.operation.clone(),
                version,
                data,
            });
            self.mutations.insert(m.mutation_id.clone(), version);
            acks.push(SyncMutationAck {
                mutation_id: m.mutation_id.clone(),
                entity_type: m.entity_type.clone(),
                entity_id: m.entity_id.clone(),
                version,
            });
        }
        Ok((acks, conflicts))
    }

    pub(super) fn pull(&self, after: i64, limit: usize) -> Vec<RemoteSyncChange> {
        self.changes
            .iter()
            .filter(|change| change.sequence > after)
            .take(limit)
            .cloned()
            .collect()
    }

    pub(super) fn dump(&self, entity_type: &str) -> String {
        let mut out = String::new();
        for ((kind, id), doc) in &self.docs {
            if kind == entity_type {
                let data = doc.data.as_ref().map(|value| {
                    ["mediaId", "movieId", "seriesId", "episodeId", "listId"]
                        .iter()
                        .filter_map(|key| value.get(key).map(|v| format!("{key}={v}")))
                        .chain(
                            ["updatedAt", "enabled", "status"]
                                .iter()
                                .filter_map(|key| value.get(key).map(|v| format!("{key}={v}"))),
                        )
                        .collect::<Vec<_>>()
                        .join(" ")
                });
                out.push_str(&format!(
                    "  doc {id} v{} deleted={} {:?}\n",
                    doc.version, doc.deleted, data
                ));
            }
        }
        out
    }
}

// ---------------------------------------------------------------------------
// Device
// ---------------------------------------------------------------------------

pub(super) async fn new_device() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(2)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    crate::database::migrations::run_migrations(&pool)
        .await
        .unwrap();
    // The signed-in account owns the profile every device syncs.
    sqlx::query("UPDATE profiles SET supabase_user_id=?1 WHERE uuid='default'")
        .bind(SIM_ACCOUNT)
        .execute(&pool)
        .await
        .unwrap();
    pool
}

pub(super) const SIM_ACCOUNT: &str = "user_sim";

/// Mirror of `pushOutbox()` in sync-service.ts.
pub(super) async fn push(pool: &SqlitePool, server: &mut FakeServer) -> Result<(), String> {
    for _ in 0..20 {
        let mutations = service::list_outbox(pool, 100).await.unwrap();
        if mutations.is_empty() {
            break;
        }
        let (acks, conflicts) = server.apply_batch(&mutations)?;
        if !acks.is_empty() {
            service::ack_mutations(pool, &acks).await.unwrap();
        }
        if !conflicts.is_empty() {
            service::rebase_conflicts(pool, &conflicts).await.unwrap();
        }
        assert!(
            !(acks.is_empty() && conflicts.is_empty()),
            "server made no progress for a non-empty batch"
        );
    }
    Ok(())
}

/// Mirror of `pullChanges()` in sync-service.ts.
pub(super) async fn pull(pool: &SqlitePool, server: &FakeServer, page: usize) {
    for _ in 0..1000 {
        let cursor = service::cursor(pool).await.unwrap();
        let rows = server.pull(cursor, page);
        if rows.is_empty() {
            return;
        }
        let count = rows.len();
        service::apply_remote_changes(pool, &rows).await.unwrap();
        if count < page {
            return;
        }
    }
    panic!("pull never terminated");
}

/// Mirror of `execute()` in sync-service.ts (prepare -> push -> pull -> push).
pub(super) async fn sync_round(pool: &SqlitePool, server: &mut FakeServer) {
    service::prepare_for_account(pool, SIM_ACCOUNT)
        .await
        .unwrap();
    push(pool, server).await.unwrap();
    pull(pool, server, 200).await;
    push(pool, server).await.unwrap();
    service::mark_synced(pool).await.unwrap();
}

pub(super) async fn settle(devices: &[&SqlitePool], server: &mut FakeServer) {
    for _ in 0..4 {
        for device in devices {
            sync_round(device, server).await;
        }
    }
}

// ---------------------------------------------------------------------------
// Local edits (what the app's own commands do, minus the Tauri plumbing)
// ---------------------------------------------------------------------------

thread_local! {
    static UUID_STATE: std::cell::Cell<u64> = const { std::cell::Cell::new(1) };
}

/// Reproducible stand-in for `new_uuid()`: the real one is time-ordered with
/// random bits, which would make a failing seed impossible to replay (which of
/// two uuids is the smaller one decides which row is canonical).
pub(super) fn sim_uuid() -> String {
    let value = UUID_STATE.with(|state| {
        let mut x = state.get();
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        state.set(x);
        x
    });
    format!("00000000-0000-4000-8000-{:012x}", value & 0xffff_ffff_ffff)
}

pub(super) fn seed_sim_uuids(seed: u64) {
    UUID_STATE.with(|state| state.set(seed.wrapping_mul(0x2545_F491_4F6C_DD1D) | 1));
}

pub(super) fn ts(tick: u32) -> String {
    format!("2026-01-01T{:02}:{:02}:00.000Z", tick / 60, tick % 60)
}

pub(super) async fn local_library_upsert(pool: &SqlitePool, media_id: i64, status: &str, at: &str) {
    sqlx::query(
        "INSERT INTO library_items(uuid,profile_id,media_id,media_type,title,status,created_at,updated_at) \
         VALUES(?1,'default',?2,'movie','T',?3,?4,?4) \
         ON CONFLICT(profile_id,media_id,media_type) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at",
    )
    .bind(sim_uuid())
    .bind(media_id)
    .bind(status)
    .bind(at)
    .execute(pool)
    .await
    .unwrap();
}

pub(super) async fn local_library_delete(pool: &SqlitePool, media_id: i64) {
    sqlx::query("DELETE FROM library_items WHERE profile_id='default' AND media_id=?1")
        .bind(media_id)
        .execute(pool)
        .await
        .unwrap();
}

async fn local_seen_upsert(pool: &SqlitePool, movie_id: i64, watched_at: &str, at: &str) {
    sqlx::query(
        "INSERT INTO seen_movies(uuid,profile_id,movie_id,title,watched_at,created_at,updated_at) \
         VALUES(?1,'default',?2,'T',?3,?4,?4) \
         ON CONFLICT(profile_id,movie_id) DO UPDATE SET watched_at=excluded.watched_at,updated_at=excluded.updated_at",
    )
    .bind(sim_uuid())
    .bind(movie_id)
    .bind(watched_at)
    .bind(at)
    .execute(pool)
    .await
    .unwrap();
}

async fn local_seen_delete(pool: &SqlitePool, movie_id: i64) {
    sqlx::query("DELETE FROM seen_movies WHERE profile_id='default' AND movie_id=?1")
        .bind(movie_id)
        .execute(pool)
        .await
        .unwrap();
}

async fn local_episode_upsert(
    pool: &SqlitePool,
    series_id: i64,
    episode_id: i64,
    watched: i64,
    at: &str,
) {
    sqlx::query(
        "INSERT INTO episode_progress(uuid,profile_id,series_id,episode_id,season_number,episode_number,watched,created_at,updated_at) \
         VALUES(?1,'default',?2,?3,1,?3,?4,?5,?5) \
         ON CONFLICT(profile_id,series_id,episode_id) DO UPDATE SET watched=excluded.watched,updated_at=excluded.updated_at",
    )
    .bind(sim_uuid())
    .bind(series_id)
    .bind(episode_id)
    .bind(watched)
    .bind(at)
    .execute(pool)
    .await
    .unwrap();
}

async fn local_tracked_upsert(pool: &SqlitePool, series_id: i64, total: i64, at: &str) {
    sqlx::query(
        "INSERT INTO tracked_series(uuid,profile_id,series_id,title,total_episodes,created_at,updated_at) \
         VALUES(?1,'default',?2,'T',?3,?4,?4) \
         ON CONFLICT(profile_id,series_id) DO UPDATE SET total_episodes=excluded.total_episodes,updated_at=excluded.updated_at",
    )
    .bind(sim_uuid())
    .bind(series_id)
    .bind(total)
    .bind(at)
    .execute(pool)
    .await
    .unwrap();
}

async fn local_tracked_delete(pool: &SqlitePool, series_id: i64) {
    sqlx::query("DELETE FROM tracked_series WHERE profile_id='default' AND series_id=?1")
        .bind(series_id)
        .execute(pool)
        .await
        .unwrap();
}

async fn local_alert_upsert(pool: &SqlitePool, media_id: i64, enabled: i64, at: &str) {
    sqlx::query(
        "INSERT INTO availability_alerts(uuid,profile_id,media_id,media_type,title,region,provider_ids,enabled,created_at,updated_at) \
         VALUES(?1,'default',?2,'movie','T','FR','[]',?3,?4,?4) \
         ON CONFLICT(profile_id,media_id,media_type) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at",
    )
    .bind(sim_uuid())
    .bind(media_id)
    .bind(enabled)
    .bind(at)
    .execute(pool)
    .await
    .unwrap();
}

async fn local_alert_delete(pool: &SqlitePool, media_id: i64) {
    sqlx::query("DELETE FROM availability_alerts WHERE profile_id='default' AND media_id=?1")
        .bind(media_id)
        .execute(pool)
        .await
        .unwrap();
}

pub(super) async fn local_list_create(pool: &SqlitePool, name: &str, at: &str) -> String {
    let uuid = sim_uuid();
    sqlx::query(
        "INSERT INTO custom_lists(uuid,profile_id,name,created_at,updated_at) VALUES(?1,'default',?2,?3,?3)",
    )
    .bind(&uuid)
    .bind(name)
    .bind(at)
    .execute(pool)
    .await
    .unwrap();
    uuid
}

pub(super) async fn local_list_rename(pool: &SqlitePool, list_id: &str, name: &str, at: &str) {
    sqlx::query("UPDATE custom_lists SET name=?1,updated_at=?2 WHERE uuid=?3")
        .bind(name)
        .bind(at)
        .bind(list_id)
        .execute(pool)
        .await
        .unwrap();
}

pub(super) async fn local_list_item_add(pool: &SqlitePool, list_id: &str, media_id: i64, at: &str) {
    sqlx::query(
        "INSERT INTO custom_list_items(uuid,list_id,media_id,media_type,title,position,added_at,updated_at) \
         VALUES(?1,?2,?3,'movie','T',(SELECT COALESCE(MAX(position)+1,0) FROM custom_list_items WHERE list_id=?2),?4,?4) \
         ON CONFLICT(list_id,media_id,media_type) DO UPDATE SET updated_at=excluded.updated_at",
    )
    .bind(sim_uuid())
    .bind(list_id)
    .bind(media_id)
    .bind(at)
    .execute(pool)
    .await
    .unwrap();
}

pub(super) async fn local_list_item_remove(pool: &SqlitePool, list_id: &str, media_id: i64) {
    sqlx::query("DELETE FROM custom_list_items WHERE list_id=?1 AND media_id=?2")
        .bind(list_id)
        .bind(media_id)
        .execute(pool)
        .await
        .unwrap();
}

/// What `lists::custom::repository::remove_impl` does: items first, then the list.
pub(super) async fn local_list_delete(pool: &SqlitePool, list_id: &str) {
    sqlx::query("DELETE FROM custom_list_items WHERE list_id=?1")
        .bind(list_id)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM custom_lists WHERE uuid=?1")
        .bind(list_id)
        .execute(pool)
        .await
        .unwrap();
}

// ---------------------------------------------------------------------------
// Snapshot: the observable state, with business-keyed rows compared by key
// (their uuid is device-local identity — see upsert_entity).
// ---------------------------------------------------------------------------

pub(super) async fn snapshot(pool: &SqlitePool) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    let rows: Vec<(i64, String, String)> =
        sqlx::query_as("SELECT media_id,status,updated_at FROM library_items")
            .fetch_all(pool)
            .await
            .unwrap();
    for (id, status, at) in rows {
        out.insert(format!("lib:{id}:{status}:{at}"));
    }
    let rows: Vec<(i64, String, String)> =
        sqlx::query_as("SELECT movie_id,watched_at,updated_at FROM seen_movies")
            .fetch_all(pool)
            .await
            .unwrap();
    for (id, watched, at) in rows {
        out.insert(format!("seen:{id}:{watched}:{at}"));
    }
    let rows: Vec<(i64, i64, i64, String)> =
        sqlx::query_as("SELECT series_id,episode_id,watched,updated_at FROM episode_progress")
            .fetch_all(pool)
            .await
            .unwrap();
    for (series, episode, watched, at) in rows {
        out.insert(format!("ep:{series}:{episode}:{watched}:{at}"));
    }
    let rows: Vec<(i64, i64, String)> =
        sqlx::query_as("SELECT series_id,total_episodes,updated_at FROM tracked_series")
            .fetch_all(pool)
            .await
            .unwrap();
    for (series, total, at) in rows {
        out.insert(format!("tracked:{series}:{total}:{at}"));
    }
    let rows: Vec<(i64, i64, String)> =
        sqlx::query_as("SELECT media_id,enabled,updated_at FROM availability_alerts")
            .fetch_all(pool)
            .await
            .unwrap();
    for (id, enabled, at) in rows {
        out.insert(format!("alert:{id}:{enabled}:{at}"));
    }
    let rows: Vec<(String, String, String)> =
        sqlx::query_as("SELECT uuid,name,updated_at FROM custom_lists")
            .fetch_all(pool)
            .await
            .unwrap();
    for (uuid, name, at) in rows {
        out.insert(format!("list:{uuid}:{name}:{at}"));
    }
    let rows: Vec<(String, i64)> = sqlx::query_as("SELECT list_id,media_id FROM custom_list_items")
        .fetch_all(pool)
        .await
        .unwrap();
    for (list, media) in rows {
        out.insert(format!("item:{list}:{media}"));
    }
    out
}

/// Compact dump of what one device holds, for failure messages.
pub(super) async fn dump_device(pool: &SqlitePool, entity_type: &str) -> String {
    let outbox: Vec<(String, String, i64)> = sqlx::query_as(
        "SELECT entity_id,operation,base_version FROM sync_outbox WHERE entity_type=?1 ORDER BY entity_id",
    )
    .bind(entity_type)
    .fetch_all(pool)
    .await
    .unwrap();
    let state: Vec<(String, i64, i64)> = sqlx::query_as(
        "SELECT entity_id,remote_version,deleted FROM sync_entity_state WHERE entity_type=?1 ORDER BY entity_id",
    )
    .bind(entity_type)
    .fetch_all(pool)
    .await
    .unwrap();
    let table = match entity_type {
        "library_item" => "library_items",
        "seen_movie" => "seen_movies",
        "episode_progress" => "episode_progress",
        "tracked_series" => "tracked_series",
        "availability_alert" => "availability_alerts",
        "custom_list_item" => "custom_list_items",
        _ => "custom_lists",
    };
    let rows: Vec<(String, String)> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT uuid, updated_at FROM {table} ORDER BY uuid"
    )))
    .fetch_all(pool)
    .await
    .unwrap();
    format!("rows={rows:?}\noutbox={outbox:?}\nstate={state:?}")
}

pub(super) async fn outbox_len(pool: &SqlitePool) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM sync_outbox")
        .fetch_one(pool)
        .await
        .unwrap()
}

// ---------------------------------------------------------------------------
// Deterministic pseudo-random generator (no rand dependency)
// ---------------------------------------------------------------------------

pub(super) struct Rng(u64);

impl Rng {
    pub(super) fn new(seed: u64) -> Self {
        Self(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1)
    }
    pub(super) fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    pub(super) fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

const STATUSES: [&str; 4] = ["planned", "watching", "completed", "dropped"];

async fn random_edit(pool: &SqlitePool, rng: &mut Rng, tick: u32) -> String {
    let at = ts(tick);
    let media = rng.below(3) as i64 + 1;
    match rng.below(16) {
        0..=2 => {
            let status = STATUSES[rng.below(4) as usize];
            local_library_upsert(pool, media, status, &at).await;
            format!("library_upsert {media} {status} @{tick}")
        }
        3 => {
            local_library_delete(pool, media).await;
            format!("library_delete {media}")
        }
        4 | 5 => {
            local_seen_upsert(pool, media, &at, &at).await;
            format!("seen_upsert {media} @{tick}")
        }
        6 => {
            local_seen_delete(pool, media).await;
            format!("seen_delete {media}")
        }
        7 => {
            let watched = rng.below(2) as i64;
            local_episode_upsert(pool, 1, media, watched, &at).await;
            format!("episode_upsert {media} {watched} @{tick}")
        }
        8 => {
            let total = rng.below(20) as i64;
            local_tracked_upsert(pool, media, total, &at).await;
            format!("tracked_upsert {media} {total} @{tick}")
        }
        9 => {
            local_tracked_delete(pool, media).await;
            format!("tracked_delete {media}")
        }
        10 => {
            let enabled = rng.below(2) as i64;
            local_alert_upsert(pool, media, enabled, &at).await;
            format!("alert_upsert {media} {enabled} @{tick}")
        }
        11 => {
            local_alert_delete(pool, media).await;
            format!("alert_delete {media}")
        }
        12 => {
            let id = local_list_create(pool, &format!("L{tick}"), &at).await;
            format!("list_create {id} @{tick}")
        }
        13..=15 => {
            let lists: Vec<(String,)> =
                sqlx::query_as("SELECT uuid FROM custom_lists ORDER BY uuid")
                    .fetch_all(pool)
                    .await
                    .unwrap();
            if lists.is_empty() {
                return "noop".to_string();
            }
            let list = &lists[rng.below(lists.len() as u64) as usize].0;
            match rng.below(4) {
                0 | 1 => {
                    local_list_item_add(pool, list, media, &at).await;
                    format!("item_add {list} {media}")
                }
                2 => {
                    local_list_item_remove(pool, list, media).await;
                    format!("item_remove {list} {media}")
                }
                _ => {
                    if rng.below(2) == 0 {
                        local_list_rename(pool, list, &format!("R{tick}"), &at).await;
                        format!("list_rename {list} @{tick}")
                    } else {
                        local_list_delete(pool, list).await;
                        format!("list_delete {list}")
                    }
                }
            }
        }
        _ => unreachable!(),
    }
}

async fn run_random_scenario(seed: u64, steps: u32, devices: usize) {
    let mut rng = Rng::new(seed);
    seed_sim_uuids(seed);
    let mut server = FakeServer::default();
    let mut pools = Vec::new();
    for _ in 0..devices {
        pools.push(new_device().await);
    }
    let mut tick = 0;
    let mut trace: Vec<String> = Vec::new();
    for _ in 0..steps {
        let device = rng.below(devices as u64) as usize;
        if rng.below(4) == 0 {
            trace.push(format!("device {device}: sync"));
            sync_round(&pools[device], &mut server).await;
        } else {
            tick += 1;
            let what = random_edit(&pools[device], &mut rng, tick).await;
            trace.push(format!("device {device}: {what}"));
        }
    }
    let refs: Vec<&SqlitePool> = pools.iter().collect();
    settle(&refs, &mut server).await;
    let first = snapshot(&pools[0]).await;
    for (index, pool) in pools.iter().enumerate().skip(1) {
        let other = snapshot(pool).await;
        if first != other {
            let kind = first
                .symmetric_difference(&other)
                .next()
                .map(|line| match line.split(':').next().unwrap_or_default() {
                    "lib" => "library_item",
                    "seen" => "seen_movie",
                    "ep" => "episode_progress",
                    "tracked" => "tracked_series",
                    "alert" => "availability_alert",
                    "item" => "custom_list_item",
                    _ => "custom_list",
                })
                .unwrap_or("library_item");
            let mut detail = format!("server ({kind}):\n{}", server.dump(kind));
            for (number, device) in pools.iter().enumerate() {
                detail.push_str(&format!(
                    "device {number}:\n{}\n",
                    dump_device(device, kind).await
                ));
            }
            panic!(
                "seed {seed}: device 0 and device {index} diverged after settling\nonly on 0: {:?}\nonly on {index}: {:?}\n{detail}\ntrace:\n{}",
                first.difference(&other).collect::<Vec<_>>(),
                other.difference(&first).collect::<Vec<_>>(),
                trace.join("\n")
            );
        }
    }
    for pool in &pools {
        assert_eq!(
            outbox_len(pool).await,
            0,
            "seed {seed}: outbox not drained after settling"
        );
    }
}

#[tokio::test]
async fn two_devices_converge_after_random_edit_and_sync_sequences() {
    for seed in 1..=60 {
        run_random_scenario(seed, 90, 2).await;
    }
}

#[tokio::test]
async fn three_devices_converge_after_random_edit_and_sync_sequences() {
    for seed in 100..=130 {
        run_random_scenario(seed, 100, 3).await;
    }
}

/// Replays one scenario: `SYNC_SIM_SEED=110 SYNC_SIM_STEPS=90 SYNC_SIM_DEVICES=2
/// cargo test replay_one_simulation_seed -- --ignored`. Handy to read the
/// trace of a seed a larger sweep reported.
#[tokio::test]
#[ignore]
async fn replay_one_simulation_seed() {
    let read = |name: &str, default: u64| {
        std::env::var(name)
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(default)
    };
    run_random_scenario(
        read("SYNC_SIM_SEED", 1),
        read("SYNC_SIM_STEPS", 90) as u32,
        read("SYNC_SIM_DEVICES", 2) as usize,
    )
    .await;
}
