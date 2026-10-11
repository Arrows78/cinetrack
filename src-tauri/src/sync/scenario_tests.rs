//! Targeted multi-device scenarios on top of the fake server in
//! `simulation_tests.rs`: one named rule each, with the exact sequence that
//! used to (or could) break it.

use sqlx::SqlitePool;

use super::models::RemoteSyncChange;
use super::service;
use super::simulation_tests::{
    FakeServer, SIM_ACCOUNT, local_episode_upsert, local_library_delete, local_library_upsert,
    local_list_create, local_list_delete, local_list_item_add, local_list_rename,
    local_seen_delete, local_seen_upsert, new_device, outbox_len, pull, push, settle, sync_round,
    ts,
};

async fn lib_status(pool: &SqlitePool, media_id: i64) -> Option<String> {
    sqlx::query_scalar("SELECT status FROM library_items WHERE media_id=?1")
        .bind(media_id)
        .fetch_optional(pool)
        .await
        .unwrap()
}

async fn add_unlinked_profile(pool: &SqlitePool, id: &str) {
    sqlx::query("INSERT INTO profiles(uuid,name,created_at,updated_at) VALUES(?1,?1,'t','t')")
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
}

async fn activate(pool: &SqlitePool, profile_id: &str) {
    sqlx::query(
        "INSERT INTO preferences(key,value,updated_at) VALUES('activeProfileId',?1,'t') \
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .bind(format!("\"{profile_id}\""))
    .execute(pool)
    .await
    .unwrap();
}

#[tokio::test]
async fn a_failed_push_keeps_every_mutation_and_the_retry_delivers_it() {
    let (a, b) = (new_device().await, new_device().await);
    let mut server = FakeServer::default();
    local_library_upsert(&a, 1, "watching", &ts(1)).await;
    local_library_upsert(&a, 2, "planned", &ts(2)).await;

    server.fail_next_batches = 2;
    assert!(push(&a, &mut server).await.is_err());
    assert!(push(&a, &mut server).await.is_err());
    assert_eq!(
        outbox_len(&a).await,
        2,
        "network failures must not drop mutations"
    );
    assert_eq!(service::status(&a).await.unwrap().pending_count, 2);

    local_library_upsert(&a, 1, "completed", &ts(3)).await;
    assert_eq!(
        outbox_len(&a).await,
        2,
        "a new edit of the same row replaces its pending mutation, it doesn't add one"
    );

    settle(&[&a, &b], &mut server).await;
    assert_eq!(lib_status(&b, 1).await.as_deref(), Some("completed"));
    assert_eq!(lib_status(&b, 2).await.as_deref(), Some("planned"));
    assert_eq!(outbox_len(&a).await, 0);
}

#[tokio::test]
async fn a_push_whose_ack_was_lost_is_deduplicated_when_retried() {
    let a = new_device().await;
    let mut server = FakeServer::default();
    local_library_upsert(&a, 1, "watching", &ts(1)).await;

    // The server processes the batch, the response never reaches the device.
    let sent = service::list_outbox(&a, 100).await.unwrap();
    server.apply_batch(&sent).unwrap();
    assert_eq!(server.changes.len(), 1);
    assert_eq!(outbox_len(&a).await, 1);

    push(&a, &mut server).await.unwrap();
    assert_eq!(outbox_len(&a).await, 0);
    assert_eq!(
        server.changes.len(),
        1,
        "the retried mutation id must not create a second version"
    );
    let version: i64 = sqlx::query_scalar(
        "SELECT remote_version FROM sync_entity_state WHERE entity_type='library_item'",
    )
    .fetch_one(&a)
    .await
    .unwrap();
    assert_eq!(version, 1);
}

