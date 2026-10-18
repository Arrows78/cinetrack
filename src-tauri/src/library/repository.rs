use serde_json::json;
use sqlx::SqlitePool;
#[cfg(test)]
use tauri::State;

#[cfg(test)]
use super::commands::{get_library_item, list_library, remove_library_item, save_library_item};
use super::domain::{LibraryStatus, LibraryStatusOrigin};
#[cfg(test)]
use super::models::AutoSyncMedia;
#[cfg(test)]
use super::models::{LibraryFilterParams, LibraryListParams, LibraryMediaKey, LibrarySort};
use super::models::{LibraryItem, LibraryPatch, LibraryRow, MediaSummaryInput};
use super::queries::get_impl;
#[cfg(test)]
use super::queries::{
    get_best_recommendation_seed_impl, get_items_by_keys_impl, get_random_impl, has_impl,
    list_completed_candidates_impl, list_distinct_tags_impl, list_ids_matching_filters_impl,
    list_impl, list_media_keys_impl, list_page_impl, list_planned_candidates_impl,
    list_status_counts_impl,
};
use super::rewatch_events;
#[cfg(test)]
use super::status::auto_sync_status_impl;
use crate::database::{new_uuid, now_iso};
use crate::error::ApiError;
use crate::history::{HistoryAction, MediaSnapshot, ViewingHistoryItem, add_history_item_impl};
use crate::models::MediaType;

pub(super) async fn upsert_impl(
    pool: &SqlitePool,
    media: MediaSummaryInput,
    patch: LibraryPatch,
    profile_id: &str,
) -> Result<LibraryItem, ApiError> {
    Ok(upsert_core(pool, media, patch, profile_id, false)
        .await?
        .expect("an upsert that may replace always returns the saved item"))
}

