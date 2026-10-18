use super::*;
use sqlx::sqlite::SqlitePoolOptions;
use tauri::Manager;

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

async fn table_columns(pool: &SqlitePool, table: &str) -> Vec<String> {
    let mut columns: Vec<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT name FROM pragma_table_info('{table}')"
    )))
    .fetch_all(pool)
    .await
    .unwrap();
    columns.sort();
    columns
}

fn sorted(mut columns: Vec<&str>) -> Vec<String> {
    columns.sort_unstable();
    columns.into_iter().map(str::to_string).collect()
}

/// Guards the `SELECT * FROM <table>` export queries above against silent
/// schema drift: `sqlx::FromRow` maps by column name and simply ignores
/// any table column that has no matching Row struct field, so a column
/// added to a table later would vanish from every backup export without
/// either query erroring. Each expected list mirrors its Row struct's
/// fields exactly (checked by hand against 001-initial-schema.ts); a few
/// tables list fewer columns than they have — those gaps are intentional
/// (see comments) rather than a Row struct oversight.
#[tokio::test]
async fn full_row_structs_cover_every_table_column_or_document_why_not() {
    let pool = migrated_pool().await;

    // Full match: these Row structs mirror every column of their table.
    for (table, expected) in [
        (
            "profiles",
            sorted(vec![
                "uuid",
                "name",
                "avatar",
                "supabase_user_id",
                "pin_hash",
                "pin_salt",
                "created_at",
                "updated_at",
            ]),
        ),
        (
            "library_items",
            sorted(vec![
                "uuid",
                "profile_id",
                "media_id",
                "media_type",
                "title",
                "poster_path",
                "backdrop_path",
                "year",
                "rating",
                "genres",
                "status",
                "favourite",
                "user_rating",
                "notes",
                "tags",
                "started_at",
                "completed_at",
                "rewatch_count",
                "created_at",
                "updated_at",
                "status_origin",
            ]),
        ),
        (
            "episode_progress",
            sorted(vec![
                "uuid",
                "profile_id",
                "series_id",
                "episode_id",
                "season_number",
                "episode_number",
                "watched",
                "watched_at",
                "created_at",
                "updated_at",
                "rating",
            ]),
        ),
        (
            "tracked_series",
            sorted(vec![
                "uuid",
                "profile_id",
                "series_id",
                "title",
                "poster_path",
                "backdrop_path",
                "total_episodes",
                "status",
                "created_at",
                "updated_at",
            ]),
        ),
        (
            "custom_lists",
            sorted(vec![
                "uuid",
                "profile_id",
                "name",
                "description",
                "created_at",
                "updated_at",
            ]),
        ),
        (
            "custom_list_items",
            sorted(vec![
                "uuid",
                "list_id",
                "media_id",
                "media_type",
                "title",
                "poster_path",
                "position",
                "added_at",
                "updated_at",
            ]),
        ),
        (
            "availability_snapshots",
            sorted(vec![
                "media_id",
                "media_type",
                "region",
                "provider_ids",
                "checked_at",
            ]),
        ),
        (
            "dismissed_recommendations",
            sorted(vec![
                "uuid",
                "profile_id",
                "media_id",
                "media_type",
                "title",
                "poster_path",
                "dismissed_at",
                "created_at",
                "updated_at",
            ]),
        ),
    ] {
        assert_eq!(
            table_columns(&pool, table).await,
            expected,
            "{table} gained/lost a column vs its Row struct"
        );
    }

    // Documented gaps below: the table legitimately has more columns
    // than its Row struct — each comment says why the missing ones are
    // safe to drop from the export today. This still asserts against
    // the table's real, full column set, so a *new* column added later
    // fails the test just like the tables above, forcing a conscious
    // "does the Row struct need this too?" check.

    // seen_movies: `uuid` is discarded on import (a fresh one is always
    // generated — see import_impl's header comment), and created_at /
    // updated_at aren't modeled because they always mirror watched_at.
    assert_eq!(
        table_columns(&pool, "seen_movies").await,
        sorted(vec![
            "uuid",
            "profile_id",
            "movie_id",
            "title",
            "poster_path",
            "backdrop_path",
            "watched_at",
            "created_at",
            "updated_at"
        ]),
    );
    // viewing_events: created_at isn't modeled because it always mirrors
    // watched_at (this table is append-only, per the migration header);
    // insert_seq is modeled as `insertSeq`, used to replay events in log
    // order on restore (the restored numbers are the database's own).
    assert_eq!(
        table_columns(&pool, "viewing_events").await,
        sorted(vec![
            "uuid",
            "profile_id",
            "media_id",
            "media_type",
            "title",
            "event_type",
            "watched_at",
            "duration_minutes",
            "episode_id",
            "season_number",
            "episode_number",
            "note",
            "created_at",
            "insert_seq",
        ]),
    );
    // activity_log: profile_id is reconstructed from metadata.profileId
    // on import (see import_impl); created_at/updated_at aren't modeled
    // because they always mirror `timestamp`.
    assert_eq!(
        table_columns(&pool, "activity_log").await,
        sorted(vec![
            "uuid",
            "profile_id",
            "media_id",
            "media_type",
            "title",
            "action",
            "season_number",
            "episode_number",
            "episode_title",
            "metadata",
            "timestamp",
            "created_at",
            "updated_at",
        ]),
    );
    // availability_alerts: updated_at isn't modeled anywhere in the
    // AvailabilityAlert domain type, not just here.
    assert_eq!(
        table_columns(&pool, "availability_alerts").await,
        sorted(vec![
            "uuid",
            "profile_id",
            "media_id",
            "media_type",
            "title",
            "region",
            "provider_ids",
            "enabled",
            "created_at",
            "updated_at",
        ]),
    );
    // preferences: updated_at isn't modeled — PortableData.preferences is
    // a plain key/value map with no room for per-key metadata.
    assert_eq!(
        table_columns(&pool, "preferences").await,
        sorted(vec!["key", "value", "updated_at"])
    );
    assert_eq!(
        table_columns(&pool, "smart_lists").await,
        sorted(vec![
            "uuid",
            "profile_id",
            "name",
            "rules",
            "created_at",
            "updated_at"
        ]),
    );
    assert_eq!(
        table_columns(&pool, "saved_filters").await,
        sorted(vec![
            "uuid",
            "profile_id",
            "page",
            "name",
            "filters",
            "created_at",
            "updated_at",
        ]),
    );
}