#[tokio::test]
async fn a_partially_rejected_batch_acks_the_accepted_and_keeps_the_conflicting_one() {
    let (a, b) = (new_device().await, new_device().await);
    let mut server = FakeServer::default();
    local_library_upsert(&a, 1, "planned", &ts(1)).await;
    local_library_upsert(&a, 2, "planned", &ts(1)).await;
    sync_round(&a, &mut server).await;
    sync_round(&b, &mut server).await;

    // B edits item 1 and gets there first; A, offline, edits both items.
    local_library_upsert(&b, 1, "dropped", &ts(5)).await;
    sync_round(&b, &mut server).await;
    local_library_upsert(&a, 1, "completed", &ts(6)).await;
    local_library_upsert(&a, 2, "watching", &ts(6)).await;

    let batch = service::list_outbox(&a, 100).await.unwrap();
    assert_eq!(batch.len(), 2);
    let (acks, conflicts) = server.apply_batch(&batch).unwrap();
    assert_eq!((acks.len(), conflicts.len()), (1, 1));
    service::ack_mutations(&a, &acks).await.unwrap();
    service::rebase_conflicts(&a, &conflicts).await.unwrap();

    let left = service::list_outbox(&a, 100).await.unwrap();
    assert_eq!(left.len(), 1, "only the rejected mutation stays queued");
    assert_eq!(left[0].attempt_count, 1);
    assert_eq!(left[0].base_version, conflicts[0].server_version);
    let status = service::status(&a).await.unwrap();
    assert_eq!((status.pending_count, status.conflict_count), (1, 1));
    assert_eq!(
        lib_status(&a, 1).await.as_deref(),
        Some("completed"),
        "the local value is untouched by the conflict"
    );

    // Pending-local-wins: the retry lands and every device converges on it.
    settle(&[&a, &b], &mut server).await;
    assert_eq!(lib_status(&b, 1).await.as_deref(), Some("completed"));
    assert_eq!(lib_status(&b, 2).await.as_deref(), Some("watching"));
    assert_eq!(service::status(&a).await.unwrap().conflict_count, 0);
}

#[tokio::test]
async fn an_ack_does_not_delete_an_edit_made_while_the_upload_was_in_flight() {
    let a = new_device().await;
    let mut server = FakeServer::default();
    local_library_upsert(&a, 1, "planned", &ts(1)).await;

    let in_flight = service::list_outbox(&a, 100).await.unwrap();
    let (acks, _) = server.apply_batch(&in_flight).unwrap();
    // The user edits the same row before the response comes back.
    local_library_upsert(&a, 1, "completed", &ts(2)).await;
    service::ack_mutations(&a, &acks).await.unwrap();

    let left = service::list_outbox(&a, 100).await.unwrap();
    assert_eq!(left.len(), 1);
    assert_eq!(
        left[0].base_version, 1,
        "moved onto the acknowledged version"
    );
    push(&a, &mut server).await.unwrap();
    assert_eq!(outbox_len(&a).await, 0);
    let doc = server
        .docs
        .get(&("library_item".to_string(), left[0].entity_id.clone()))
        .unwrap();
    assert_eq!(doc.version, 2);
    assert_eq!(doc.data.as_ref().unwrap()["status"], "completed");
}

#[tokio::test]
async fn a_pending_local_edit_beats_a_remote_change_and_moves_onto_its_version() {
    let (a, b) = (new_device().await, new_device().await);
    let mut server = FakeServer::default();
    local_library_upsert(&a, 1, "planned", &ts(1)).await;
    sync_round(&a, &mut server).await;
    sync_round(&b, &mut server).await;

    local_library_upsert(&b, 1, "dropped", &ts(2)).await;
    sync_round(&b, &mut server).await;
    local_library_upsert(&a, 1, "completed", &ts(3)).await;
    // A pulls B's change while its own edit is still waiting.
    pull(&a, &server, 200).await;
    assert_eq!(lib_status(&a, 1).await.as_deref(), Some("completed"));
    let pending = service::list_outbox(&a, 10).await.unwrap();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].base_version, 2, "based on B's version");
    assert_eq!(pending[0].attempt_count, 0, "not a failed attempt");

    settle(&[&a, &b], &mut server).await;
    assert_eq!(lib_status(&b, 1).await.as_deref(), Some("completed"));
}