/// The body of `upsert_impl`. With `only_if_absent`, an existing row is left
/// exactly as it is and `None` comes back: the presence check and the insert
/// then sit under the same write lock, so a row created in between (an
/// automatic status, a concurrent add) is never overwritten.
async fn upsert_core(
    pool: &SqlitePool,
    media: MediaSummaryInput,
    patch: LibraryPatch,
    profile_id: &str,
    only_if_absent: bool,
) -> Result<Option<LibraryItem>, ApiError> {
    if patch.rewatch_count.is_some_and(|count| count < 0) {
        return Err(ApiError::bad_request(
            "The rewatch count cannot be negative",
        ));
    }
    // BEGIN IMMEDIATE before reading the current row: the read decides both
    // which fields this write keeps and whether a history row is appended, so
    // it has to sit under the same write lock as the write itself. Read
    // outside the transaction, two concurrent saves of one title each saw "not
    // in the library yet" (two `watchlist:add` rows), and two edits of
    // different fields each wrote back the other's stale value.
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(ApiError::from)?;
    let current = get_impl(&mut *tx, profile_id, media.id, media.media_type).await?;
    if only_if_absent && current.is_some() {
        return Ok(None);
    }
    let is_new = current.is_none();
    let now = now_iso(&mut *tx).await?;
    let status = patch.status.unwrap_or_else(|| {
        current
            .as_ref()
            .map_or(LibraryStatus::Planned, |c| c.status)
    });

    // Who set the status: a status the viewer picks (or a new entry added by
    // hand) is manual; a save that leaves the status alone keeps whoever set
    // it. Only an automatic status may be reopened by a TMDB refresh.
    let status_origin = match current.as_ref() {
        Some(previous) if previous.status == status => previous.status_origin.unwrap_or_default(),
        _ => LibraryStatusOrigin::Manual,
    };

    let is_currently_watching = status == LibraryStatus::Watching;
    let started_at = current
        .as_ref()
        .and_then(|c| c.started_at.clone())
        .or_else(|| is_currently_watching.then(|| now.clone()));
    let completed_at = if status == LibraryStatus::Completed {
        Some(
            current
                .as_ref()
                .and_then(|c| c.completed_at.clone())
                .unwrap_or_else(|| now.clone()),
        )
    } else {
        None
    };

    let item = LibraryItem {
        // Generate the id once and reuse it for both the returned item and
        // the persisted row on insert, so a newly-created item's reported
        // `id` always matches its real stored `uuid`.
        id: current.as_ref().map_or_else(new_uuid, |c| c.id.clone()),
        profile_id: profile_id.to_string(),
        media_id: media.id,
        media_type: media.media_type,
        title: media.title,
        // A partial summary (a caller that only knows some catalogue fields)
        // never blanks what the row already holds.
        poster_path: media
            .poster_path
            .or_else(|| current.as_ref().and_then(|c| c.poster_path.clone())),
        backdrop_path: media
            .backdrop_path
            .or_else(|| current.as_ref().and_then(|c| c.backdrop_path.clone())),
        year: media.year.or_else(|| current.as_ref().and_then(|c| c.year)),
        rating: media
            .rating
            .or_else(|| current.as_ref().and_then(|c| c.rating)),
        genres: if media.genres.is_empty() {
            current.as_ref().map_or_else(Vec::new, |c| c.genres.clone())
        } else {
            media.genres
        },
        status,
        favourite: patch
            .favourite
            .unwrap_or_else(|| current.as_ref().is_some_and(|c| c.favourite)),
        user_rating: match patch.user_rating {
            Some(explicit) => explicit,
            None => current.as_ref().and_then(|c| c.user_rating),
        },
        notes: match patch.notes {
            Some(explicit) => explicit,
            None => current.as_ref().and_then(|c| c.notes.clone()),
        },
        tags: patch
            .tags
            .unwrap_or_else(|| current.as_ref().map_or_else(Vec::new, |c| c.tags.clone())),
        started_at,
        completed_at,
        rewatch_count: patch
            .rewatch_count
            .unwrap_or_else(|| current.as_ref().map_or(0, |c| c.rewatch_count)),
        created_at: current
            .as_ref()
            .map_or_else(|| now.clone(), |c| c.created_at.clone()),
        updated_at: now,
        status_origin: Some(status_origin),
    };

    sqlx::query(
        "INSERT INTO library_items (
          uuid, profile_id, media_id, media_type, title, poster_path, backdrop_path, year, rating, genres,
          status, favourite, user_rating, notes, tags, started_at, completed_at, rewatch_count, created_at, updated_at,
          status_origin
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        ON CONFLICT (profile_id, media_id, media_type) DO UPDATE SET
          title = excluded.title,
          poster_path = excluded.poster_path,
          backdrop_path = excluded.backdrop_path,
          year = excluded.year,
          rating = excluded.rating,
          genres = excluded.genres,
          status = excluded.status,
          favourite = excluded.favourite,
          user_rating = excluded.user_rating,
          notes = excluded.notes,
          tags = excluded.tags,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          rewatch_count = excluded.rewatch_count,
          updated_at = excluded.updated_at,
          status_origin = excluded.status_origin",
    )
    .bind(&item.id)
    .bind(&item.profile_id)
    .bind(item.media_id)
    .bind(item.media_type.as_db_str())
    .bind(&item.title)
    .bind(&item.poster_path)
    .bind(&item.backdrop_path)
    .bind(item.year)
    .bind(item.rating)
    .bind(serde_json::to_string(&item.genres).unwrap())
    .bind(item.status.as_db_str())
    .bind(item.favourite)
    .bind(item.user_rating)
    .bind(&item.notes)
    .bind(serde_json::to_string(&item.tags).unwrap())
    .bind(&item.started_at)
    .bind(&item.completed_at)
    .bind(item.rewatch_count)
    .bind(&item.created_at)
    .bind(&item.updated_at)
    .bind(status_origin.as_db_str())
    .execute(&mut *tx)
    .await
    .map_err(ApiError::from)?;

    // A title planned after a "not interested" is a newer, explicit intent
    // than the dismissal, so planning it (a new entry, or an existing one
    // moving back to "to watch") lifts the dismissal and it can reach Watch
    // Tonight again. Only the transition counts: re-saving an
    // already-planned title leaves a later dismissal in place.
    let newly_planned = status == LibraryStatus::Planned
        && current
            .as_ref()
            .is_none_or(|previous| previous.status != LibraryStatus::Planned);
    if newly_planned {
        sqlx::query(
            "DELETE FROM dismissed_recommendations WHERE profile_id = $1 AND media_id = $2 AND media_type = $3",
        )
        .bind(profile_id)
        .bind(item.media_id)
        .bind(item.media_type.as_db_str())
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;
    }

    // A changed rewatch count is a rewatch (or the taking back of one): the
    // events the rewatch statistics read follow it, in the same transaction.
    let previous_rewatches = current.as_ref().map_or(0, |c| c.rewatch_count);
    if item.rewatch_count != previous_rewatches {
        rewatch_events::apply_counter_change(
            &mut tx,
            profile_id,
            item.media_id,
            item.media_type,
            &item.title,
            previous_rewatches,
            item.rewatch_count,
            &item.updated_at,
        )
        .await?;
    }

    if is_new {
        let timestamp = now_iso(&mut *tx).await?;
        let history_item = ViewingHistoryItem {
            id: new_uuid(),
            media_id: item.media_id,
            media_type: item.media_type,
            title: item.title.clone(),
            action: HistoryAction::LibraryAdd,
            timestamp,
            season_number: None,
            episode_number: None,
            episode_title: None,
            metadata: Some(json!({ "profileId": profile_id })),
        };
        add_history_item_impl(&mut *tx, pool, history_item).await?;
    } else if let Some(previous) = current.as_ref() {
        // A plain re-save of already-current values (retry, double-click,
        // an editor submitting unchanged fields) must never append a
        // duplicate history row — see CLAUDE.md's idempotent-mutations rule.
        let mut changed_fields: Vec<&'static str> = Vec::new();
        if previous.status != item.status {
            changed_fields.push("status");
        }
        if previous.notes != item.notes {
            changed_fields.push("notes");
        }
        if previous.tags != item.tags {
            changed_fields.push("tags");
        }
        if previous.user_rating != item.user_rating {
            changed_fields.push("userRating");
        }
        if previous.favourite != item.favourite {
            changed_fields.push("favourite");
        }

        if !changed_fields.is_empty() {
            let timestamp = now_iso(&mut *tx).await?;
            let mut metadata = json!({ "profileId": profile_id, "changedFields": changed_fields });
            if changed_fields.contains(&"status") {
                metadata["status"] = json!(item.status.as_db_str());
            }
            let history_item = ViewingHistoryItem {
                id: new_uuid(),
                media_id: item.media_id,
                media_type: item.media_type,
                title: item.title.clone(),
                action: HistoryAction::LibraryUpdate,
                timestamp,
                season_number: None,
                episode_number: None,
                episode_title: None,
                metadata: Some(metadata),
            };
            add_history_item_impl(&mut *tx, pool, history_item).await?;
        }
    }

    tx.commit().await.map_err(ApiError::from)?;
    Ok(Some(item))
}

