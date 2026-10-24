//! Backup import: replaces the entire database content inside one
//! transaction (all-or-nothing). Tables are cleared child-first so FOREIGN
//! KEY constraints never trip mid-import. Rows whose app-level identity is
//! the `uuid` column (profiles, custom lists, history, viewing events,
//! alerts) reuse the backup's `id` field as that uuid so identity survives a
//! round trip; rows with no app-level identity (seen movies, episode
//! progress, tracked series, list items, library items) get a fresh uuid.

use serde_json::Value;
use sqlx::{QueryBuilder, Sqlite, SqlitePool};

use super::PortableData;
use crate::database::{DEFAULT_PROFILE_ID, new_uuid};
use crate::error::ApiError;
use crate::stats::ViewingEvent;

// "Chunk rows into IMPORT_BATCH_SIZE, build a multi-row INSERT via
// QueryBuilder, execute" is the shape repeated once per table below (see the
// matching note in export.rs on why a macro rather than a trait).
//
// Per-table *bind order* stays written out by hand in each import_table!
// call — those differ enough table-to-table (fresh uuid vs. preserved id,
// JSON-encoded columns, fallible enum parsing, computed defaults/timestamps)
// that folding them into the macro too would be a harder-to-audit
// indirection on the single most correctness-sensitive path in the app.

/// Chunks `$items` into `IMPORT_BATCH_SIZE`-row batches, builds a
/// multi-row INSERT from `$sql` (the `INSERT INTO ... (columns)` prefix,
/// verbatim from the pre-refactor code) via `QueryBuilder`, binds each row
/// with the `|$b, $item| $bind` closure, and executes each batch against
/// the caller's open transaction `$tx`. Only fits tables imported as a
/// batched multi-row INSERT; `profiles` and `preferences` insert one row
/// at a time by hand in import_impl (there's no natural "batch" shape for
/// either — a handful of profiles, one row per preference key) and don't
/// go through this macro.
macro_rules! import_table {
    ($tx:expr, $items:expr, $sql:literal, |$b:ident, $item:ident| $bind:block) => {
        for chunk in $items.chunks(IMPORT_BATCH_SIZE) {
            let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new($sql);
            qb.push_values(chunk, |mut $b, $item| $bind);
            qb.build()
                .execute(&mut *$tx)
                .await
                .map_err(ApiError::from)?;
        }
    };
}

// Keeps each multi-row INSERT's placeholder count well under SQLite's
// bound-parameter limit even for the widest table here (library_items, 20
// columns): 200 * 20 = 4,000, far below the 32,766 default.
pub(super) const IMPORT_BATCH_SIZE: usize = 200;

/// The events in the order they were originally logged in: by the position
/// the export recorded, or — for a backup from before events carried one, or
/// a file that lost it — by date, which is the order such events were read in.
fn events_in_log_order(mut events: Vec<ViewingEvent>) -> Vec<ViewingEvent> {
    if events.iter().all(|event| event.insert_seq.is_some()) {
        events.sort_by_key(|event| event.insert_seq);
    } else {
        events.sort_by(|a, b| a.watched_at.cmp(&b.watched_at));
    }
    events
}

/// Rewrites a readable instant to the canonical stored form (RFC 3339 UTC,
/// millis) so string comparisons in SQL order it correctly. An unreadable one
/// is left as it was: only the viewing log refuses those.
fn canonicalize_in_place(value: &mut String) {
    if let Ok(canonical) = crate::database::canonical_instant(value) {
        *value = canonical;
    }
}