#[tokio::test]
async fn a_remote_delete_keeps_a_row_with_an_unpushed_edit_and_the_edit_brings_it_back() {
    let (a, b) = (new_device().await, new_device().await);
    let mut server = FakeServer::default();
    local_library_upsert(&a, 1, "planned", &ts(1)).await;
    sync_round(&a, &mut server).await;
    sync_round(&b, &mut server).await;

    local_library_delete(&a, 1).await;
    sync_round(&a, &mut server).await;
    local_library_upsert(&b, 1, "watching", &ts(4)).await;
    // The delete reaches B while its edit is still pending.
    pull(&b, &server, 200).await;
    assert_eq!(lib_status(&b, 1).await.as_deref(), Some("watching"));

    settle(&[&a, &b], &mut server).await;
    assert_eq!(lib_status(&a, 1).await.as_deref(), Some("watching"));
    assert_eq!(lib_status(&b, 1).await.as_deref(), Some("watching"));
}

#[tokio::test]
async fn a_delete_reaches_the_other_device_even_when_both_added_the_title_first() {
    let (a, b) = (new_device().await, new_device().await);
    let mut server = FakeServer::default();
    // Same title added on both devices before any sync: two uuids.
    local_library_upsert(&a, 1, "planned", &ts(1)).await;
    local_library_upsert(&b, 1, "planned", &ts(2)).await;
    settle(&[&a, &b], &mut server).await;
    assert_eq!(lib_status(&a, 1).await.as_deref(), Some("planned"));
    assert_eq!(lib_status(&b, 1).await.as_deref(), Some("planned"));

    local_library_delete(&a, 1).await;
    settle(&[&a, &b], &mut server).await;
    assert_eq!(lib_status(&a, 1).await, None);
    assert_eq!(
        lib_status(&b, 1).await,
        None,
        "the tombstone must reach B's row"
    );
}

#[tokio::test]
async fn settled_devices_stay_quiet_no_echo_loop() {
    let (a, b) = (new_device().await, new_device().await);
    let mut server = FakeServer::default();
    local_library_upsert(&a, 1, "planned", &ts(1)).await;
    local_library_upsert(&b, 1, "watching", &ts(2)).await;
    let list = local_list_create(&a, "L", &ts(3)).await;
    local_list_item_add(&a, &list, 7, &ts(4)).await;
    settle(&[&a, &b], &mut server).await;

    let settled = server.changes.len();
    settle(&[&a, &b], &mut server).await;
    settle(&[&a, &b], &mut server).await;
    assert_eq!(
        server.changes.len(),
        settled,
        "applying remote changes must never queue mutations that bounce back"
    );
    assert_eq!(outbox_len(&a).await + outbox_len(&b).await, 0);
}

#[tokio::test]
async fn a_list_item_pushed_before_its_list_still_reaches_a_new_device() {
    let (a, b) = (new_device().await, new_device().await);
    let mut server = FakeServer::default();
    let list = local_list_create(&a, "Before", &ts(1)).await;
    local_list_item_add(&a, &list, 7, &ts(2)).await;
    // Renaming the list afterwards moves its single outbox row after the
    // item's: chronological order alone would push the item first.
    local_list_rename(&a, &list, "After", &ts(3)).await;
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    local_list_rename(&a, &list, "After again", &ts(4)).await;

    push(&a, &mut server).await.unwrap();
    let first_batch = &server.batches_seen[0];
    let list_position = first_batch
        .iter()
        .position(|m| m.0 == "custom_list")
        .unwrap();
    let item_position = first_batch
        .iter()
        .position(|m| m.0 == "custom_list_item")
        .unwrap();
    assert!(
        list_position < item_position,
        "parents are pushed before their children"
    );

    sync_round(&b, &mut server).await;
    let items: Vec<(i64,)> = sqlx::query_as("SELECT media_id FROM custom_list_items")
        .fetch_all(&b)
        .await
        .unwrap();
    assert_eq!(items, vec![(7,)]);
}

