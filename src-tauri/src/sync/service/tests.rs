use super::*;
use crate::sync::models::{RemoteSyncChange, SyncConflict, SyncMutationAck};
use sqlx::sqlite::SqlitePoolOptions;

async fn pool() -> SqlitePool {
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

fn upsert_change(
    entity_id: &str,
    sequence: i64,
    version: i64,
    data: serde_json::Value,
) -> RemoteSyncChange {
    RemoteSyncChange {
        sequence,
        entity_type: "library_item".to_string(),
        entity_id: entity_id.to_string(),
        operation: "upsert".to_string(),
        version,
        data: Some(data),
    }
}

fn library_item_payload(uuid: &str, status: &str) -> serde_json::Value {
    serde_json::json!({
        "uuid": uuid,
        "mediaId": 42,
        "mediaType": "movie",
        "title": "Remote Title",
        "status": status,
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-02T00:00:00.000Z",
    })
}

async fn library_item_row(pool: &SqlitePool) -> (String, String) {
    sqlx::query_as(
        "SELECT uuid, status FROM library_items WHERE profile_id='default' AND media_id=42 AND media_type='movie'",
    )
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn library_item_count(pool: &SqlitePool) -> i64 {
    let (count,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM library_items WHERE profile_id='default' AND media_id=42 AND media_type='movie'",
    )
    .fetch_one(pool)
    .await
    .unwrap();
    count
}

/// The core bug this module's `upsert_entity` conflict target fixes: two
/// devices that each added the same title before ever syncing generate
/// two different local uuids for it. A remote change carrying the OTHER
/// device's uuid must merge into this device's own existing row for the
/// same (profile, media) pair — never attempt a second INSERT, which
/// would violate library_items' own UNIQUE(profile_id, media_id,
/// media_type) constraint and abort the whole transaction.
#[tokio::test]
async fn a_remote_upsert_with_a_different_uuid_for_the_same_business_key_merges_into_the_existing_row()
 {
    let pool = pool().await;
    sqlx::query(
        "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at) \
         VALUES ('local-1','default',42,'movie','Local Title','planned','t','t')",
    )
    .execute(&pool)
    .await
    .unwrap();
    // The local row is already in sync (nothing waiting to be pushed).
    sqlx::query("DELETE FROM sync_outbox")
        .execute(&pool)
        .await
        .unwrap();

    let change = upsert_change(
        "remote-1",
        1,
        1,
        library_item_payload("remote-1", "completed"),
    );
    apply_remote_changes(&pool, &[change]).await.unwrap();

    assert_eq!(
        library_item_count(&pool).await,
        1,
        "no duplicate row for the same business key"
    );
    let (uuid, status) = library_item_row(&pool).await;
    assert_eq!(
        uuid, "remote-1",
        "the row takes the uuid of the latest document, so a later delete of it reaches this row"
    );
    assert_eq!(
        status, "completed",
        "the remote field values are still applied"
    );
    assert_eq!(
        outbox_count(&pool).await,
        0,
        "adopting a remote uuid is not a local change to push back"
    );
}

fn change_of(entity_type: &str, entity_id: &str, data: serde_json::Value) -> RemoteSyncChange {
    RemoteSyncChange {
        sequence: 1,
        entity_type: entity_type.to_string(),
        entity_id: entity_id.to_string(),
        operation: "upsert".to_string(),
        version: 1,
        data: Some(data),
    }
}

/// A remote document whose uuid belongs to a row of another profile must
/// not rewrite that row: every uuid-keyed upsert is scoped to the
/// applying profile.
#[tokio::test]
async fn a_remote_upsert_never_overwrites_another_profiles_row() {
    let pool = pool().await;
    sqlx::query("INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('other','Other','t','t')")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO custom_lists (uuid, profile_id, name, created_at, updated_at) VALUES ('shared-uuid','other','Mine','t','t')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO smart_lists (uuid, profile_id, name, rules, created_at, updated_at) VALUES ('shared-smart','other','Mine','{}','t','t')",
    )
    .execute(&pool)
    .await
    .unwrap();
    let changes = [
        change_of(
            "custom_list",
            "shared-uuid",
            serde_json::json!({"uuid":"shared-uuid","name":"Hijacked","createdAt":"t","updatedAt":"u"}),
        ),
        RemoteSyncChange {
            sequence: 2,
            ..change_of(
                "smart_list",
                "shared-smart",
                serde_json::json!({"uuid":"shared-smart","name":"Hijacked","rules":"{}","createdAt":"t","updatedAt":"u"}),
            )
        },
    ];
    apply_remote_changes(&pool, &changes).await.unwrap();

    let names: Vec<(String, String)> = sqlx::query_as(
        "SELECT profile_id, name FROM custom_lists UNION ALL SELECT profile_id, name FROM smart_lists",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        names,
        vec![
            ("other".to_string(), "Mine".to_string()),
            ("other".to_string(), "Mine".to_string())
        ]
    );
}

/// A remote viewing event's date is stored in the canonical UTC form SQL
/// orders by.
#[tokio::test]
async fn a_remote_viewing_event_date_is_stored_canonical() {
    let pool = pool().await;
    let change = change_of(
        "viewing_event",
        "ev-1",
        serde_json::json!({
            "uuid":"ev-1","mediaId":1,"mediaType":"movie","title":"T","eventType":"watched",
            "watchedAt":"2026-03-01T11:00:00+01:00","createdAt":"2026-03-01T11:00:00+01:00"
        }),
    );
    apply_remote_changes(&pool, &[change]).await.unwrap();
    let stored: String =
        sqlx::query_scalar("SELECT watched_at FROM viewing_events WHERE uuid='ev-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(stored, "2026-03-01T10:00:00.000Z");
}

async fn outbox_count(pool: &SqlitePool) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM sync_outbox")
        .fetch_one(pool)
        .await
        .unwrap()
}

/// A local edit that hasn't been pushed yet is never overwritten by a
/// document for the same title carried under another uuid: it keeps its
/// value, moves onto the remote uuid, and goes out as the next version
/// of that document.
#[tokio::test]
async fn a_pending_local_edit_survives_a_remote_document_with_another_uuid() {
    let pool = pool().await;
    sqlx::query(
        "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at) \
         VALUES ('local-1','default',42,'movie','Local Title','planned','t','t')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let change = upsert_change(
        "remote-1",
        1,
        3,
        library_item_payload("remote-1", "completed"),
    );
    apply_remote_changes(&pool, &[change]).await.unwrap();

    let (uuid, status) = library_item_row(&pool).await;
    assert_eq!(status, "planned", "the unpushed local edit wins");
    assert_eq!(uuid, "remote-1");
    let pending = list_outbox(&pool, 10).await.unwrap();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].entity_id, "remote-1");
    assert_eq!(
        pending[0].base_version, 3,
        "rebased on the version just observed, so the push is accepted"
    );
    assert_eq!(pending[0].operation, "upsert");
}