#[tokio::test]
async fn quick_check_reports_healthy_on_a_fresh_database() {
    let pool = migrated_pool().await;
    let (healthy, detail) = quick_check_impl(&pool).await.unwrap();
    assert!(healthy);
    assert_eq!(detail, "ok");
}

#[tokio::test]
async fn exports_and_reimports_library_round_trip() {
    let pool = migrated_pool().await;
    sqlx::query(
        "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at)
         VALUES ('l1', 'default', 1, 'movie', 'Round Trip', 'watching', 'now', 'now')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let exported = export_impl(&pool).await.unwrap();
    assert_eq!(exported.library.len(), 1);

    import_impl(&pool, exported).await.unwrap();

    let library_status: (String,) = sqlx::query_as("SELECT status FROM library_items")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(library_status.0, "watching");
}

#[tokio::test]
async fn export_and_reimport_preserves_the_profiles_supabase_link() {
    let pool = migrated_pool().await;
    sqlx::query("UPDATE profiles SET supabase_user_id = 'user_2abc' WHERE uuid = 'default'")
        .execute(&pool)
        .await
        .unwrap();

    let exported = export_impl(&pool).await.unwrap();
    assert_eq!(exported.profiles.len(), 1);
    assert_eq!(
        exported.profiles[0].supabase_user_id.as_deref(),
        Some("user_2abc")
    );

    import_impl(&pool, exported).await.unwrap();

    let supabase_user_id: (Option<String>,) =
        sqlx::query_as("SELECT supabase_user_id FROM profiles WHERE uuid = 'default'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(supabase_user_id.0.as_deref(), Some("user_2abc"));
}

#[tokio::test]
async fn export_and_reimport_preserves_an_episode_rating() {
    let pool = migrated_pool().await;
    sqlx::query(
        "INSERT INTO episode_progress (uuid, profile_id, series_id, episode_id, season_number, episode_number, watched, watched_at, created_at, updated_at, rating)
         VALUES ('ep1', 'default', 9, 100, 1, 1, 1, 'now', 'now', 'now', 4)",
    )
    .execute(&pool)
    .await
    .unwrap();

    let exported = export_impl(&pool).await.unwrap();
    assert_eq!(exported.episode_progress[0].rating, Some(4));

    import_impl(&pool, exported).await.unwrap();

    let rating: (Option<i64>,) = sqlx::query_as(
        "SELECT rating FROM episode_progress WHERE series_id = 9 AND episode_id = 100",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(rating.0, Some(4));
}

fn library_item(id: &str, media_id: i64, title: &str) -> LibraryItem {
    LibraryItem {
        id: id.to_string(),
        profile_id: "default".to_string(),
        media_id,
        media_type: MediaType::Movie,
        title: title.to_string(),
        poster_path: None,
        backdrop_path: None,
        year: None,
        rating: None,
        genres: Vec::new(),
        status: LibraryStatus::Planned,
        favourite: false,
        user_rating: None,
        notes: None,
        tags: Vec::new(),
        started_at: None,
        completed_at: None,
        rewatch_count: 0,
        created_at: "2026-01-01T00:00:00.000Z".to_string(),
        updated_at: "2026-01-01T00:00:00.000Z".to_string(),
        status_origin: None,
    }
}

#[tokio::test]
async fn import_preserves_history_uuid_but_not_library_uuid() {
    let pool = migrated_pool().await;
    // export_impl already includes the migration-seeded "default"
    // profile — no need to add another one (that would violate the
    // profiles.uuid UNIQUE constraint on import).
    let mut data = export_impl(&pool).await.unwrap();
    data.library
        .push(library_item("original-library-id", 1, "Test"));
    data.history.push(ViewingHistoryItem {
        id: "original-history-id".to_string(),
        media_id: 1,
        media_type: MediaType::Movie,
        title: "Test".to_string(),
        action: HistoryAction::MovieWatched,
        timestamp: "2026-01-01T00:00:00.000Z".to_string(),
        season_number: None,
        episode_number: None,
        episode_title: None,
        metadata: Some(serde_json::json!({ "profileId": "default" })),
    });

    import_impl(&pool, data).await.unwrap();

    let library_uuid: (String,) = sqlx::query_as("SELECT uuid FROM library_items")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_ne!(library_uuid.0, "original-library-id");

    let history_uuid: (String,) = sqlx::query_as("SELECT uuid FROM activity_log")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(history_uuid.0, "original-history-id");
}

#[tokio::test]
async fn a_library_status_origin_survives_an_export_import_round_trip() {
    let pool = migrated_pool().await;
    let mut data = export_impl(&pool).await.unwrap();
    let mut auto = library_item("a", 1, "Auto");
    auto.status = LibraryStatus::Completed;
    auto.status_origin = Some(LibraryStatusOrigin::Auto);
    let mut manual = library_item("b", 2, "Manual");
    manual.status_origin = Some(LibraryStatusOrigin::Manual);
    // A backup made before the field existed.
    let legacy = library_item("c", 3, "Legacy");
    data.library.extend([auto, manual, legacy]);

    import_impl(&pool, data).await.unwrap();
    let exported = export_impl(&pool).await.unwrap();

    let origin_of = |media_id: i64| {
        exported
            .library
            .iter()
            .find(|item| item.media_id == media_id)
            .and_then(|item| item.status_origin)
    };
    assert_eq!(origin_of(1), Some(LibraryStatusOrigin::Auto));
    assert_eq!(origin_of(2), Some(LibraryStatusOrigin::Manual));
    assert_eq!(
        origin_of(3),
        Some(LibraryStatusOrigin::Manual),
        "an older backup restores as manual, never reopened automatically"
    );
}

#[tokio::test]
async fn import_batches_a_table_spanning_more_than_one_chunk() {
    let pool = migrated_pool().await;
    let mut data = export_impl(&pool).await.unwrap();
    let row_count = IMPORT_BATCH_SIZE * 2 + 1;
    for index in 0..row_count {
        data.library.push(library_item(
            &format!("l{index}"),
            index as i64,
            &format!("Title {index}"),
        ));
    }

    import_impl(&pool, data).await.unwrap();

    let library_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM library_items")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(library_count.0, row_count as i64);
}

#[test]
fn parse_number_array_parses_a_valid_json_array_of_numbers() {
    assert_eq!(parse_number_array("[1,2,3]"), vec![1, 2, 3]);
}

#[test]
fn parse_number_array_returns_empty_for_non_array_json() {
    assert_eq!(parse_number_array("\"not-an-array\""), Vec::<i64>::new());
    assert_eq!(parse_number_array("not even json"), Vec::<i64>::new());
}

#[test]
fn parse_number_array_filters_out_non_numeric_elements() {
    // Mirrors `tolerates_corrupt_provider_ids_json` in availability.rs:
    // non-number elements are silently dropped rather than failing the
    // whole parse.
    assert_eq!(parse_number_array("[1,\"two\",3,null,4.5]"), vec![1, 3]);
}

#[test]
fn parse_metadata_parses_a_valid_json_string() {
    let parsed = parse_metadata(Some("{\"profileId\":\"default\"}".to_string()));
    assert_eq!(parsed, Some(serde_json::json!({ "profileId": "default" })));
}

#[test]
fn parse_metadata_returns_none_for_invalid_json() {
    assert_eq!(parse_metadata(Some("not json".to_string())), None);
}

#[test]
fn parse_metadata_returns_none_for_none_input() {
    assert_eq!(parse_metadata(None), None);
}

/// Inserts one representative row into every one of the 12 exported
/// tables, exports, spot-checks every `PortableData` field is populated
/// from its mapping closure (closing the gap where only `library_items`
/// and `profiles` had non-empty coverage), then feeds the export back
/// through `import_impl` and confirms each table's row count survives
/// the round trip (closing the matching `import_table!` macro gap).
#[tokio::test]
async fn exports_and_reimports_every_table_with_representative_rows() {
    let pool = migrated_pool().await;

    sqlx::query(
        "INSERT INTO seen_movies (uuid, profile_id, movie_id, title, poster_path, backdrop_path, watched_at, created_at, updated_at)
         VALUES ('sm1', 'default', 10, 'Seen Movie', '/poster.jpg', '/backdrop.jpg', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO episode_progress (uuid, profile_id, series_id, episode_id, season_number, episode_number, watched, watched_at, created_at, updated_at)
         VALUES ('ep1', 'default', 20, 200, 1, 2, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO tracked_series (uuid, profile_id, series_id, title, poster_path, backdrop_path, total_episodes, created_at, updated_at, status)
         VALUES ('ts1', 'default', 20, 'Tracked Series', '/poster.jpg', '/backdrop.jpg', 10, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Returning Series')",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO activity_log (uuid, profile_id, media_id, media_type, title, action, season_number, episode_number, episode_title, metadata, timestamp, created_at, updated_at)
         VALUES ('hist1', 'default', 30, 'movie', 'History Movie', 'movie:watched', NULL, NULL, NULL, '{\"profileId\":\"default\"}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO preferences (key, value, updated_at) VALUES ('theme', '\"dark\"', '2026-01-01T00:00:00.000Z')",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, poster_path, backdrop_path, year, rating, genres, status, favourite, user_rating, notes, tags, started_at, completed_at, rewatch_count, created_at, updated_at)
         VALUES ('lib1', 'default', 40, 'movie', 'Library Movie', '/poster.jpg', '/backdrop.jpg', 2020, 7.5, '[\"Action\"]', 'watching', 1, 8.0, 'notes', '[\"tag1\"]', '2026-01-01T00:00:00.000Z', NULL, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, episode_id, season_number, episode_number, note, created_at)
         VALUES ('ve1', 'default', 50, 'movie', 'Viewing Event Movie', 'watched', '2026-01-01T00:00:00.000Z', 120, NULL, NULL, NULL, 'Loved it', '2026-01-01T00:00:00.000Z')",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO custom_lists (uuid, profile_id, name, description, created_at, updated_at)
         VALUES ('cl1', 'default', 'My List', 'A list', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO custom_list_items (uuid, list_id, media_id, media_type, title, poster_path, position, added_at, updated_at)
         VALUES ('cli1', 'cl1', 60, 'movie', 'List Item Movie', '/poster.jpg', 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO availability_snapshots (media_id, media_type, region, provider_ids, checked_at)
         VALUES (70, 'movie', 'US', '[8,9]', '2026-01-01T00:00:00.000Z')",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO availability_alerts (uuid, profile_id, media_id, media_type, title, region, provider_ids, enabled, created_at, updated_at)
         VALUES ('aa1', 'default', 80, 'movie', 'Alert Movie', 'US', '[8]', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO smart_lists (uuid, profile_id, name, rules, created_at, updated_at)
         VALUES ('sl1', 'default', 'Short horror', '{\"genre\":\"Horror\",\"maxRuntimeMinutes\":100}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO saved_filters (uuid, profile_id, page, name, filters, created_at, updated_at)
         VALUES ('sf1', 'default', 'library', 'Paused shows', '{\"statusFilter\":\"paused\"}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO dismissed_recommendations (uuid, profile_id, media_id, media_type, title, poster_path, dismissed_at, created_at, updated_at)
         VALUES ('dr1', 'default', 90, 'movie', 'Dismissed Movie', '/poster.jpg', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let exported = export_impl(&pool).await.unwrap();

    assert_eq!(exported.seen_movies.len(), 1);
    assert_eq!(exported.seen_movies[0].movie_id, 10);
    assert_eq!(
        exported.seen_movies[0].profile_id.as_deref(),
        Some("default")
    );

    assert_eq!(exported.episode_progress.len(), 1);
    assert_eq!(exported.episode_progress[0].episode_id, 200);
    assert!(exported.episode_progress[0].watched);

    assert_eq!(exported.tracked_series.len(), 1);
    assert_eq!(exported.tracked_series[0].total_episodes, 10);
    assert_eq!(
        exported.tracked_series[0].status.as_deref(),
        Some("Returning Series")
    );

    assert_eq!(exported.history.len(), 1);
    assert_eq!(exported.history[0].action, HistoryAction::MovieWatched);
    assert_eq!(
        exported.history[0]
            .metadata
            .as_ref()
            .and_then(|value| value.get("profileId"))
            .and_then(Value::as_str),
        Some("default")
    );

    assert_eq!(
        exported.preferences.get("theme"),
        Some(&serde_json::json!("dark"))
    );

    assert_eq!(exported.library.len(), 1);
    assert_eq!(exported.library[0].status, LibraryStatus::Watching);
    assert_eq!(exported.library[0].genres, vec!["Action".to_string()]);

    assert_eq!(exported.viewing_events.len(), 1);
    assert_eq!(
        exported.viewing_events[0].event_type,
        ViewingEventType::Watched
    );
    assert_eq!(exported.viewing_events[0].duration_minutes, Some(120));
    assert_eq!(exported.viewing_events[0].note.as_deref(), Some("Loved it"));

    assert_eq!(exported.custom_lists.len(), 1);
    assert_eq!(exported.custom_lists[0].name, "My List");

    assert_eq!(exported.custom_list_items.len(), 1);
    assert_eq!(exported.custom_list_items[0].list_id, "cl1");

    assert_eq!(exported.availability_snapshots.len(), 1);
    assert_eq!(exported.availability_snapshots[0].provider_ids, vec![8, 9]);

    assert_eq!(exported.availability_alerts.len(), 1);
    assert_eq!(exported.availability_alerts[0].provider_ids, vec![8]);

    // Regression check for a real bug: smart_lists/saved_filters were
    // missing from PortableData entirely — both tables are in
    // PROFILE_SCOPED_TABLES, so import_impl's purge already deleted them
    // on every restore, but nothing re-inserted them since they were
    // never exported in the first place. A restore silently wiped every
    // smart list and saved filter a profile had.
    assert_eq!(exported.smart_lists.len(), 1);
    assert_eq!(exported.smart_lists[0].name, "Short horror");
    assert_eq!(exported.saved_filters.len(), 1);
    assert_eq!(exported.saved_filters[0].page, "library");

    assert_eq!(exported.dismissed_recommendations.len(), 1);
    assert_eq!(exported.dismissed_recommendations[0].media_id, 90);
    assert_eq!(
        exported.dismissed_recommendations[0].title,
        "Dismissed Movie"
    );

    import_impl(&pool, exported).await.unwrap();

    for (table, expected_count) in [
        ("seen_movies", 1),
        ("episode_progress", 1),
        ("tracked_series", 1),
        ("activity_log", 1),
        ("preferences", 1),
        ("library_items", 1),
        ("viewing_events", 1),
        ("custom_lists", 1),
        ("custom_list_items", 1),
        ("availability_snapshots", 1),
        ("availability_alerts", 1),
        ("smart_lists", 1),
        ("saved_filters", 1),
        ("dismissed_recommendations", 1),
    ] {
        let count: (i64,) =
            sqlx::query_as(sqlx::AssertSqlSafe(format!("SELECT COUNT(*) FROM {table}")))
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count.0, expected_count, "{table} row count after re-import");
    }

    let preference_value: (String,) =
        sqlx::query_as("SELECT value FROM preferences WHERE key = 'theme'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(preference_value.0, "\"dark\"");

    // Regression check for a real bug: viewing_events.note used to be
    // missing from both ViewingEventRow (export) and the import INSERT's
    // column list, so a restore-from-backup (which deletes-then-reinserts
    // every table, see import_impl) silently erased every note ever
    // written the moment someone restored a backup.
    let restored_note: Option<String> =
        sqlx::query_scalar("SELECT note FROM viewing_events WHERE uuid = 've1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(restored_note.as_deref(), Some("Loved it"));
}

/// The `action` column has a schema `CHECK` constraint (see
/// migrations.rs) restricting it to known history-action strings, so a
/// plain `INSERT` can never produce the "unknown action" branch in
/// `export_impl`'s history mapping — only manual DB corruption or an
/// older schema could. `PRAGMA ignore_check_constraints` bypasses that
/// constraint for exactly this one connection/insert so the branch can
/// be exercised directly, then restores it.
#[tokio::test]
async fn export_surfaces_an_error_for_an_unknown_history_action_in_the_database() {
    let pool = migrated_pool().await;
    let mut conn = pool.acquire().await.unwrap();

    sqlx::query("PRAGMA ignore_check_constraints = 1")
        .execute(&mut *conn)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO activity_log (uuid, profile_id, media_id, media_type, title, action, timestamp, created_at, updated_at)
         VALUES ('bad-hist', 'default', 1, 'movie', 'Bad', 'not:a:real:action', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    )
    .execute(&mut *conn)
    .await
    .unwrap();
    sqlx::query("PRAGMA ignore_check_constraints = 0")
        .execute(&mut *conn)
        .await
        .unwrap();
    drop(conn);

    let err = export_impl(&pool).await.unwrap_err();
    assert!(
        err.message.contains("Unknown history action in database"),
        "unexpected error message: {}",
        err.message
    );
}

/// Same rationale as the history-action test above, for the
/// `event_type` `CHECK` constraint on `viewing_events`.
#[tokio::test]
async fn export_surfaces_an_error_for_an_unknown_viewing_event_type_in_the_database() {
    let pool = migrated_pool().await;
    let mut conn = pool.acquire().await.unwrap();

    sqlx::query("PRAGMA ignore_check_constraints = 1")
        .execute(&mut *conn)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, created_at)
         VALUES ('bad-ve', 'default', 1, 'movie', 'Bad', 'not-a-real-event-type', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    )
    .execute(&mut *conn)
    .await
    .unwrap();
    sqlx::query("PRAGMA ignore_check_constraints = 0")
        .execute(&mut *conn)
        .await
        .unwrap();
    drop(conn);

    let err = export_impl(&pool).await.unwrap_err();
    assert!(
        err.message
            .contains("Unknown viewing event type in database"),
        "unexpected error message: {}",
        err.message
    );
}

// ------------------------------------------------------------------
// #[tauri::command] wrapper tests — these three are pure one-line
// delegations to already-tested `_impl` functions above, so each just
// needs a minimal happy-path call through a real `tauri::State` (built
// via `tauri::test::mock_app()`, see profiles.rs's
// `list_profiles_command_returns_the_default_profile` for the same
// shape) to close the wrapper-line coverage gap.
// ------------------------------------------------------------------

#[tokio::test]
async fn export_backup_data_command_returns_portable_data() {
    let pool = migrated_pool().await;
    let app = tauri::test::mock_app();
    app.manage(pool);
    let state: State<'_, SqlitePool> = app.state();
    let data = export_backup_data(state).await.unwrap();
    assert!(!data.profiles.is_empty());
}

#[tokio::test]
async fn import_backup_data_command_reimports_an_exported_snapshot() {
    let pool = migrated_pool().await;
    let data = export_impl(&pool).await.unwrap();

    let app = tauri::test::mock_app();
    app.manage(pool);
    let state: State<'_, SqlitePool> = app.state();
    let result = import_backup_data(data, state).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn check_data_integrity_command_reports_healthy_on_a_fresh_database() {
    let pool = migrated_pool().await;
    let app = tauri::test::mock_app();
    app.manage(pool);
    let state: State<'_, SqlitePool> = app.state();
    let check = check_data_integrity(state).await.unwrap();
    assert!(check.healthy);
}

#[tokio::test]
async fn export_skips_a_preference_row_with_a_malformed_json_value() {
    let pool = migrated_pool().await;
    sqlx::query(
        "INSERT INTO preferences (key, value, updated_at) VALUES ('corrupted', 'not-json', 'now')",
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

    let exported = export_impl(&pool).await.unwrap();

    assert!(!exported.preferences.contains_key("corrupted"));
    assert_eq!(
        exported.preferences.get("theme"),
        Some(&serde_json::json!("light"))
    );
}

/// `import_impl`'s doc comment describes it as an all-or-nothing replace
/// of the entire database content, purging every table child-first
/// before inserting the snapshot's rows — but every other test here only
/// ever imports data that's a superset of (or identical to) what's
/// already there, via an export/reimport round trip. None of them would
/// catch a purge-order bug that left stale rows behind. This imports a
/// snapshot that's strictly *emptier* than the seeded database and
/// confirms the old rows are actually gone, not just untouched.
#[tokio::test]
async fn import_purges_data_absent_from_the_imported_snapshot() {
    let pool = migrated_pool().await;
    sqlx::query(
        "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, created_at, updated_at)
         VALUES ('stale', 'default', 1, 'movie', 'Stale', 'now', 'now')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO custom_lists (uuid, profile_id, name, created_at, updated_at)
         VALUES ('stale-list', 'default', 'Stale List', 'now', 'now')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let empty_pool = migrated_pool().await;
    let empty_snapshot = export_impl(&empty_pool).await.unwrap();
    assert!(empty_snapshot.library.is_empty());
    assert!(empty_snapshot.custom_lists.is_empty());

    import_impl(&pool, empty_snapshot).await.unwrap();

    let library_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM library_items")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        library_count.0, 0,
        "stale library item should have been purged"
    );

    let list_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM custom_lists")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(list_count.0, 0, "stale custom list should have been purged");
}

async fn pin_of(pool: &SqlitePool, profile: &str) -> Option<(String, String)> {
    let row: Option<(Option<String>, Option<String>)> =
        sqlx::query_as("SELECT pin_hash, pin_salt FROM profiles WHERE uuid = $1")
            .bind(profile)
            .fetch_optional(pool)
            .await
            .unwrap();
    row.and_then(|(hash, salt)| hash.zip(salt))
}

async fn set_raw_pin(pool: &SqlitePool, profile: &str, hash: &str, salt: &str) {
    sqlx::query(
        "INSERT INTO profiles (uuid, name, pin_hash, pin_salt, created_at, updated_at)
         VALUES ($1, $1, $2, $3, 'now', 'now')
         ON CONFLICT (uuid) DO UPDATE SET pin_hash = $2, pin_salt = $3",
    )
    .bind(profile)
    .bind(hash)
    .bind(salt)
    .execute(pool)
    .await
    .unwrap();
}

#[tokio::test]
async fn a_restore_stores_dates_canonical_and_validates_preferences() {
    let pool = migrated_pool().await;
    sqlx::query(
        "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, created_at)
         VALUES ('e1','default',1,'movie','T','watched','2026-03-01T10:00:00.000Z','x')",
    )
    .execute(&pool)
    .await
    .unwrap();
    let mut snapshot = export_impl(&pool).await.unwrap();
    snapshot.viewing_events[0].watched_at = "2026-03-01T11:00:00+01:00".to_string();
    snapshot.preferences = serde_json::from_value(serde_json::json!({
        "theme": "light",
        "region": "not-a-region",
        "notifyHoursBefore": 9999,
        "madeUpKey": 1,
        "activeProfileId": "ghost",
    }))
    .unwrap();

    import_impl(&pool, snapshot).await.unwrap();

    let stored: String = sqlx::query_scalar("SELECT watched_at FROM viewing_events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(stored, "2026-03-01T10:00:00.000Z");
    let keys: Vec<String> = sqlx::query_scalar("SELECT key FROM preferences ORDER BY key")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(
        keys,
        ["theme"],
        "invalid, unknown and orphaned entries are dropped"
    );
    assert_eq!(
        crate::database::current_profile_id(&pool).await.unwrap(),
        "default"
    );
}

#[tokio::test]
async fn a_restore_resets_the_sync_cursors_and_keeps_the_local_cloud_link() {
    let pool = migrated_pool().await;
    sqlx::query("UPDATE profiles SET supabase_user_id = 'user_local' WHERE uuid = 'default'")
        .execute(&pool)
        .await
        .unwrap();
    for key in [
        "cursor:default",
        "bootstrap:default",
        "bootstrap:v2:default",
    ] {
        sqlx::query("INSERT INTO sync_metadata(key,value,updated_at) VALUES ($1,'7','t')")
            .bind(key)
            .execute(&pool)
            .await
            .unwrap();
    }
    let mut snapshot = export_impl(&pool).await.unwrap();
    snapshot.profiles[0].supabase_user_id = Some("user_from_file".to_string());

    import_impl(&pool, snapshot).await.unwrap();

    let left: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sync_metadata WHERE key LIKE 'cursor:%' OR key LIKE 'bootstrap:%'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(left, 0);
    let link: Option<String> =
        sqlx::query_scalar("SELECT supabase_user_id FROM profiles WHERE uuid = 'default'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(link.as_deref(), Some("user_local"));
}

#[tokio::test]
async fn a_same_device_restore_keeps_the_pin_of_profiles_already_in_the_database() {
    let pool = migrated_pool().await;
    set_raw_pin(&pool, "kid", "hash-kid", "salt-kid").await;
    // The export never carries a PIN.
    let snapshot = export_impl(&pool).await.unwrap();
    assert!(snapshot.profiles.iter().all(|p| !p.has_pin));

    import_impl(&pool, snapshot).await.unwrap();

    assert_eq!(
        pin_of(&pool, "kid").await,
        Some(("hash-kid".to_string(), "salt-kid".to_string()))
    );
}

#[tokio::test]
async fn a_restore_from_another_device_brings_unknown_profiles_without_a_pin() {
    let source = migrated_pool().await;
    sqlx::query(
        "INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('kid', 'Kid', 'now', 'now')",
    )
    .execute(&source)
    .await
    .unwrap();
    let snapshot = export_impl(&source).await.unwrap();

    // This device has never heard of `kid`; it locks `default`, and has
    // another locked profile that the backup lacks.
    let target = migrated_pool().await;
    set_raw_pin(&target, "default", "h", "s").await;
    set_raw_pin(&target, "local-only", "h2", "s2").await;

    import_impl(&target, snapshot).await.unwrap();

    assert_eq!(pin_of(&target, "kid").await, None, "unknown: no PIN");
    assert_eq!(
        pin_of(&target, "default").await,
        Some(("h".to_string(), "s".to_string())),
        "present before the restore: keeps its PIN"
    );
    let (gone,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM profiles WHERE uuid = 'local-only'")
        .fetch_one(&target)
        .await
        .unwrap();
    assert_eq!(
        gone, 0,
        "a profile absent from the backup is still replaced"
    );
}

#[tokio::test]
async fn undoing_the_last_restore_keeps_the_pin_of_a_profile_present_throughout() {
    let pool = migrated_pool().await;
    set_raw_pin(&pool, "default", "h", "s").await;
    // `pre-restore.json` is an export of the state before the restore.
    let pre_restore = export_impl(&pool).await.unwrap();

    let other = migrated_pool().await;
    import_impl(&pool, export_impl(&other).await.unwrap())
        .await
        .unwrap();
    assert_eq!(
        pin_of(&pool, "default").await,
        Some(("h".to_string(), "s".to_string()))
    );

    import_impl(&pool, pre_restore).await.unwrap();
    assert_eq!(
        pin_of(&pool, "default").await,
        Some(("h".to_string(), "s".to_string()))
    );
}

// ------------------------------------------------------------------
// Custom backup-location file I/O — plain `std::fs` against a real,
// uniquely-named temp directory (no SQLite involved, so no
// `migrated_pool()` needed). Each test gets its own subdirectory of
// `std::env::temp_dir()` (named with `new_uuid()`) so parallel test
// threads never collide on the same files.
// ------------------------------------------------------------------

fn temp_test_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "cinetrack-backup-test-{}",
        crate::database::new_uuid()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[tokio::test]
async fn write_backup_to_path_then_read_backup_from_path_round_trips_the_contents() {
    let dir = temp_test_dir();
    let path = dir.join("backup.json").to_str().unwrap().to_string();

    write_backup_to_path(path.clone(), "{\"hello\":\"world\"}".to_string())
        .await
        .unwrap();

    let read_back = read_backup_from_path(path).await.unwrap();
    assert_eq!(read_back.as_deref(), Some("{\"hello\":\"world\"}"));

    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn write_backup_to_path_creates_missing_parent_directories() {
    let dir = temp_test_dir();
    let nested = dir.join("nested").join("backups").join("backup.json");
    let path = nested.to_str().unwrap().to_string();

    write_backup_to_path(path.clone(), "content".to_string())
        .await
        .unwrap();

    assert!(nested.exists());

    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn write_backup_to_path_never_corrupts_a_previous_backup_when_the_write_fails() {
    // Simulates a mid-write crash: point `path` at a directory instead of
    // a regular file, so the final `std::fs::rename` step fails, and
    // confirm only the `.tmp` sibling exists — the (nonexistent) target
    // is never partially written.
    let dir = temp_test_dir();
    let target_as_directory = dir.join("backup.json");
    std::fs::create_dir_all(&target_as_directory).unwrap();
    let path = target_as_directory.to_str().unwrap().to_string();

    let result = write_backup_to_path(path, "content".to_string()).await;
    assert!(result.is_err());

    let tmp_path = dir.join("backup.json.tmp");
    assert!(tmp_path.exists(), "the atomic tmp file should still exist");
    assert!(
        target_as_directory.is_dir(),
        "the failed rename must never touch the original target"
    );

    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn read_backup_from_path_returns_none_for_a_missing_file() {
    let dir = temp_test_dir();
    let path = dir.join("backup.json").to_str().unwrap().to_string();

    let result = read_backup_from_path(path).await.unwrap();
    assert_eq!(result, None);

    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn list_backup_directory_lists_only_files_directly_inside_the_directory() {
    let dir = temp_test_dir();
    std::fs::write(dir.join("auto-1.json"), "{}").unwrap();
    std::fs::write(dir.join("auto-2.json"), "{}").unwrap();
    std::fs::create_dir_all(dir.join("a-subdirectory")).unwrap();

    let mut names = list_backup_directory(dir.to_str().unwrap().to_string())
        .await
        .unwrap();
    names.sort();

    assert_eq!(
        names,
        vec!["auto-1.json".to_string(), "auto-2.json".to_string()]
    );

    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn list_backup_directory_returns_an_empty_list_for_a_directory_that_does_not_exist() {
    let dir = temp_test_dir();
    let missing = dir.join("never-created");

    let names = list_backup_directory(missing.to_str().unwrap().to_string())
        .await
        .unwrap();
    assert!(names.is_empty());

    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn remove_backup_file_deletes_an_existing_file() {
    let dir = temp_test_dir();
    let path = dir.join("backup.json");
    std::fs::write(&path, "{}").unwrap();

    remove_backup_file(path.to_str().unwrap().to_string())
        .await
        .unwrap();
    assert!(!path.exists());

    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn remove_backup_file_is_a_no_op_for_a_file_that_is_already_gone() {
    let dir = temp_test_dir();
    let path = dir.join("backup.json");

    // Never created — must not error, matching the idempotent-removal
    // contract callers (pruneOldAutoBackups) rely on.
    remove_backup_file(path.to_str().unwrap().to_string())
        .await
        .unwrap();

    std::fs::remove_dir_all(&dir).ok();
}