#[tokio::test]
async fn a_list_item_pulled_before_its_list_waits_for_it_instead_of_being_lost() {
    let b = new_device().await;
    let mut server = FakeServer::default();
    // The feed carries the item (sequence 1) before its list (sequence 2),
    // and they reach the device in different pages.
    let item_payload = serde_json::json!({
        "uuid": "item-1", "listId": "list-1", "mediaId": 7, "mediaType": "movie",
        "title": "T", "position": 0, "addedAt": ts(1), "updatedAt": ts(1),
    });
    let list_payload = serde_json::json!({
        "uuid": "list-1", "name": "L", "description": null, "createdAt": ts(1), "updatedAt": ts(1),
    });
    for (entity_type, id, data) in [
        ("custom_list_item", "item-1", item_payload),
        ("custom_list", "list-1", list_payload),
    ] {
        let sequence = server.changes.len() as i64 + 1;
        server.changes.push(RemoteSyncChange {
            sequence,
            entity_type: entity_type.to_string(),
            entity_id: id.to_string(),
            operation: "upsert".to_string(),
            version: 1,
            data: Some(data),
        });
    }
    service::prepare_for_account(&b, SIM_ACCOUNT).await.unwrap();
    pull(&b, &server, 1).await;

    let items: Vec<(String, String)> =
        sqlx::query_as("SELECT uuid, list_id FROM custom_list_items")
            .fetch_all(&b)
            .await
            .unwrap();
    assert_eq!(items, vec![("item-1".to_string(), "list-1".to_string())]);
    assert_eq!(outbox_len(&b).await, 0);
    let parked: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sync_metadata WHERE key LIKE 'orphan:%'")
            .fetch_one(&b)
            .await
            .unwrap();
    assert_eq!(parked, 0, "nothing stays parked once the list is there");
}

#[tokio::test]
async fn items_of_a_list_deleted_elsewhere_come_back_with_the_list() {
    let (a, b) = (new_device().await, new_device().await);
    let mut server = FakeServer::default();
    let list = local_list_create(&a, "L", &ts(1)).await;
    sync_round(&a, &mut server).await;
    sync_round(&b, &mut server).await;

    // B deletes the list while A, concurrently, adds an item to it.
    local_list_delete(&b, &list).await;
    local_list_item_add(&a, &list, 7, &ts(5)).await;
    sync_round(&b, &mut server).await;
    // A's unpushed edit of the list keeps it alive and brings it back.
    local_list_rename(&a, &list, "Back", &ts(6)).await;

    settle(&[&a, &b], &mut server).await;
    for pool in [&a, &b] {
        let rows: Vec<(String,)> = sqlx::query_as("SELECT name FROM custom_lists")
            .fetch_all(pool)
            .await
            .unwrap();
        assert_eq!(rows, vec![("Back".to_string(),)]);
        let items: Vec<(i64,)> = sqlx::query_as("SELECT media_id FROM custom_list_items")
            .fetch_all(pool)
            .await
            .unwrap();
        assert_eq!(items, vec![(7,)]);
    }
}

#[tokio::test]
async fn changes_of_an_unknown_entity_type_move_the_cursor_instead_of_looping() {
    let a = new_device().await;
    let unknown = |sequence: i64| RemoteSyncChange {
        sequence,
        entity_type: "entity_from_a_newer_app".to_string(),
        entity_id: format!("x{sequence}"),
        operation: "upsert".to_string(),
        version: 1,
        data: Some(serde_json::json!({})),
    };
    service::apply_remote_changes(&a, &[unknown(1), unknown(2), unknown(3)])
        .await
        .unwrap();
    assert_eq!(
        service::cursor(&a).await.unwrap(),
        3,
        "a page made only of unsupported changes must still advance the cursor"
    );
}