/// The remote device that added a title again after deleting it publishes
/// "delete old uuid" and "upsert new uuid" — in an order the server picks.
/// Whichever comes first, the title must still be there afterwards.
#[tokio::test]
async fn a_title_deleted_and_added_back_elsewhere_survives_in_either_order() {
    for new_document_first in [true, false] {
        let pool = pool().await;
        let old = RemoteSyncChange {
            sequence: 1,
            entity_type: "library_item".to_string(),
            entity_id: "old".to_string(),
            operation: "upsert".to_string(),
            version: 1,
            data: Some(library_item_payload("old", "planned")),
        };
        apply_remote_changes(&pool, &[old]).await.unwrap();

        let deleted = RemoteSyncChange {
            sequence: if new_document_first { 3 } else { 2 },
            entity_type: "library_item".to_string(),
            entity_id: "old".to_string(),
            operation: "delete".to_string(),
            version: 2,
            data: None,
        };
        let added_back = upsert_change(
            "new",
            if new_document_first { 2 } else { 3 },
            1,
            library_item_payload("new", "watching"),
        );
        apply_remote_changes(&pool, &[deleted, added_back])
            .await
            .unwrap();

        assert_eq!(
            library_item_count(&pool).await,
            1,
            "new_document_first={new_document_first}"
        );
        let (uuid, status) = library_item_row(&pool).await;
        assert_eq!((uuid.as_str(), status.as_str()), ("new", "watching"));
    }
}

