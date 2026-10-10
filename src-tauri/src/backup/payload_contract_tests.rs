//! The frontend validates a backup with Zod
//! (src/features/backup/portable-data-schema.ts) before sending it to
//! `import_backup_data`. Zod objects strip unknown keys and several fields are
//! optional there, so what Rust receives is NOT the file's content verbatim.
//! These tests pin that boundary from the Rust side.

use serde_json::Value;

use super::repository::PortableData;

const TABLES: &[&str] = &[
    "seenMovies",
    "episodeProgress",
    "trackedSeries",
    "history",
    "library",
    "viewingEvents",
    "profiles",
    "customLists",
    "customListItems",
    "availabilitySnapshots",
    "availabilityAlerts",
    "smartLists",
    "savedFilters",
    "dismissedRecommendations",
];

fn empty_payload() -> Value {
    serde_json::json!({
        "seenMovies": [], "episodeProgress": [], "trackedSeries": [], "history": [],
        "preferences": {}, "library": [], "viewingEvents": [], "profiles": [],
        "customLists": [], "customListItems": [], "availabilitySnapshots": [],
        "availabilityAlerts": [], "smartLists": [], "savedFilters": [],
        "dismissedRecommendations": []
    })
}

/// Only the fields the frontend schema guarantees for each table.
fn minimal_rows() -> Value {
    serde_json::json!({
        "seenMovies": [{ "movieId": 1, "title": "t", "watchedAt": "w" }],
        "episodeProgress": [{
            "id": "e", "seriesId": 1, "episodeId": 2, "seasonNumber": 1,
            "episodeNumber": 1, "watched": true, "createdAt": "c", "updatedAt": "u"
        }],
        "trackedSeries": [{
            "id": "t", "seriesId": 1, "title": "t", "totalEpisodes": 1,
            "watchedEpisodes": 0, "createdAt": "c", "updatedAt": "u"
        }],
        "history": [{
            "id": "h", "mediaId": 1, "mediaType": "movie", "title": "t",
            "action": "movie:watched", "timestamp": "ts"
        }],
        // `id` is not declared by libraryItemSchema, so Zod strips it.
        "library": [{
            "profileId": "default", "mediaId": 1, "mediaType": "movie", "title": "t",
            "createdAt": "c", "genres": [], "status": "planned", "favourite": false,
            "tags": [], "rewatchCount": 0, "updatedAt": "u"
        }],
        "viewingEvents": [{
            "id": "v", "profileId": "default", "mediaId": 1, "mediaType": "movie",
            "title": "t", "eventType": "watched", "watchedAt": "w"
        }],
        // `hasPin` is optional in userProfileSchema (backups written before
        // PIN locks do not have it).
        "profiles": [{ "id": "default", "name": "Default", "createdAt": "c" }],
        "customLists": [{
            "id": "l", "profileId": "default", "name": "n", "createdAt": "c", "updatedAt": "u"
        }],
        "customListItems": [{
            "id": "i", "listId": "l", "mediaId": 1, "mediaType": "movie", "title": "t",
            "position": 0, "addedAt": "a", "updatedAt": "u"
        }],
        "availabilitySnapshots": [{
            "mediaId": 1, "mediaType": "movie", "region": "FR", "providerIds": [], "checkedAt": "c"
        }],
        "availabilityAlerts": [{
            "id": "a", "profileId": "default", "mediaId": 1, "mediaType": "movie",
            "title": "t", "region": "FR", "providerIds": [], "enabled": true, "createdAt": "c"
        }],
        "smartLists": [{
            "id": "s", "profileId": "default", "name": "n", "rules": {}, "createdAt": "c", "updatedAt": "u"
        }],
        "savedFilters": [{
            "id": "f", "profileId": "default", "page": "library", "name": "n",
            "filters": {}, "createdAt": "c", "updatedAt": "u"
        }],
        "dismissedRecommendations": [{
            "id": "d", "profileId": "default", "mediaId": 1, "mediaType": "movie", "title": "t",
            "dismissedAt": "x", "createdAt": "c", "updatedAt": "u"
        }]
    })
}

#[test]
fn rust_accepts_every_table_the_frontend_schema_can_produce() {
    let rows = minimal_rows();
    let mut failures = Vec::new();
    for table in TABLES {
        let mut payload = empty_payload();
        payload[*table] = rows[*table].clone();
        if let Err(error) = serde_json::from_value::<PortableData>(payload) {
            failures.push(format!("{table}: {error}"));
        }
    }
    assert!(
        failures.is_empty(),
        "payloads the frontend schema accepts but Rust rejects:\n{}",
        failures.join("\n")
    );
}

#[test]
fn a_profile_without_has_pin_is_accepted_like_before_pin_locks_existed() {
    let mut payload = empty_payload();
    payload["profiles"] =
        serde_json::json!([{ "id": "default", "name": "Default", "createdAt": "c" }]);
    let data: PortableData = serde_json::from_value(payload).unwrap();
    assert!(!data.profiles[0].has_pin);
}