#[tokio::test]
async fn data_of_another_profile_is_never_pushed_or_overwritten() {
    let a = new_device().await;
    let mut server = FakeServer::default();
    add_unlinked_profile(&a, "kid").await;

    // A row of the other profile, written the way the app would.
    sqlx::query(
        "INSERT INTO library_items(uuid,profile_id,media_id,media_type,title,status,created_at,updated_at) \
         VALUES('kid-item','kid',9,'movie','Kid movie','planned','t','t')",
    )
    .execute(&a)
    .await
    .unwrap();
    local_library_upsert(&a, 1, "watching", &ts(1)).await;

    sync_round(&a, &mut server).await;
    let pushed: Vec<String> = server.docs.keys().map(|(_, id)| id.clone()).collect();
    assert!(
        !pushed.contains(&"kid-item".to_string()),
        "the other profile's row must not be pushed under this account"
    );

    // A remote change lands on the active profile only; the other profile's
    // row for the same title is left alone.
    let remote = RemoteSyncChange {
        sequence: 99,
        entity_type: "library_item".to_string(),
        entity_id: "remote-9".to_string(),
        operation: "upsert".to_string(),
        version: 1,
        data: Some(serde_json::json!({
            "uuid": "remote-9", "mediaId": 9, "mediaType": "movie", "title": "Remote",
            "status": "completed", "createdAt": ts(1), "updatedAt": ts(2),
        })),
    };
    service::apply_remote_changes(&a, &[remote]).await.unwrap();
    let rows: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT profile_id, uuid, status FROM library_items WHERE media_id=9 ORDER BY profile_id",
    )
    .fetch_all(&a)
    .await
    .unwrap();
    assert_eq!(
        rows,
        vec![
            (
                "default".to_string(),
                "remote-9".to_string(),
                "completed".to_string()
            ),
            (
                "kid".to_string(),
                "kid-item".to_string(),
                "planned".to_string()
            ),
        ]
    );

    // Cursors and outboxes are per profile.
    assert_eq!(service::cursor(&a).await.unwrap(), 99);
    activate(&a, "kid").await;
    assert_eq!(service::cursor(&a).await.unwrap(), 0);
    let kid_outbox = service::list_outbox(&a, 100).await.unwrap();
    assert_eq!(kid_outbox.len(), 1);
    assert_eq!(kid_outbox[0].entity_id, "kid-item");
}

#[tokio::test]
async fn a_sync_run_only_starts_on_the_profile_linked_to_the_signed_in_account() {
    let a = new_device().await;
    assert!(service::prepare_for_account(&a, SIM_ACCOUNT).await.is_ok());
    assert!(
        service::prepare_for_account(&a, "user_someone_else")
            .await
            .is_err(),
        "another account must not sync into this profile"
    );
    assert!(service::prepare_for_account(&a, "").await.is_err());

    // An unlinked profile never syncs either.
    add_unlinked_profile(&a, "kid").await;
    activate(&a, "kid").await;
    assert!(service::prepare_for_account(&a, SIM_ACCOUNT).await.is_err());

    // A run bound to one profile stops when the active profile changes.
    assert!(service::assert_run_profile(&a, "kid").await.is_ok());
    assert!(service::assert_run_profile(&a, "default").await.is_err());
}