/// availability_alerts has UNIQUE(profile_id, media_id, media_type) like
/// the four entities the engine already merged by business key, but was
/// applied by uuid: the same alert created on two devices made the
/// remote upsert violate that constraint, which aborted the apply and
/// left the cursor stuck on it forever.
#[tokio::test]
async fn the_same_availability_alert_created_on_two_devices_does_not_block_the_pull() {
    let pool = pool().await;
    sqlx::query(
        "INSERT INTO availability_alerts(uuid,profile_id,media_id,media_type,title,region,provider_ids,enabled,created_at,updated_at) \
         VALUES('local-alert','default',42,'movie','T','FR','[]',1,'t','t')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("DELETE FROM sync_outbox")
        .execute(&pool)
        .await
        .unwrap();

    let change = RemoteSyncChange {
        sequence: 1,
        entity_type: "availability_alert".to_string(),
        entity_id: "remote-alert".to_string(),
        operation: "upsert".to_string(),
        version: 1,
        data: Some(serde_json::json!({
            "uuid": "remote-alert", "mediaId": 42, "mediaType": "movie", "title": "T",
            "region": "BE", "providerIds": "[8]", "enabled": 0,
            "createdAt": "2026-01-01T00:00:00.000Z", "updatedAt": "2026-01-02T00:00:00.000Z",
        })),
    };
    apply_remote_changes(&pool, &[change]).await.unwrap();

    let rows: Vec<(String, String, i64)> =
        sqlx::query_as("SELECT uuid, region, enabled FROM availability_alerts WHERE media_id=42")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(
        rows,
        vec![("remote-alert".to_string(), "BE".to_string(), 0)]
    );
    assert_eq!(cursor(&pool).await.unwrap(), 1);
}

/// Same constraint on custom_list_items: UNIQUE(list_id, media_id,
/// media_type), while the apply conflicted on the item's uuid.
#[tokio::test]
async fn the_same_title_added_to_a_list_on_two_devices_does_not_block_the_pull() {
    let pool = pool().await;
    sqlx::query(
        "INSERT INTO custom_lists(uuid,profile_id,name,created_at,updated_at) VALUES('list-1','default','L','t','t')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO custom_list_items(uuid,list_id,media_id,media_type,title,position,added_at,updated_at) \
         VALUES('local-item','list-1',42,'movie','T',0,'t','t')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("DELETE FROM sync_outbox")
        .execute(&pool)
        .await
        .unwrap();

    let change = RemoteSyncChange {
        sequence: 1,
        entity_type: "custom_list_item".to_string(),
        entity_id: "remote-item".to_string(),
        operation: "upsert".to_string(),
        version: 1,
        data: Some(serde_json::json!({
            "uuid": "remote-item", "listId": "list-1", "mediaId": 42, "mediaType": "movie",
            "title": "T", "position": 3,
            "addedAt": "2026-01-01T00:00:00.000Z", "updatedAt": "2026-01-02T00:00:00.000Z",
        })),
    };
    apply_remote_changes(&pool, &[change]).await.unwrap();

    let rows: Vec<(String, i64)> =
        sqlx::query_as("SELECT uuid, position FROM custom_list_items WHERE list_id='list-1'")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(rows, vec![("remote-item".to_string(), 3)]);
    assert_eq!(cursor(&pool).await.unwrap(), 1);
}

#[tokio::test]
async fn a_remote_upsert_for_a_genuinely_new_entity_still_inserts_normally() {
    let pool = pool().await;

    let change = upsert_change(
        "remote-1",
        1,
        1,
        library_item_payload("remote-1", "completed"),
    );
    apply_remote_changes(&pool, &[change]).await.unwrap();

    assert_eq!(library_item_count(&pool).await, 1);
    let (uuid, _) = library_item_row(&pool).await;
    assert_eq!(uuid, "remote-1");
}

#[tokio::test]
async fn apply_remote_changes_is_idempotent_for_an_already_applied_sequence() {
    let pool = pool().await;
    let change = upsert_change(
        "remote-1",
        1,
        1,
        library_item_payload("remote-1", "completed"),
    );
    apply_remote_changes(&pool, std::slice::from_ref(&change))
        .await
        .unwrap();

    // Re-applying the exact same sequence (e.g. a retried pull) must not
    // error and must not change anything a second time.
    apply_remote_changes(&pool, &[change]).await.unwrap();

    assert_eq!(library_item_count(&pool).await, 1);
    assert_eq!(cursor(&pool).await.unwrap(), 1);
}

async fn local_status_origin(pool: &SqlitePool) -> String {
    sqlx::query_scalar(
        "SELECT status_origin FROM library_items WHERE profile_id='default' AND media_id=42 AND media_type='movie'",
    )
    .fetch_one(pool)
    .await
    .unwrap()
}

#[tokio::test]
async fn a_remote_library_item_carries_who_set_its_status() {
    let pool = pool().await;
    let mut payload = library_item_payload("remote-1", "completed");
    payload["statusOrigin"] = serde_json::json!("auto");

    apply_remote_changes(&pool, &[upsert_change("remote-1", 1, 1, payload)])
        .await
        .unwrap();
    assert_eq!(local_status_origin(&pool).await, "auto");

    // A payload from a client that predates the field keeps what is
    // already stored instead of resetting it...
    apply_remote_changes(
        &pool,
        &[upsert_change(
            "remote-1",
            2,
            2,
            library_item_payload("remote-1", "completed"),
        )],
    )
    .await
    .unwrap();
    assert_eq!(local_status_origin(&pool).await, "auto");

    // ...and a new row from such a client is conservatively manual.
    sqlx::query("DELETE FROM library_items")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM sync_outbox")
        .execute(&pool)
        .await
        .unwrap();
    apply_remote_changes(
        &pool,
        &[upsert_change(
            "remote-1",
            3,
            3,
            library_item_payload("remote-1", "completed"),
        )],
    )
    .await
    .unwrap();
    assert_eq!(local_status_origin(&pool).await, "manual");
}

#[tokio::test]
async fn a_remote_document_missing_a_required_value_is_skipped_and_the_cursor_still_advances() {
    let pool = pool().await;
    let mut broken = library_item_payload("remote-2", "completed");
    broken["mediaId"] = serde_json::json!(43);
    broken.as_object_mut().unwrap().remove("title");
    let changes = [
        upsert_change(
            "remote-1",
            1,
            1,
            library_item_payload("remote-1", "completed"),
        ),
        upsert_change("remote-2", 2, 1, broken),
        RemoteSyncChange {
            sequence: 3,
            entity_type: "library_item".to_string(),
            entity_id: "remote-3".to_string(),
            operation: "upsert".to_string(),
            version: 1,
            data: None,
        },
        RemoteSyncChange {
            sequence: 4,
            entity_type: "library_item".to_string(),
            entity_id: "remote-4".to_string(),
            operation: "teleport".to_string(),
            version: 1,
            data: None,
        },
    ];

    apply_remote_changes(&pool, &changes).await.unwrap();

    assert_eq!(
        library_item_count(&pool).await,
        1,
        "only the valid row lands"
    );
    assert_eq!(cursor(&pool).await.unwrap(), 4);
    let (recorded,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM sync_entity_state WHERE entity_id IN ('remote-2','remote-3','remote-4')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(recorded, 0, "a skipped change leaves no half-written state");
}

#[tokio::test]
async fn a_valid_change_after_a_skipped_one_is_still_applied() {
    let pool = pool().await;
    let mut broken = library_item_payload("remote-1", "completed");
    broken["status"] = serde_json::json!("not-a-status");
    let changes = [
        upsert_change("remote-1", 1, 1, broken),
        upsert_change(
            "remote-2",
            2,
            1,
            library_item_payload("remote-2", "planned"),
        ),
    ];

    apply_remote_changes(&pool, &changes).await.unwrap();

    assert_eq!(cursor(&pool).await.unwrap(), 2);
    let (uuid, _) = library_item_row(&pool).await;
    assert_eq!(uuid, "remote-2");
}

#[tokio::test]
async fn apply_remote_changes_does_not_repopulate_the_local_outbox() {
    let pool = pool().await;
    let change = upsert_change(
        "remote-1",
        1,
        1,
        library_item_payload("remote-1", "completed"),
    );

    apply_remote_changes(&pool, &[change]).await.unwrap();

    let outbox = list_outbox(&pool, 10).await.unwrap();
    assert!(
        outbox.is_empty(),
        "applying a trusted remote change must not re-queue it as if it were a local mutation"
    );
}

#[tokio::test]
async fn ack_mutations_advances_entity_state_and_clears_the_outbox() {
    let pool = pool().await;
    sqlx::query(
        "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at) \
         VALUES ('local-1','default',42,'movie','Local Title','planned','t','t')",
    )
    .execute(&pool)
    .await
    .unwrap();
    let pending = list_outbox(&pool, 10).await.unwrap();
    assert_eq!(pending.len(), 1);

    ack_mutations(
        &pool,
        &[SyncMutationAck {
            mutation_id: pending[0].mutation_id.clone(),
            entity_type: "library_item".to_string(),
            entity_id: "local-1".to_string(),
            version: 1,
        }],
    )
    .await
    .unwrap();

    assert!(list_outbox(&pool, 10).await.unwrap().is_empty());
    let (remote_version,): (i64,) = sqlx::query_as(
        "SELECT remote_version FROM sync_entity_state WHERE profile_id='default' AND entity_type='library_item' AND entity_id='local-1'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(remote_version, 1);
}

#[tokio::test]
async fn rebase_conflicts_updates_base_version_without_dropping_the_pending_mutation() {
    let pool = pool().await;
    sqlx::query(
        "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at) \
         VALUES ('local-1','default',42,'movie','Local Title','planned','t','t')",
    )
    .execute(&pool)
    .await
    .unwrap();
    let pending = list_outbox(&pool, 10).await.unwrap();

    rebase_conflicts(
        &pool,
        &[SyncConflict {
            mutation_id: pending[0].mutation_id.clone(),
            entity_type: "library_item".to_string(),
            entity_id: "local-1".to_string(),
            server_version: 7,
        }],
    )
    .await
    .unwrap();

    let rebased = list_outbox(&pool, 10).await.unwrap();
    assert_eq!(
        rebased.len(),
        1,
        "a rebased mutation stays pending, ready for the next push round"
    );
    assert_eq!(rebased[0].base_version, 7);
}

#[tokio::test]
async fn applies_a_remote_account_preference_change_by_key_not_by_a_generated_uuid() {
    let pool = pool().await;
    let change = RemoteSyncChange {
        sequence: 1,
        entity_type: "account_preferences".to_string(),
        entity_id: "language".to_string(),
        operation: "upsert".to_string(),
        version: 1,
        data: Some(serde_json::json!({
            "key": "language",
            "value": "\"fr\"",
            "updatedAt": "2026-01-02T00:00:00.000Z",
        })),
    };

    apply_remote_changes(&pool, &[change]).await.unwrap();

    let (value,): (String,) = sqlx::query_as("SELECT value FROM preferences WHERE key='language'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        value, "\"fr\"",
        "round-trips to the exact same quoted-string form preferences.value already uses"
    );
}

#[tokio::test]
async fn prepare_seeds_only_account_scoped_preferences_into_the_outbox() {
    let pool = pool().await;
    sqlx::query(
        "INSERT INTO preferences (key, value, updated_at) VALUES ('language', '\"fr\"', 'now')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO preferences (key, value, updated_at) VALUES ('theme', '\"light\"', 'now')",
    )
    .execute(&pool)
    .await
    .unwrap();

    prepare(&pool).await.unwrap();

    let rows: Vec<(String,)> =
        sqlx::query_as("SELECT entity_id FROM sync_outbox WHERE entity_type='account_preferences'")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(
        rows,
        vec![("language".to_string(),)],
        "theme is device-scoped and must not be bootstrapped"
    );
}

#[tokio::test]
async fn applies_a_remote_dismissed_recommendation_upsert_and_delete() {
    let pool = pool().await;
    let change = RemoteSyncChange {
        sequence: 1,
        entity_type: "dismissed_recommendation".to_string(),
        entity_id: "dr-1".to_string(),
        operation: "upsert".to_string(),
        version: 1,
        data: Some(serde_json::json!({
            "uuid": "dr-1",
            "mediaId": 42,
            "mediaType": "movie",
            "title": "Remote Title",
            "posterPath": "/p.jpg",
            "dismissedAt": "2026-01-01T00:00:00.000Z",
            "createdAt": "2026-01-01T00:00:00.000Z",
            "updatedAt": "2026-01-01T00:00:00.000Z",
        })),
    };
    apply_remote_changes(&pool, &[change]).await.unwrap();

    let (media_id, title): (i64, String) = sqlx::query_as(
        "SELECT media_id, title FROM dismissed_recommendations WHERE profile_id='default' AND uuid='dr-1'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(media_id, 42);
    assert_eq!(title, "Remote Title");

    let delete_change = RemoteSyncChange {
        sequence: 2,
        entity_type: "dismissed_recommendation".to_string(),
        entity_id: "dr-1".to_string(),
        operation: "delete".to_string(),
        version: 2,
        data: None,
    };
    apply_remote_changes(&pool, &[delete_change]).await.unwrap();

    let count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM dismissed_recommendations WHERE uuid='dr-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count.0, 0);
}

#[tokio::test]
async fn applies_a_remote_activity_log_upsert_and_delete() {
    let pool = pool().await;
    let change = RemoteSyncChange {
        sequence: 1,
        entity_type: "activity_log".to_string(),
        entity_id: "hist-1".to_string(),
        operation: "upsert".to_string(),
        version: 1,
        data: Some(serde_json::json!({
            "uuid": "hist-1",
            "mediaId": 9,
            "mediaType": "movie",
            "title": "Remote Title",
            "action": "movie:watched",
            "timestamp": "2026-01-01T00:00:00.000Z",
            "createdAt": "2026-01-01T00:00:00.000Z",
            "updatedAt": "2026-01-01T00:00:00.000Z",
        })),
    };
    apply_remote_changes(&pool, &[change]).await.unwrap();

    let (title, action): (String, String) = sqlx::query_as(
        "SELECT title, action FROM activity_log WHERE profile_id='default' AND uuid='hist-1'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(title, "Remote Title");
    assert_eq!(action, "movie:watched");

    let delete_change = RemoteSyncChange {
        sequence: 2,
        entity_type: "activity_log".to_string(),
        entity_id: "hist-1".to_string(),
        operation: "delete".to_string(),
        version: 2,
        data: None,
    };
    apply_remote_changes(&pool, &[delete_change]).await.unwrap();

    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM activity_log WHERE uuid='hist-1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count.0, 0);
}

#[tokio::test]
async fn applies_a_remote_episode_progress_rating() {
    let pool = pool().await;
    let change = RemoteSyncChange {
        sequence: 1,
        entity_type: "episode_progress".to_string(),
        entity_id: "ep-1".to_string(),
        operation: "upsert".to_string(),
        version: 1,
        data: Some(serde_json::json!({
            "uuid": "ep-1",
            "seriesId": 10,
            "episodeId": 20,
            "seasonNumber": 1,
            "episodeNumber": 2,
            "watched": 1,
            "rating": 4,
            "createdAt": "2026-01-01T00:00:00.000Z",
            "updatedAt": "2026-01-01T00:00:00.000Z",
        })),
    };
    apply_remote_changes(&pool, &[change]).await.unwrap();

    let (rating,): (i64,) = sqlx::query_as(
        "SELECT rating FROM episode_progress WHERE profile_id='default' AND uuid='ep-1'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(rating, 4);
}

#[tokio::test]
async fn episode_progress_outbox_payload_includes_rating() {
    let pool = pool().await;
    sqlx::query(
        "INSERT INTO episode_progress (uuid, profile_id, series_id, episode_id, season_number, episode_number, watched, rating, created_at, updated_at) \
         VALUES ('ep-1','default',10,20,1,2,1,5,'t','t')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let (payload,): (String,) = sqlx::query_as(
        "SELECT payload FROM sync_outbox WHERE entity_type='episode_progress' AND entity_id='ep-1'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let value: serde_json::Value = serde_json::from_str(&payload).unwrap();
    assert_eq!(value["rating"], 5);
}

#[tokio::test]
async fn prepare_v2_seeds_activity_log_after_v1_already_ran() {
    let pool = pool().await;
    sqlx::query("UPDATE sync_control SET suppress_outbox=1 WHERE id=1")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO activity_log (uuid, profile_id, media_id, media_type, title, action, timestamp, created_at, updated_at) \
         VALUES ('hist-legacy','default',1,'movie','Legacy','movie:watched','t','t','t')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("UPDATE sync_control SET suppress_outbox=0 WHERE id=1")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO sync_metadata(key,value,updated_at) VALUES ('bootstrap:default','1','t')",
    )
    .execute(&pool)
    .await
    .unwrap();

    prepare(&pool).await.unwrap();

    let (count,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM sync_outbox WHERE entity_type='activity_log' AND entity_id='hist-legacy'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 1);
}

#[tokio::test]
async fn status_counts_conflicts_separately_from_other_failures() {
    let pool = pool().await;
    sqlx::query(
        "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at) \
         VALUES ('local-1','default',42,'movie','Local Title','planned','t','t')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at) \
         VALUES ('local-2','default',43,'movie','Other Title','planned','t','t')",
    )
    .execute(&pool)
    .await
    .unwrap();
    let pending = list_outbox(&pool, 10).await.unwrap();
    assert_eq!(pending.len(), 2);
    // Both rows share the same millisecond-granularity created_at, so
    // list_outbox's tie-break (a random mutation_id) can return them in
    // either order — look each one up by its actual entity_id instead of
    // assuming an index reflects insertion order.
    let local_1 = pending
        .iter()
        .find(|row| row.entity_id == "local-1")
        .unwrap();
    let local_2 = pending
        .iter()
        .find(|row| row.entity_id == "local-2")
        .unwrap();

    // One mutation gets rebased as a conflict; the other is marked
    // failed by some other generic error, never a conflict.
    rebase_conflicts(
        &pool,
        &[SyncConflict {
            mutation_id: local_1.mutation_id.clone(),
            entity_type: "library_item".to_string(),
            entity_id: "local-1".to_string(),
            server_version: 7,
        }],
    )
    .await
    .unwrap();
    sqlx::query("UPDATE sync_outbox SET last_error='network timeout' WHERE mutation_id=?1")
        .bind(&local_2.mutation_id)
        .execute(&pool)
        .await
        .unwrap();

    let status = status(&pool).await.unwrap();
    assert_eq!(status.failed_count, 2, "both rows carry a last_error");
    assert_eq!(
        status.conflict_count, 1,
        "only the rebased row is a conflict, not the generic failure"
    );

    let conflicts = list_conflicts(&pool, 10).await.unwrap();
    assert_eq!(conflicts.len(), 1, "only the rebased row is listed");
    assert_eq!(conflicts[0].entity_type, "library_item");
    assert_eq!(conflicts[0].entity_id, "local-1");
    assert_eq!(conflicts[0].mutation_id, local_1.mutation_id);
}

#[tokio::test]
async fn mark_synced_records_a_timestamp_that_status_then_reports() {
    let pool = pool().await;
    assert_eq!(status(&pool).await.unwrap().last_synced_at, None);

    mark_synced(&pool).await.unwrap();

    let after_first = status(&pool).await.unwrap().last_synced_at;
    assert!(after_first.is_some());

    // Calling it again updates the same key rather than erroring or
    // creating a second row.
    mark_synced(&pool).await.unwrap();
    let after_second = status(&pool).await.unwrap().last_synced_at;
    assert!(after_second.is_some());
}