/// History metadata for a library removal: carries a snapshot of the
/// removed entry's catalogue fields so "undo" can re-add it offline.
fn removal_metadata(profile_id: &str, snapshot: MediaSnapshot<'_>) -> serde_json::Value {
    json!({ "profileId": profile_id, "media": snapshot.to_value() })
}

pub(super) async fn remove_impl(
    pool: &SqlitePool,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
) -> Result<(), ApiError> {
    // Read and delete under one IMMEDIATE transaction (see upsert_impl): only
    // the caller that actually removes the row logs the removal.
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(ApiError::from)?;
    let existing = get_impl(&mut *tx, profile_id, media_id, media_type).await?;

    sqlx::query(
        "DELETE FROM library_items WHERE profile_id = $1 AND media_id = $2 AND media_type = $3",
    )
    .bind(profile_id)
    .bind(media_id)
    .bind(media_type.as_db_str())
    .execute(&mut *tx)
    .await
    .map_err(ApiError::from)?;

    if let Some(item) = existing {
        let timestamp = now_iso(&mut *tx).await?;
        let metadata = removal_metadata(
            profile_id,
            MediaSnapshot {
                title: &item.title,
                poster_path: item.poster_path.as_deref(),
                backdrop_path: item.backdrop_path.as_deref(),
                runtime: None,
                year: item.year,
                rating: item.rating,
                genres: json!(item.genres),
            },
        );
        let history_item = ViewingHistoryItem {
            id: new_uuid(),
            media_id,
            media_type,
            title: item.title,
            action: HistoryAction::LibraryRemove,
            timestamp,
            season_number: None,
            episode_number: None,
            episode_title: None,
            metadata: Some(metadata),
        };
        add_history_item_impl(&mut *tx, pool, history_item).await?;
    }

    tx.commit().await.map_err(ApiError::from)?;
    Ok(())
}