pub(super) async fn import_impl(pool: &SqlitePool, mut data: PortableData) -> Result<(), ApiError> {
    // One unreadable date in the log would make every statistic fail once the
    // restore has replaced the database, so such a file is refused up front.
    // The dates are stored in canonical form (SQL compares them as strings).
    // A file is not a trusted writer: the profile fields obey the same rules as
    // `create_profile`, and a file cannot bring more profiles than the app allows.
    if data.profiles.len() > crate::profiles::PROFILE_LIMIT {
        return Err(ApiError::bad_request(
            "The backup holds more profiles than the app allows.",
        ));
    }
    for profile in &mut data.profiles {
        let (name, avatar) =
            crate::profiles::validated_profile_fields(&profile.name, profile.avatar.take())?;
        profile.name = name;
        profile.avatar = avatar;
    }
    for event in &mut data.viewing_events {
        event.watched_at = crate::database::canonical_instant(&event.watched_at)?;
    }
    for movie in &mut data.seen_movies {
        canonicalize_in_place(&mut movie.watched_at);
    }
    for episode in &mut data.episode_progress {
        if let Some(watched_at) = episode.watched_at.as_mut() {
            canonicalize_in_place(watched_at);
        }
    }
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(ApiError::from)?;

    // A PIN-protected profile (other than the active one) is neither replaced
    // nor deleted by a restore, and a file cannot write into it either: its
    // rows are dropped from the payload before anything is touched.
    let withheld = super::scope::withheld_profile_ids(&mut tx).await?;
    let withheld_json = super::scope::as_json_array(&withheld);
    data.drop_profiles(&withheld);
    // What the cloud holds, noted before the purge forgets it: a restore must
    // delete there what the restored data no longer has, not just stop
    // tracking it.
    crate::sync::snapshot_synced_documents(&mut tx, &withheld_json).await?;

    // The export never carries a PIN (hash and salt are device secrets), so
    // the purge below would unlock every profile. A profile whose uuid is
    // already in the database is the same person on the same device: its PIN
    // is read here and put back after the profiles are re-inserted. A
    // profile absent before the restore (another device) arrives unlocked.
    let existing_pins: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT uuid, pin_hash, pin_salt FROM profiles WHERE pin_hash IS NOT NULL AND pin_salt IS NOT NULL",
    )
    .fetch_all(&mut *tx)
    .await
    .map_err(ApiError::from)?;

    // Same reasoning for the cloud account link: a profile already in this
    // database keeps the link it has here (set or not), whatever the file says.
    let existing_links: Vec<(String, Option<String>)> =
        sqlx::query_as("SELECT uuid, supabase_user_id FROM profiles")
            .fetch_all(&mut *tx)
            .await
            .map_err(ApiError::from)?;

    // Child-first purge order: `custom_list_items` before `custom_lists`
    // (its own FK target), everything in `PROFILE_SCOPED_TABLES` before
    // `profiles` (what they all reference) — `availability_snapshots` and
    // `preferences` have no FK of their own, so they're unconstrained.
    let purge_order: Vec<&str> = ["availability_snapshots", "custom_list_items"]
        .into_iter()
        .chain(crate::database::PROFILE_SCOPED_TABLES.iter().copied())
        .chain(["preferences", "profiles"])
        .collect();
    for table in purge_order {
        // `table` iterates a fixed Rust list built above, never user input;
        // the withheld ids travel as one bound JSON array.
        let keep_withheld = match table {
            "profiles" => " WHERE uuid NOT IN (SELECT value FROM json_each($1))",
            "custom_list_items" => {
                " WHERE list_id NOT IN (SELECT uuid FROM custom_lists \
                 WHERE profile_id IN (SELECT value FROM json_each($1)))"
            }
            // No owner: a cache of the catalogue's provider lists.
            "availability_snapshots" => "",
            "preferences" => "",
            _ => " WHERE COALESCE(profile_id, '') NOT IN (SELECT value FROM json_each($1))",
        };
        let mut query = sqlx::query(sqlx::AssertSqlSafe(format!(
            "DELETE FROM {table}{keep_withheld}"
        )));
        if keep_withheld.contains("$1") {
            query = query.bind(&withheld_json);
        }
        query.execute(&mut *tx).await.map_err(ApiError::from)?;
    }

    for item in &data.profiles {
        sqlx::query(
            "INSERT INTO profiles (uuid, name, avatar, supabase_user_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)",
        )
        .bind(&item.id)
        .bind(&item.name)
        .bind(&item.avatar)
        .bind(&item.supabase_user_id)
        .bind(&item.created_at)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;
    }

    for (uuid, pin_hash, pin_salt) in &existing_pins {
        // Matches nothing when the backup has no such profile.
        sqlx::query("UPDATE profiles SET pin_hash = $1, pin_salt = $2 WHERE uuid = $3")
            .bind(pin_hash)
            .bind(pin_salt)
            .bind(uuid)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from)?;
    }

    for (uuid, supabase_user_id) in &existing_links {
        // Matches nothing when the backup has no such profile.
        sqlx::query("UPDATE profiles SET supabase_user_id = $1 WHERE uuid = $2")
            .bind(supabase_user_id)
            .bind(uuid)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from)?;
    }

    // The purge above emptied the outbox and the per-entity sync state (they
    // cascade with the profiles), but not these: a kept cursor or bootstrap
    // flag would tell the next sync the restored rows are already known to
    // the cloud. Without them, it pulls from the start and reseeds.
    // A withheld profile's own cursor stays: its rows were not touched.
    let sync_keys: Vec<(String,)> = sqlx::query_as(
        "SELECT key FROM sync_metadata WHERE key LIKE 'cursor:%' OR key LIKE 'bootstrap:%'",
    )
    .fetch_all(&mut *tx)
    .await
    .map_err(ApiError::from)?;
    for (key,) in sync_keys {
        let owner = key.rsplit(':').next().unwrap_or_default();
        if withheld.contains(owner) {
            continue;
        }
        sqlx::query("DELETE FROM sync_metadata WHERE key = $1")
            .bind(&key)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from)?;
    }

    // Preferences go through the same rules as a write: an invalid value is
    // dropped (the default applies), and an active profile the restore does
    // not bring back falls back to the default one rather than breaking every
    // later write scoped to it.
    let mut preferences = crate::preferences::sanitize_imported(&data.preferences);
    let active_is_restored = preferences
        .get("activeProfileId")
        .and_then(Value::as_str)
        .is_none_or(|active| data.profiles.iter().any(|profile| profile.id == active));
    if !active_is_restored {
        preferences.remove("activeProfileId");
        if !data
            .profiles
            .iter()
            .any(|profile| profile.id == DEFAULT_PROFILE_ID)
            && let Some(first) = data.profiles.first()
        {
            preferences.insert(
                "activeProfileId".to_string(),
                Value::String(first.id.clone()),
            );
        }
    }

    let now = crate::database::now_iso(&mut *tx).await?;
    for (key, value) in &preferences {
        sqlx::query("INSERT INTO preferences (key, value, updated_at) VALUES ($1,$2,$3)")
            .bind(key)
            .bind(value.to_string())
            .bind(&now)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from)?;
    }

    import_table!(
        tx,
        data.seen_movies,
        "INSERT INTO seen_movies (uuid,profile_id,movie_id,title,poster_path,backdrop_path,watched_at,created_at,updated_at) ",
        |b, item| {
            b.push_bind(new_uuid())
                .push_bind(
                    item.profile_id
                        .clone()
                        .unwrap_or_else(|| DEFAULT_PROFILE_ID.to_string()),
                )
                .push_bind(item.movie_id)
                .push_bind(&item.title)
                .push_bind(&item.poster_path)
                .push_bind(&item.backdrop_path)
                .push_bind(&item.watched_at)
                .push_bind(&item.watched_at)
                .push_bind(&item.watched_at);
        }
    );

    import_table!(
        tx,
        data.episode_progress,
        "INSERT INTO episode_progress
              (uuid,profile_id,series_id,episode_id,season_number,episode_number,watched,watched_at,created_at,updated_at,rating) ",
        |b, item| {
            b.push_bind(new_uuid())
                .push_bind(item.profile_id.clone().unwrap_or_else(|| DEFAULT_PROFILE_ID.to_string()))
                .push_bind(item.series_id)
                .push_bind(item.episode_id)
                .push_bind(item.season_number)
                .push_bind(item.episode_number)
                .push_bind(item.watched)
                .push_bind(item.watched_at.clone())
                .push_bind(&item.created_at)
                .push_bind(&item.updated_at)
                .push_bind(item.rating);
        }
    );

    import_table!(
        tx,
        data.tracked_series,
        "INSERT INTO tracked_series
              (uuid,profile_id,series_id,title,poster_path,backdrop_path,total_episodes,status,created_at,updated_at) ",
        |b, item| {
            b.push_bind(new_uuid())
                .push_bind(item.profile_id.clone().unwrap_or_else(|| DEFAULT_PROFILE_ID.to_string()))
                .push_bind(item.series_id)
                .push_bind(&item.title)
                .push_bind(&item.poster_path)
                .push_bind(&item.backdrop_path)
                .push_bind(item.total_episodes)
                .push_bind(&item.status)
                .push_bind(&item.created_at)
                .push_bind(&item.updated_at);
        }
    );

    import_table!(
        tx,
        data.history,
        "INSERT INTO activity_log
              (uuid,profile_id,media_id,media_type,title,action,season_number,episode_number,episode_title,metadata,timestamp,created_at,updated_at) ",
        |b, item| {
            // profile_id mirrors metadata.profileId — must stay in sync here or
            // imported history silently drops out of list_history's indexed
            // profile_id query.
            let history_profile_id = item
                .metadata
                .as_ref()
                .and_then(|m| m.get("profileId"))
                .and_then(Value::as_str)
                .unwrap_or(DEFAULT_PROFILE_ID)
                .to_string();
            b.push_bind(&item.id)
                .push_bind(history_profile_id)
                .push_bind(item.media_id)
                .push_bind(item.media_type.as_db_str())
                .push_bind(&item.title)
                .push_bind(item.action.as_db_str())
                .push_bind(item.season_number)
                .push_bind(item.episode_number)
                .push_bind(&item.episode_title)
                .push_bind(item.metadata.as_ref().map(|value| value.to_string()))
                .push_bind(&item.timestamp)
                .push_bind(&item.timestamp)
                .push_bind(&item.timestamp);
        }
    );

    import_table!(
        tx,
        data.library,
        "INSERT INTO library_items
              (uuid,profile_id,media_id,media_type,title,poster_path,backdrop_path,year,rating,genres,status,favourite,user_rating,notes,tags,started_at,completed_at,rewatch_count,created_at,updated_at,status_origin) ",
        |b, item| {
            b.push_bind(new_uuid())
                .push_bind(&item.profile_id)
                .push_bind(item.media_id)
                .push_bind(item.media_type.as_db_str())
                .push_bind(&item.title)
                .push_bind(&item.poster_path)
                .push_bind(&item.backdrop_path)
                .push_bind(item.year)
                .push_bind(item.rating)
                .push_bind(serde_json::to_string(&item.genres).unwrap())
                .push_bind(item.status.as_db_str())
                .push_bind(item.favourite)
                .push_bind(item.user_rating)
                .push_bind(&item.notes)
                .push_bind(serde_json::to_string(&item.tags).unwrap())
                .push_bind(&item.started_at)
                .push_bind(&item.completed_at)
                .push_bind(item.rewatch_count)
                .push_bind(&item.created_at)
                .push_bind(&item.updated_at)
                .push_bind(item.status_origin.unwrap_or_default().as_db_str());
        }
    );

    // The order events were logged in decides which one is a title's latest
    // (see `viewing_events.insert_seq`), and the database numbers rows in the
    // order they are inserted — so replay them in the order they were logged.
    let viewing_events = events_in_log_order(data.viewing_events.clone());
    import_table!(
        tx,
        viewing_events,
        "INSERT INTO viewing_events
              (uuid,profile_id,media_id,media_type,title,event_type,watched_at,duration_minutes,episode_id,season_number,episode_number,note,created_at) ",
        |b, item| {
            b.push_bind(&item.id)
                .push_bind(&item.profile_id)
                .push_bind(item.media_id)
                .push_bind(item.media_type.as_db_str())
                .push_bind(&item.title)
                .push_bind(item.event_type.as_db_str())
                .push_bind(&item.watched_at)
                .push_bind(item.duration_minutes)
                .push_bind(item.episode_id)
                .push_bind(item.season_number)
                .push_bind(item.episode_number)
                .push_bind(&item.note)
                .push_bind(&item.watched_at);
        }
    );

    import_table!(
        tx,
        data.custom_lists,
        "INSERT INTO custom_lists (uuid, profile_id, name, description, created_at, updated_at) ",
        |b, item| {
            b.push_bind(&item.id)
                .push_bind(&item.profile_id)
                .push_bind(&item.name)
                .push_bind(&item.description)
                .push_bind(&item.created_at)
                .push_bind(&item.updated_at);
        }
    );

    import_table!(
        tx,
        data.custom_list_items,
        "INSERT INTO custom_list_items (uuid,list_id,media_id,media_type,title,poster_path,position,added_at,updated_at) ",
        |b, item| {
            b.push_bind(new_uuid())
                .push_bind(&item.list_id)
                .push_bind(item.media_id)
                .push_bind(item.media_type.as_db_str())
                .push_bind(&item.title)
                .push_bind(&item.poster_path)
                .push_bind(item.position)
                .push_bind(&item.added_at)
                .push_bind(&item.updated_at);
        }
    );

    import_table!(
        tx,
        data.availability_snapshots,
        "INSERT INTO availability_snapshots (media_id, media_type, region, provider_ids, checked_at) ",
        |b, item| {
            b.push_bind(item.media_id)
                .push_bind(item.media_type.as_db_str())
                .push_bind(&item.region)
                .push_bind(serde_json::to_string(&item.provider_ids).unwrap())
                .push_bind(&item.checked_at);
        }
    );

    import_table!(
        tx,
        data.availability_alerts,
        "INSERT INTO availability_alerts
              (uuid,profile_id,media_id,media_type,title,region,provider_ids,enabled,created_at,updated_at) ",
        |b, item| {
            b.push_bind(&item.id)
                .push_bind(&item.profile_id)
                .push_bind(item.media_id)
                .push_bind(item.media_type.as_db_str())
                .push_bind(&item.title)
                .push_bind(&item.region)
                .push_bind(serde_json::to_string(&item.provider_ids).unwrap())
                .push_bind(item.enabled)
                .push_bind(&item.created_at)
                .push_bind(&item.created_at);
        }
    );

    import_table!(
        tx,
        data.smart_lists,
        "INSERT INTO smart_lists (uuid,profile_id,name,rules,created_at,updated_at) ",
        |b, item| {
            b.push_bind(&item.id)
                .push_bind(&item.profile_id)
                .push_bind(&item.name)
                .push_bind(serde_json::to_string(&item.rules).unwrap())
                .push_bind(&item.created_at)
                .push_bind(&item.updated_at);
        }
    );

    import_table!(
        tx,
        data.saved_filters,
        "INSERT INTO saved_filters (uuid,profile_id,page,name,filters,created_at,updated_at) ",
        |b, item| {
            b.push_bind(&item.id)
                .push_bind(&item.profile_id)
                .push_bind(&item.page)
                .push_bind(&item.name)
                .push_bind(serde_json::to_string(&item.filters).unwrap())
                .push_bind(&item.created_at)
                .push_bind(&item.updated_at);
        }
    );

    import_table!(
        tx,
        data.dismissed_recommendations,
        "INSERT INTO dismissed_recommendations (uuid,profile_id,media_id,media_type,title,poster_path,dismissed_at,created_at,updated_at) ",
        |b, item| {
            b.push_bind(&item.id)
                .push_bind(&item.profile_id)
                .push_bind(item.media_id)
                .push_bind(item.media_type.as_db_str())
                .push_bind(&item.title)
                .push_bind(&item.poster_path)
                .push_bind(&item.dismissed_at)
                .push_bind(&item.created_at)
                .push_bind(&item.updated_at);
        }
    );

    crate::sync::queue_deletes_for_missing_documents(&mut tx).await?;

    tx.commit().await.map_err(ApiError::from)?;
    Ok(())
}