#[tokio::test]
async fn account_preferences_from_the_cloud_are_limited_to_the_account_scope_keys() {
    let a = new_device().await;
    let change = |sequence: i64, key: &str, value: &str| RemoteSyncChange {
        sequence,
        entity_type: "account_preferences".to_string(),
        entity_id: key.to_string(),
        operation: "upsert".to_string(),
        version: 1,
        data: Some(
            serde_json::json!({ "key": key, "value": value, "updatedAt": "2026-01-01T00:00:00.000Z" }),
        ),
    };
    service::apply_remote_changes(
        &a,
        &[
            change(1, "language", "\"fr\""),
            // Device-level and security-relevant keys never travel, so they
            // must never be accepted back either.
            change(2, "activeProfileId", "\"kid\""),
            change(3, "backupDirectory", "\"/tmp/elsewhere\""),
            change(4, "theme", "\"light\""),
            // A value the preferences layer would refuse.
            change(5, "region", "\"not-a-region\""),
            change(6, "accentColor", "not json at all"),
        ],
    )
    .await
    .unwrap();

    let stored: Vec<(String,)> = sqlx::query_as("SELECT key FROM preferences ORDER BY key")
        .fetch_all(&a)
        .await
        .unwrap();
    assert_eq!(stored, vec![("language".to_string(),)]);
    assert_eq!(
        service::cursor(&a).await.unwrap(),
        6,
        "rejected documents still move the cursor"
    );
}

async fn insert_library_entry(
    pool: &SqlitePool,
    media_id: i64,
    media_type: &str,
    status: &str,
    origin: &str,
) {
    sqlx::query(
        "INSERT INTO library_items(uuid,profile_id,media_id,media_type,title,status,status_origin,created_at,updated_at) \
         VALUES(lower(hex(randomblob(8))),'default',?1,?2,'T',?3,?4,'t','t')",
    )
    .bind(media_id)
    .bind(media_type)
    .bind(status)
    .bind(origin)
    .execute(pool)
    .await
    .unwrap();
}

async fn status_and_origin(pool: &SqlitePool, media_id: i64, media_type: &str) -> (String, String) {
    sqlx::query_as(
        "SELECT status, status_origin FROM library_items WHERE media_id=?1 AND media_type=?2",
    )
    .bind(media_id)
    .bind(media_type)
    .fetch_one(pool)
    .await
    .unwrap()
}

/// Progress pulled from another device brings the library status that goes
/// with it: an automatic status is recomputed from what is now watched here
/// (both ways), a status the viewer chose is not lowered or otherwise moved.
#[tokio::test]
async fn progress_pulled_from_another_device_brings_the_automatic_status_with_it() {
    let (a, b) = (new_device().await, new_device().await);
    let mut server = FakeServer::default();
    // Device B has the series and the movie in its library, status automatic;
    // plus a series whose status the viewer chose (Paused).
    insert_library_entry(&b, 9, "series", "planned", "auto").await;
    insert_library_entry(&b, 55, "movie", "planned", "auto").await;
    insert_library_entry(&b, 10, "series", "paused", "manual").await;

    // Device A watches two episodes of 9, one of 10, and the movie.
    local_episode_upsert(&a, 9, 901, 1, &ts(1)).await;
    local_episode_upsert(&a, 9, 902, 1, &ts(2)).await;
    local_episode_upsert(&a, 10, 1001, 1, &ts(3)).await;
    local_seen_upsert(&a, 55, &ts(4), &ts(4)).await;
    settle(&[&a, &b], &mut server).await;

    assert_eq!(
        status_and_origin(&b, 9, "series").await,
        ("watching".into(), "auto".into())
    );
    assert_eq!(
        status_and_origin(&b, 55, "movie").await,
        ("completed".into(), "auto".into())
    );
    assert_eq!(
        status_and_origin(&b, 10, "series").await,
        ("paused".into(), "manual".into()),
        "a status the viewer chose is not moved by a sync"
    );

    // Device A takes it all back: B follows down.
    local_episode_upsert(&a, 9, 901, 0, &ts(5)).await;
    local_episode_upsert(&a, 9, 902, 0, &ts(6)).await;
    local_seen_delete(&a, 55).await;
    settle(&[&a, &b], &mut server).await;

    // The un-watch reached B as episode rows with watched = 0 (and a delete
    // for the movie): nothing is watched any more.
    assert_eq!(status_and_origin(&b, 9, "series").await.0, "planned");
    assert_eq!(status_and_origin(&b, 55, "movie").await.0, "planned");
}