/// Corrects an existing library entry's cached year/rating against fresh
/// TMDB data — deliberately UPDATE-only, never INSERT: a library row can end
/// up with a stale or null year/rating when it was first created by a
/// codepath that only had partial media info in hand (e.g. marking a "watch
/// next" episode seen from the Home page, which synthesizes a MediaSummary
/// with no year/rating for a series it never fetched full details for — see
/// use-watch-next.ts's useMarkWatchNext). Safe to call for any title
/// regardless of whether it's actually in the library: a non-matching WHERE
/// clause just updates zero rows. Deliberately leaves `updated_at`
/// untouched too — a library entry shouldn't jump to the top of "recently
/// updated" sort purely as a side effect of viewing its detail page.
pub(super) async fn refresh_catalog_metadata_impl(
    pool: &SqlitePool,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
    year: Option<i64>,
    rating: Option<f64>,
) -> Result<(), ApiError> {
    sqlx::query(
        "UPDATE library_items SET year = $1, rating = $2
         WHERE profile_id = $3 AND media_id = $4 AND media_type = $5",
    )
    .bind(year)
    .bind(rating)
    .bind(profile_id)
    .bind(media_id)
    .bind(media_type.as_db_str())
    .execute(pool)
    .await
    .map_err(ApiError::from)?;
    Ok(())
}

/// "Add to the library unless it's already there" — the quick add toggle and
/// the TV Time watchlist import. `save_library_item` with a planned status
/// would also overwrite an existing row's status, sending a finished or
/// in-progress title back to "to watch" and dropping its completed_at.
/// Returns whether a row was added.
pub(super) async fn add_if_absent_impl(
    pool: &SqlitePool,
    media: MediaSummaryInput,
    profile_id: &str,
) -> Result<bool, ApiError> {
    let (media_id, media_type) = (media.id, media.media_type);
    let added = upsert_core(
        pool,
        media,
        LibraryPatch {
            status: Some(LibraryStatus::Planned),
            ..Default::default()
        },
        profile_id,
        true,
    )
    .await?;
    if added.is_none() {
        return Ok(false);
    }
    // Progress that outlived an earlier stay in the library decides the status
    // (an episode-by-episode series back to Watching, a seen movie to
    // Completed) instead of Planned.
    super::status::adopt_existing_progress_impl(pool, profile_id, media_id, media_type).await?;
    Ok(true)
}

/// Backs the grid/detail quick "add to library" toggle, whose remove side
/// must never destroy real progress: only removes (and logs) a row that's
/// still in the default `planned` status, a no-op returning `false`
/// otherwise (already started/finished, or already gone) — unlike
/// `remove_library_item`, which is unconditional and sits behind
/// `LibraryEditor`'s own `ConfirmDialog`.
pub(super) async fn remove_if_planned_impl(
    pool: &SqlitePool,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
) -> Result<bool, ApiError> {
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(ApiError::from)?;
    let existing: Option<LibraryRow> = sqlx::query_as(
        "SELECT * FROM library_items WHERE profile_id = $1 AND media_id = $2 AND media_type = $3 AND status = 'planned' LIMIT 1",
    )
    .bind(profile_id)
    .bind(media_id)
    .bind(media_type.as_db_str())
    .fetch_optional(&mut *tx)
    .await
    .map_err(ApiError::from)?;

    let Some(row) = existing else {
        tx.commit().await.map_err(ApiError::from)?;
        return Ok(false);
    };

    delete_row_and_log_removal(&mut tx, pool, profile_id, row).await?;

    tx.commit().await.map_err(ApiError::from)?;
    Ok(true)
}

/// Deletes one already-read library row and logs the removal, with the
/// snapshot an undo needs (see `removal_metadata`). The caller owns the
/// transaction and has checked that this removal is wanted.
async fn delete_row_and_log_removal(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    pool: &SqlitePool,
    profile_id: &str,
    row: LibraryRow,
) -> Result<(), ApiError> {
    sqlx::query("DELETE FROM library_items WHERE uuid = $1")
        .bind(&row.uuid)
        .execute(&mut **tx)
        .await
        .map_err(ApiError::from)?;

    let timestamp = now_iso(&mut **tx).await?;
    let genres: serde_json::Value =
        serde_json::from_str(&row.genres).map_err(|e| ApiError::internal(e.to_string()))?;
    let metadata = removal_metadata(
        profile_id,
        MediaSnapshot {
            title: &row.title,
            poster_path: row.poster_path.as_deref(),
            backdrop_path: row.backdrop_path.as_deref(),
            runtime: None,
            year: row.year,
            rating: row.rating,
            genres,
        },
    );
    let history_item = ViewingHistoryItem {
        id: new_uuid(),
        media_id: row.media_id,
        media_type: MediaType::from_db_str(&row.media_type),
        title: row.title,
        action: HistoryAction::LibraryRemove,
        timestamp,
        season_number: None,
        episode_number: None,
        episode_title: None,
        metadata: Some(metadata),
    };
    add_history_item_impl(&mut **tx, pool, history_item).await
}

/// One library entry an import created, with the moment the import finished
/// writing to it.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedLibraryItem {
    pub id: String,
    pub imported_at: String,
}

/// What `remove_untouched_items_impl` did.
#[derive(Debug, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UntouchedRemoval {
    /// Entries deleted: still exactly as the import left them.
    pub removed: i64,
    /// Entries kept because they were edited after the import
    /// (`updated_at` later than `imported_at`: status, rating, favourite,
    /// notes, tags, a later watch...).
    pub kept: i64,
}

/// Undo half of a bulk import: removes, in one transaction, the library
/// entries the import itself created — but only those of `profile_id` that
/// nobody has touched since. An entry that is gone already (a second undo,
/// or deleted by hand) or belongs to another profile counts as neither
/// removed nor kept, so calling this twice is a no-op the second time.
/// Every edit path bumps `updated_at`, which is what "touched" means here.
pub(crate) async fn remove_untouched_items_impl(
    pool: &SqlitePool,
    profile_id: &str,
    items: &[CreatedLibraryItem],
) -> Result<UntouchedRemoval, ApiError> {
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(ApiError::from)?;
    let mut outcome = UntouchedRemoval::default();
    for item in items {
        let row: Option<LibraryRow> =
            sqlx::query_as("SELECT * FROM library_items WHERE uuid = $1 AND profile_id = $2")
                .bind(&item.id)
                .bind(profile_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(ApiError::from)?;
        let Some(row) = row else { continue };
        if row.updated_at.as_str() > item.imported_at.as_str() {
            outcome.kept += 1;
            continue;
        }
        delete_row_and_log_removal(&mut tx, pool, profile_id, row).await?;
        outcome.removed += 1;
    }
    tx.commit().await.map_err(ApiError::from)?;
    Ok(outcome)
}

#[cfg(test)]
mod tests;
