use serde_json::json;
use sqlx::SqlitePool;
#[cfg(test)]
use tauri::State;

#[cfg(test)]
use super::commands::{get_library_item, list_library, remove_library_item, save_library_item};
use super::domain::{LibraryStatus, auto_sync_rank};
use super::models::{AutoSyncMedia, LibraryItem, LibraryPatch, LibraryRow, MediaSummaryInput};
#[cfg(test)]
use super::models::{LibraryFilterParams, LibraryListParams, LibraryMediaKey, LibrarySort};
use super::queries::get_impl;
#[cfg(test)]
use super::queries::{
    get_best_recommendation_seed_impl, get_items_by_keys_impl, has_impl,
    list_completed_candidates_impl, list_ids_matching_filters_impl, list_impl,
    list_media_keys_impl, list_page_impl, list_planned_candidates_impl, list_status_counts_impl,
};
use crate::database::{new_uuid, now_iso};
use crate::error::ApiError;
use crate::history::{HistoryAction, ViewingHistoryItem, add_history_item_impl};
use crate::models::MediaType;

pub(super) async fn upsert_impl(
    pool: &SqlitePool,
    media: MediaSummaryInput,
    patch: LibraryPatch,
    profile_id: &str,
) -> Result<LibraryItem, ApiError> {
    let current = get_impl(pool, profile_id, media.id, media.media_type).await?;
    let is_new = current.is_none();
    let now = now_iso(pool).await?;
    let status = patch.status.unwrap_or_else(|| {
        current
            .as_ref()
            .map_or(LibraryStatus::Planned, |c| c.status)
    });

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
        // Reusing the same fresh id for both the returned item and the
        // persisted row on insert — the original TS generated two different
        // uuids here (one for the returned object, a second, different one
        // actually bound into the INSERT), so a newly-created item's
        // reported `id` never matched its real stored `uuid`.
        id: current.as_ref().map_or_else(new_uuid, |c| c.id.clone()),
        profile_id: profile_id.to_string(),
        media_id: media.id,
        media_type: media.media_type,
        title: media.title,
        poster_path: media.poster_path,
        backdrop_path: media.backdrop_path,
        year: media.year,
        rating: media.rating,
        genres: media.genres,
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
    };

    let mut tx = pool.begin().await.map_err(ApiError::from)?;

    sqlx::query(
        "INSERT INTO library_items (
          uuid, profile_id, media_id, media_type, title, poster_path, backdrop_path, year, rating, genres,
          status, favourite, user_rating, notes, tags, started_at, completed_at, rewatch_count, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
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
          updated_at = excluded.updated_at",
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
    .execute(&mut *tx)
    .await
    .map_err(ApiError::from)?;

    // Only the first time an item is created — matching the exact idempotent
    // pattern used by the pre-merge watchlist feature (see git history),
    // never on a plain status/rating/notes update.
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
    }

    tx.commit().await.map_err(ApiError::from)?;
    Ok(item)
}

/// Called from progress.rs/tvtime.rs, inside the same transaction as a "vu"
/// toggle, to keep a library entry's status roughly in sync with actual
/// viewing: watching a movie completes it, watching an episode starts a
/// series, finishing every episode completes it.
///
/// Creates the library entry if none exists yet (status = `target`,
/// logging a `LibraryAdd` history entry the same way a manual add does) —
/// viewing activity is now itself enough to bring a title into the library,
/// rather than requiring an explicit add first. If an entry already exists,
/// this never lowers its rank: unwatching something, or watching a stray
/// episode of an already dropped/completed show, must not silently undo a
/// manual status change. Only an explicit manual edit (`save_library_item`)
/// can move an existing status back down.
pub(crate) async fn auto_sync_status_impl(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    pool: &SqlitePool,
    profile_id: &str,
    target: LibraryStatus,
    now: &str,
    media: &AutoSyncMedia,
) -> Result<(), ApiError> {
    let current: Option<LibraryRow> = sqlx::query_as(
        "SELECT * FROM library_items WHERE profile_id = $1 AND media_id = $2 AND media_type = $3 LIMIT 1",
    )
    .bind(profile_id)
    .bind(media.media_id)
    .bind(media.media_type.as_db_str())
    .fetch_optional(&mut **tx)
    .await
    .map_err(ApiError::from)?;

    let Some(row) = current else {
        let is_currently_watching = target == LibraryStatus::Watching;
        let started_at = is_currently_watching.then(|| now.to_string());
        let completed_at = (target == LibraryStatus::Completed).then(|| now.to_string());
        let uuid = new_uuid();

        sqlx::query(
            "INSERT INTO library_items (
              uuid, profile_id, media_id, media_type, title, poster_path, backdrop_path, year, rating, genres,
              status, favourite, user_rating, notes, tags, started_at, completed_at, rewatch_count, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,NULL,NULL,$12,$13,$14,0,$15,$15)",
        )
        .bind(&uuid)
        .bind(profile_id)
        .bind(media.media_id)
        .bind(media.media_type.as_db_str())
        .bind(&media.title)
        .bind(&media.poster_path)
        .bind(&media.backdrop_path)
        .bind(media.year)
        .bind(media.rating)
        .bind(serde_json::to_string(&media.genres).unwrap())
        .bind(target.as_db_str())
        .bind("[]")
        .bind(&started_at)
        .bind(&completed_at)
        .bind(now)
        .execute(&mut **tx)
        .await
        .map_err(ApiError::from)?;

        let history_item = ViewingHistoryItem {
            id: new_uuid(),
            media_id: media.media_id,
            media_type: media.media_type,
            title: media.title.clone(),
            action: HistoryAction::LibraryAdd,
            timestamp: now.to_string(),
            season_number: None,
            episode_number: None,
            episode_title: None,
            metadata: Some(json!({ "profileId": profile_id })),
        };
        add_history_item_impl(&mut **tx, pool, history_item).await?;
        return Ok(());
    };

    let current_status = LibraryStatus::from_db_str(&row.status)?;
    if auto_sync_rank(target) <= auto_sync_rank(current_status) {
        return Ok(());
    }

    let completed_at = if target == LibraryStatus::Completed {
        Some(now.to_string())
    } else {
        row.completed_at
    };
    sqlx::query(
        "UPDATE library_items SET status = $1, completed_at = $2, updated_at = $3 WHERE uuid = $4",
    )
    .bind(target.as_db_str())
    .bind(&completed_at)
    .bind(now)
    .bind(&row.uuid)
    .execute(&mut **tx)
    .await
    .map_err(ApiError::from)?;
    Ok(())
}

pub(super) async fn remove_impl(
    pool: &SqlitePool,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
) -> Result<(), ApiError> {
    let existing = get_impl(pool, profile_id, media_id, media_type).await?;

    let mut tx = pool.begin().await.map_err(ApiError::from)?;

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
            metadata: Some(json!({ "profileId": profile_id })),
        };
        add_history_item_impl(&mut *tx, pool, history_item).await?;
    }

    tx.commit().await.map_err(ApiError::from)?;
    Ok(())
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
    let mut tx = pool.begin().await.map_err(ApiError::from)?;
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

    sqlx::query("DELETE FROM library_items WHERE uuid = $1")
        .bind(&row.uuid)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;

    let timestamp = now_iso(&mut *tx).await?;
    let history_item = ViewingHistoryItem {
        id: new_uuid(),
        media_id,
        media_type,
        title: row.title,
        action: HistoryAction::LibraryRemove,
        timestamp,
        season_number: None,
        episode_number: None,
        episode_title: None,
        metadata: Some(json!({ "profileId": profile_id })),
    };
    add_history_item_impl(&mut *tx, pool, history_item).await?;

    tx.commit().await.map_err(ApiError::from)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::history::list_history_impl;
    use sqlx::sqlite::SqlitePoolOptions;
    use tauri::Manager;

    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(4)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database::migrations::run_migrations(&pool)
            .await
            .unwrap();
        pool
    }

    fn media(id: i64) -> MediaSummaryInput {
        MediaSummaryInput {
            id,
            media_type: MediaType::Movie,
            title: "Test Movie".to_string(),
            poster_path: None,
            backdrop_path: None,
            year: Some(2024),
            rating: Some(7.5),
            genres: vec!["Drama".to_string()],
        }
    }

    #[test]
    fn as_db_str_maps_every_status_variant_to_its_db_string() {
        assert_eq!(LibraryStatus::Planned.as_db_str(), "planned");
        assert_eq!(LibraryStatus::Watching.as_db_str(), "watching");
        assert_eq!(LibraryStatus::Paused.as_db_str(), "paused");
        assert_eq!(LibraryStatus::Completed.as_db_str(), "completed");
        assert_eq!(LibraryStatus::Dropped.as_db_str(), "dropped");
    }

    // Exercises deserialize_double_option through real serde deserialization
    // (every other test in this file builds LibraryPatch as a struct literal,
    // bypassing serde entirely) to confirm it preserves the distinction the
    // struct's doc comment promises: an absent key stays None, while an
    // explicit `null` becomes Some(None) rather than being collapsed into
    // the absent case.
    #[test]
    fn library_patch_deserialization_distinguishes_absent_null_and_present_for_double_option_fields()
     {
        let absent: LibraryPatch = serde_json::from_str("{}").unwrap();
        assert_eq!(absent.user_rating, None);
        assert_eq!(absent.notes, None);

        let explicit_null: LibraryPatch =
            serde_json::from_str(r#"{"userRating": null, "notes": null}"#).unwrap();
        assert_eq!(explicit_null.user_rating, Some(None));
        assert_eq!(explicit_null.notes, Some(None));

        let explicit_value: LibraryPatch =
            serde_json::from_str(r#"{"userRating": 8.5, "notes": "Great movie"}"#).unwrap();
        assert_eq!(explicit_value.user_rating, Some(Some(8.5)));
        assert_eq!(explicit_value.notes, Some(Some("Great movie".to_string())));
    }

    #[tokio::test]
    async fn list_impl_returns_only_requested_profile_items_in_deterministic_newest_first_order() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at)
             VALUES ('other', 'Other', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        upsert_impl(&pool, media(1), LibraryPatch::default(), "default")
            .await
            .unwrap();
        upsert_impl(&pool, media(2), LibraryPatch::default(), "default")
            .await
            .unwrap();
        upsert_impl(&pool, media(3), LibraryPatch::default(), "other")
            .await
            .unwrap();

        // Force the two rows from the requested profile onto the exact same
        // timestamp. `updated_at DESC` alone does not define an order for a
        // tie, which made this test (and the production listing) dependent on
        // SQLite's incidental row order on fast CI runners. The query's
        // media_id/media_type tie-breakers must make this deterministic.
        sqlx::query(
            "UPDATE library_items
             SET updated_at = '2026-02-01T00:00:00.000Z'
             WHERE profile_id = 'default'",
        )
        .execute(&pool)
        .await
        .unwrap();

        let items = list_impl(&pool, "default", None).await.unwrap();

        assert_eq!(items.len(), 2);
        assert!(items.iter().all(|item| item.profile_id == "default"));
        // Equal timestamps are broken by media_id DESC (then media_type DESC
        // for the theoretical same-id/different-type case).
        assert_eq!(items[0].media_id, 2);
        assert_eq!(items[1].media_id, 1);
    }

    async fn set_updated_at(pool: &SqlitePool, media_id: i64, updated_at: &str) {
        sqlx::query("UPDATE library_items SET updated_at = $1 WHERE media_id = $2")
            .bind(updated_at)
            .bind(media_id)
            .execute(pool)
            .await
            .unwrap();
    }

    fn media_titled(id: i64, title: &str, rating: Option<f64>) -> MediaSummaryInput {
        MediaSummaryInput {
            id,
            media_type: MediaType::Movie,
            title: title.to_string(),
            poster_path: None,
            backdrop_path: None,
            year: Some(2024),
            rating,
            genres: vec!["Drama".to_string()],
        }
    }

    fn page_params(sort: LibrarySort, cursor: Option<String>, limit: i64) -> LibraryListParams {
        LibraryListParams {
            media_type: None,
            status: None,
            favourites_only: false,
            search: None,
            sort,
            cursor,
            limit,
        }
    }

    // Every optional field on LibraryListParams (media_type, status, search,
    // cursor) must deserialize to None when the frontend simply omits the
    // key rather than sending it as an explicit `null` — TS callers only set
    // the filters actually in use. `serde`'s derive gives Option<T> fields
    // this behavior automatically without a `#[serde(default)]` attribute,
    // but that's an easy thing for a future field addition to get wrong.
    #[test]
    fn library_list_params_treats_omitted_optional_keys_as_none() {
        let params: LibraryListParams =
            serde_json::from_str(r#"{"sort":"recent","limit":20}"#).unwrap();
        assert_eq!(params.media_type, None);
        assert_eq!(params.status, None);
        assert!(!params.favourites_only);
        assert_eq!(params.search, None);
        assert_eq!(params.cursor, None);
        assert_eq!(params.sort, LibrarySort::Recent);
        assert_eq!(params.limit, 20);
    }

    #[tokio::test]
    async fn list_page_impl_paginates_recent_sorted_items_across_pages_via_the_cursor() {
        let pool = migrated_pool().await;
        upsert_impl(&pool, media(1), LibraryPatch::default(), "default")
            .await
            .unwrap();
        upsert_impl(&pool, media(2), LibraryPatch::default(), "default")
            .await
            .unwrap();
        upsert_impl(&pool, media(3), LibraryPatch::default(), "default")
            .await
            .unwrap();
        set_updated_at(&pool, 1, "2026-01-01T00:00:00.000Z").await;
        set_updated_at(&pool, 2, "2026-01-02T00:00:00.000Z").await;
        set_updated_at(&pool, 3, "2026-01-03T00:00:00.000Z").await;

        let first_page =
            list_page_impl(&pool, "default", page_params(LibrarySort::Recent, None, 2))
                .await
                .unwrap();
        assert_eq!(
            first_page
                .items
                .iter()
                .map(|i| i.media_id)
                .collect::<Vec<_>>(),
            vec![3, 2]
        );
        assert!(first_page.next_cursor.is_some());

        let second_page = list_page_impl(
            &pool,
            "default",
            page_params(LibrarySort::Recent, first_page.next_cursor, 2),
        )
        .await
        .unwrap();
        assert_eq!(
            second_page
                .items
                .iter()
                .map(|i| i.media_id)
                .collect::<Vec<_>>(),
            vec![1]
        );
        assert!(second_page.next_cursor.is_none());
    }

    #[tokio::test]
    async fn list_page_impl_only_returns_the_requested_profiles_items() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at)
             VALUES ('other', 'Other', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();
        upsert_impl(&pool, media(1), LibraryPatch::default(), "default")
            .await
            .unwrap();
        upsert_impl(&pool, media(2), LibraryPatch::default(), "other")
            .await
            .unwrap();

        let page = list_page_impl(&pool, "default", page_params(LibrarySort::Recent, None, 10))
            .await
            .unwrap();
        assert_eq!(page.items.len(), 1);
        assert_eq!(page.items[0].profile_id, "default");
    }

    #[tokio::test]
    async fn list_page_impl_applies_type_status_favourite_and_search_filters_together() {
        let pool = migrated_pool().await;
        upsert_impl(
            &pool,
            media(1),
            LibraryPatch {
                status: Some(LibraryStatus::Watching),
                favourite: Some(true),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
        upsert_impl(
            &pool,
            media(2),
            LibraryPatch {
                status: Some(LibraryStatus::Watching),
                favourite: Some(false),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
        upsert_impl(
            &pool,
            media(3),
            LibraryPatch {
                status: Some(LibraryStatus::Completed),
                favourite: Some(true),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
        upsert_impl(
            &pool,
            MediaSummaryInput {
                media_type: MediaType::Series,
                ..media(4)
            },
            LibraryPatch {
                status: Some(LibraryStatus::Watching),
                favourite: Some(true),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();

        let params = LibraryListParams {
            media_type: Some(MediaType::Movie),
            status: Some(LibraryStatus::Watching),
            favourites_only: true,
            search: Some("test".to_string()),
            sort: LibrarySort::Recent,
            cursor: None,
            limit: 10,
        };
        let page = list_page_impl(&pool, "default", params).await.unwrap();

        assert_eq!(page.items.len(), 1);
        assert_eq!(page.items[0].media_id, 1);
    }

    #[tokio::test]
    async fn list_page_impl_sorts_by_title_ascending_with_cursor_continuation() {
        let pool = migrated_pool().await;
        upsert_impl(
            &pool,
            media_titled(1, "Charlie", None),
            LibraryPatch::default(),
            "default",
        )
        .await
        .unwrap();
        upsert_impl(
            &pool,
            media_titled(2, "Alpha", None),
            LibraryPatch::default(),
            "default",
        )
        .await
        .unwrap();
        upsert_impl(
            &pool,
            media_titled(3, "Bravo", None),
            LibraryPatch::default(),
            "default",
        )
        .await
        .unwrap();

        let mut cursor = None;
        let mut seen = Vec::new();
        loop {
            let page = list_page_impl(&pool, "default", page_params(LibrarySort::Title, cursor, 1))
                .await
                .unwrap();
            seen.extend(page.items.iter().map(|i| i.title.clone()));
            cursor = page.next_cursor;
            if cursor.is_none() {
                break;
            }
        }
        assert_eq!(seen, vec!["Alpha", "Bravo", "Charlie"]);
    }

    #[tokio::test]
    async fn list_page_impl_sorts_by_effective_rating_with_unrated_items_last() {
        let pool = migrated_pool().await;
        // Personal rating wins over the TMDB copy when both are present.
        upsert_impl(
            &pool,
            media_titled(1, "TmdbOnly", Some(9.0)),
            LibraryPatch::default(),
            "default",
        )
        .await
        .unwrap();
        upsert_impl(
            &pool,
            media_titled(2, "PersonalRating", Some(5.0)),
            LibraryPatch {
                user_rating: Some(Some(7.0)),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
        upsert_impl(
            &pool,
            media_titled(3, "Unrated", None),
            LibraryPatch::default(),
            "default",
        )
        .await
        .unwrap();

        let mut cursor = None;
        let mut seen = Vec::new();
        loop {
            let page = list_page_impl(
                &pool,
                "default",
                page_params(LibrarySort::Rating, cursor, 1),
            )
            .await
            .unwrap();
            seen.extend(page.items.iter().map(|i| i.media_id));
            cursor = page.next_cursor;
            if cursor.is_none() {
                break;
            }
        }
        assert_eq!(seen, vec![1, 2, 3]);
    }

    #[tokio::test]
    async fn list_page_impl_rejects_a_cursor_encoded_for_a_different_sort() {
        let pool = migrated_pool().await;
        upsert_impl(&pool, media(1), LibraryPatch::default(), "default")
            .await
            .unwrap();
        upsert_impl(&pool, media(2), LibraryPatch::default(), "default")
            .await
            .unwrap();

        let recent_page =
            list_page_impl(&pool, "default", page_params(LibrarySort::Recent, None, 1))
                .await
                .unwrap();
        let recent_cursor = recent_page.next_cursor.expect("a second row exists");

        let result = list_page_impl(
            &pool,
            "default",
            page_params(LibrarySort::Title, Some(recent_cursor), 1),
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn creates_a_new_entry_defaulting_to_the_planned_status() {
        let pool = migrated_pool().await;

        let item = upsert_impl(&pool, media(7), LibraryPatch::default(), "default")
            .await
            .unwrap();
        assert_eq!(item.status, LibraryStatus::Planned);
        assert!(!item.favourite);

        let fetched = get_impl(&pool, "default", 7, MediaType::Movie)
            .await
            .unwrap();
        assert_eq!(fetched.unwrap().media_id, 7);
    }

    #[tokio::test]
    async fn a_freshly_created_items_returned_id_matches_the_persisted_row() {
        let pool = migrated_pool().await;

        let item = upsert_impl(&pool, media(7), LibraryPatch::default(), "default")
            .await
            .unwrap();
        let fetched = get_impl(&pool, "default", 7, MediaType::Movie)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(item.id, fetched.id);
    }

    #[tokio::test]
    async fn sets_completed_at_when_the_status_transitions_to_completed() {
        let pool = migrated_pool().await;
        upsert_impl(&pool, media(7), LibraryPatch::default(), "default")
            .await
            .unwrap();

        let patch = LibraryPatch {
            status: Some(LibraryStatus::Completed),
            ..Default::default()
        };
        let updated = upsert_impl(&pool, media(7), patch, "default")
            .await
            .unwrap();

        assert_eq!(updated.status, LibraryStatus::Completed);
        assert!(updated.completed_at.is_some());
    }

    #[tokio::test]
    async fn clears_completed_at_when_the_status_moves_away_from_completed() {
        let pool = migrated_pool().await;
        upsert_impl(
            &pool,
            media(7),
            LibraryPatch {
                status: Some(LibraryStatus::Completed),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();

        let updated = upsert_impl(
            &pool,
            media(7),
            LibraryPatch {
                status: Some(LibraryStatus::Watching),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();

        assert_eq!(updated.completed_at, None);
    }

    #[tokio::test]
    async fn preserves_user_fields_across_updates_that_omit_them() {
        let pool = migrated_pool().await;
        let first_patch = LibraryPatch {
            user_rating: Some(Some(8.0)),
            tags: Some(vec!["favourite-director".to_string()]),
            ..Default::default()
        };
        upsert_impl(&pool, media(7), first_patch, "default")
            .await
            .unwrap();

        let second_patch = LibraryPatch {
            status: Some(LibraryStatus::Watching),
            ..Default::default()
        };
        let updated = upsert_impl(&pool, media(7), second_patch, "default")
            .await
            .unwrap();

        assert_eq!(updated.user_rating, Some(8.0));
        assert_eq!(updated.tags, vec!["favourite-director".to_string()]);
    }

    #[tokio::test]
    async fn an_explicit_null_clears_user_rating_and_notes() {
        let pool = migrated_pool().await;
        let first_patch = LibraryPatch {
            user_rating: Some(Some(8.0)),
            notes: Some(Some("Great".to_string())),
            ..Default::default()
        };
        upsert_impl(&pool, media(7), first_patch, "default")
            .await
            .unwrap();

        let clearing_patch = LibraryPatch {
            user_rating: Some(None),
            notes: Some(None),
            ..Default::default()
        };
        let updated = upsert_impl(&pool, media(7), clearing_patch, "default")
            .await
            .unwrap();

        assert_eq!(updated.user_rating, None);
        assert_eq!(updated.notes, None);
    }

    #[tokio::test]
    async fn removes_an_entry() {
        let pool = migrated_pool().await;
        upsert_impl(&pool, media(7), LibraryPatch::default(), "default")
            .await
            .unwrap();

        remove_impl(&pool, "default", 7, MediaType::Movie)
            .await
            .unwrap();

        assert!(
            get_impl(&pool, "default", 7, MediaType::Movie)
                .await
                .unwrap()
                .is_none()
        );
    }

    #[tokio::test]
    async fn has_impl_reports_presence() {
        let pool = migrated_pool().await;
        assert!(
            !has_impl(&pool, "default", 7, MediaType::Movie)
                .await
                .unwrap()
        );

        upsert_impl(&pool, media(7), LibraryPatch::default(), "default")
            .await
            .unwrap();

        assert!(
            has_impl(&pool, "default", 7, MediaType::Movie)
                .await
                .unwrap()
        );
    }

    #[tokio::test]
    async fn records_a_history_entry_only_the_first_time_an_item_is_created() {
        let pool = migrated_pool().await;

        upsert_impl(&pool, media(7), LibraryPatch::default(), "default")
            .await
            .unwrap();
        let updated_patch = LibraryPatch {
            status: Some(LibraryStatus::Watching),
            ..Default::default()
        };
        upsert_impl(&pool, media(7), updated_patch, "default")
            .await
            .unwrap();

        let history = list_history_impl(&pool, 50, None).await.unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].action, HistoryAction::LibraryAdd);
    }

    #[tokio::test]
    async fn removes_an_item_and_records_a_removal_history_entry() {
        let pool = migrated_pool().await;
        upsert_impl(&pool, media(7), LibraryPatch::default(), "default")
            .await
            .unwrap();

        remove_impl(&pool, "default", 7, MediaType::Movie)
            .await
            .unwrap();

        let history = list_history_impl(&pool, 50, None).await.unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].action, HistoryAction::LibraryRemove);
    }

    #[tokio::test]
    async fn does_not_record_a_removal_history_entry_when_the_item_was_never_present() {
        let pool = migrated_pool().await;

        remove_impl(&pool, "default", 404, MediaType::Movie)
            .await
            .unwrap();

        assert!(list_history_impl(&pool, 50, None).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn remove_if_planned_removes_and_logs_when_status_is_still_planned() {
        let pool = migrated_pool().await;
        upsert_impl(&pool, media(7), LibraryPatch::default(), "default")
            .await
            .unwrap();

        let removed = remove_if_planned_impl(&pool, "default", 7, MediaType::Movie)
            .await
            .unwrap();

        assert!(removed);
        assert!(
            get_impl(&pool, "default", 7, MediaType::Movie)
                .await
                .unwrap()
                .is_none()
        );
        let history = list_history_impl(&pool, 50, None).await.unwrap();
        assert_eq!(history[0].action, HistoryAction::LibraryRemove);
    }

    #[tokio::test]
    async fn remove_if_planned_is_a_no_op_once_the_item_has_real_progress() {
        let pool = migrated_pool().await;
        let patch = LibraryPatch {
            status: Some(LibraryStatus::Watching),
            ..Default::default()
        };
        upsert_impl(&pool, media(7), patch, "default")
            .await
            .unwrap();

        let removed = remove_if_planned_impl(&pool, "default", 7, MediaType::Movie)
            .await
            .unwrap();

        assert!(!removed);
        let still_there = get_impl(&pool, "default", 7, MediaType::Movie)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(still_there.status, LibraryStatus::Watching);
    }

    #[tokio::test]
    async fn remove_if_planned_is_a_no_op_when_the_item_does_not_exist() {
        let pool = migrated_pool().await;

        let removed = remove_if_planned_impl(&pool, "default", 404, MediaType::Movie)
            .await
            .unwrap();

        assert!(!removed);
    }

    fn auto_sync_media(media_id: i64, media_type: MediaType) -> AutoSyncMedia {
        AutoSyncMedia {
            media_id,
            media_type,
            title: "Auto-synced Title".to_string(),
            poster_path: None,
            backdrop_path: None,
            year: Some(2021),
            rating: Some(8.2),
            genres: vec!["Sci-Fi".to_string()],
        }
    }

    #[tokio::test]
    async fn auto_sync_creates_an_entry_with_the_target_status_when_none_exists() {
        let pool = migrated_pool().await;
        let mut tx = pool.begin().await.unwrap();

        auto_sync_status_impl(
            &mut tx,
            &pool,
            "default",
            LibraryStatus::Completed,
            "2026-01-01T00:00:00.000Z",
            &auto_sync_media(42, MediaType::Movie),
        )
        .await
        .unwrap();
        tx.commit().await.unwrap();

        let item = get_impl(&pool, "default", 42, MediaType::Movie)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(item.status, LibraryStatus::Completed);
        assert_eq!(item.title, "Auto-synced Title");
        assert_eq!(
            item.completed_at.as_deref(),
            Some("2026-01-01T00:00:00.000Z")
        );

        let history = list_history_impl(&pool, 50, None).await.unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].action, HistoryAction::LibraryAdd);
    }

    #[tokio::test]
    async fn auto_sync_create_path_sets_started_at_for_a_watching_target() {
        let pool = migrated_pool().await;
        let mut tx = pool.begin().await.unwrap();

        auto_sync_status_impl(
            &mut tx,
            &pool,
            "default",
            LibraryStatus::Watching,
            "2026-01-01T00:00:00.000Z",
            &auto_sync_media(43, MediaType::Series),
        )
        .await
        .unwrap();
        tx.commit().await.unwrap();

        let item = get_impl(&pool, "default", 43, MediaType::Series)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(item.status, LibraryStatus::Watching);
        assert_eq!(item.started_at.as_deref(), Some("2026-01-01T00:00:00.000Z"));
        assert_eq!(item.completed_at, None);
    }

    #[tokio::test]
    async fn auto_sync_does_not_recreate_or_relog_once_an_entry_exists() {
        let pool = migrated_pool().await;
        let mut tx = pool.begin().await.unwrap();
        auto_sync_status_impl(
            &mut tx,
            &pool,
            "default",
            LibraryStatus::Watching,
            "2026-01-01T00:00:00.000Z",
            &auto_sync_media(44, MediaType::Movie),
        )
        .await
        .unwrap();
        tx.commit().await.unwrap();

        // Same target again (idempotent) — must not touch the row or log again.
        let mut tx = pool.begin().await.unwrap();
        auto_sync_status_impl(
            &mut tx,
            &pool,
            "default",
            LibraryStatus::Watching,
            "2026-01-01T00:00:01.000Z",
            &auto_sync_media(44, MediaType::Movie),
        )
        .await
        .unwrap();
        tx.commit().await.unwrap();

        let history = list_history_impl(&pool, 50, None).await.unwrap();
        assert_eq!(history.len(), 1);
    }

    // --- tauri::command wrapper coverage -----------------------------
    //
    // These wrappers just resolve the active profile and delegate to an
    // already-tested `_impl` function, so these are thin happy-path checks
    // that the wrapper wiring itself (tauri::State extraction, profile
    // resolution, `patch.unwrap_or_default()`) works — not a re-test of the
    // underlying business logic.

    #[tokio::test]
    async fn save_library_item_command_with_some_patch_applies_it() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let patch = LibraryPatch {
            status: Some(LibraryStatus::Watching),
            ..Default::default()
        };
        let item = save_library_item(media(7), Some(patch), state)
            .await
            .unwrap();

        assert_eq!(item.status, LibraryStatus::Watching);
        assert!(item.started_at.is_some());
    }

    #[tokio::test]
    async fn save_library_item_command_with_no_patch_defaults_to_planned() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let item = save_library_item(media(7), None, state).await.unwrap();

        assert_eq!(item.status, LibraryStatus::Planned);
        assert!(!item.favourite);
    }

    #[tokio::test]
    async fn list_library_command_returns_a_saved_item() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        save_library_item(media(7), None, state.clone())
            .await
            .unwrap();

        let items = list_library(None, state).await.unwrap();
        assert!(items.iter().any(|item| item.media_id == 7));
    }

    #[tokio::test]
    async fn remove_library_item_command_deletes_the_item() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        save_library_item(media(7), None, state.clone())
            .await
            .unwrap();

        remove_library_item(7, MediaType::Movie, state.clone())
            .await
            .unwrap();

        assert!(
            get_library_item(7, MediaType::Movie, state)
                .await
                .unwrap()
                .is_none()
        );
    }

    async fn set_completed_at(pool: &SqlitePool, media_id: i64, completed_at: &str) {
        sqlx::query("UPDATE library_items SET completed_at = $1 WHERE media_id = $2")
            .bind(completed_at)
            .bind(media_id)
            .execute(pool)
            .await
            .unwrap();
    }

    fn key(media_id: i64, media_type: MediaType) -> LibraryMediaKey {
        LibraryMediaKey {
            media_id,
            media_type,
        }
    }

    #[tokio::test]
    async fn list_media_keys_impl_returns_only_the_requested_profiles_keys() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at)
             VALUES ('other', 'Other', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();
        upsert_impl(&pool, media(1), LibraryPatch::default(), "default")
            .await
            .unwrap();
        upsert_impl(&pool, media(2), LibraryPatch::default(), "other")
            .await
            .unwrap();

        let keys = list_media_keys_impl(&pool, "default").await.unwrap();

        assert_eq!(keys.len(), 1);
        assert_eq!(keys[0].media_id, 1);
        assert_eq!(keys[0].media_type, MediaType::Movie);
    }

    #[tokio::test]
    async fn get_items_by_keys_impl_returns_only_the_specific_keys_requested() {
        let pool = migrated_pool().await;
        upsert_impl(&pool, media(1), LibraryPatch::default(), "default")
            .await
            .unwrap();
        upsert_impl(&pool, media(2), LibraryPatch::default(), "default")
            .await
            .unwrap();
        upsert_impl(&pool, media(3), LibraryPatch::default(), "default")
            .await
            .unwrap();

        let items = get_items_by_keys_impl(
            &pool,
            "default",
            &[key(1, MediaType::Movie), key(3, MediaType::Movie)],
        )
        .await
        .unwrap();

        let mut ids: Vec<i64> = items.iter().map(|item| item.media_id).collect();
        ids.sort();
        assert_eq!(ids, vec![1, 3]);
    }

    #[tokio::test]
    async fn get_items_by_keys_impl_returns_empty_for_an_empty_key_list() {
        let pool = migrated_pool().await;
        upsert_impl(&pool, media(1), LibraryPatch::default(), "default")
            .await
            .unwrap();

        let items = get_items_by_keys_impl(&pool, "default", &[]).await.unwrap();

        assert!(items.is_empty());
    }

    #[tokio::test]
    async fn list_status_counts_impl_tallies_each_status_for_the_requested_profile_only() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at)
             VALUES ('other', 'Other', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();
        upsert_impl(
            &pool,
            media(1),
            LibraryPatch {
                status: Some(LibraryStatus::Planned),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
        upsert_impl(
            &pool,
            media(2),
            LibraryPatch {
                status: Some(LibraryStatus::Planned),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
        upsert_impl(
            &pool,
            media(3),
            LibraryPatch {
                status: Some(LibraryStatus::Completed),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
        upsert_impl(
            &pool,
            media(4),
            LibraryPatch {
                status: Some(LibraryStatus::Planned),
                ..Default::default()
            },
            "other",
        )
        .await
        .unwrap();

        let counts = list_status_counts_impl(&pool, "default").await.unwrap();

        assert_eq!(counts.planned, 2);
        assert_eq!(counts.completed, 1);
        assert_eq!(counts.watching, 0);
        assert_eq!(counts.paused, 0);
        assert_eq!(counts.dropped, 0);
    }

    #[tokio::test]
    async fn list_planned_candidates_impl_returns_only_planned_items_of_the_requested_type_newest_first()
     {
        let pool = migrated_pool().await;
        upsert_impl(
            &pool,
            media(1),
            LibraryPatch {
                status: Some(LibraryStatus::Planned),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
        upsert_impl(
            &pool,
            media(2),
            LibraryPatch {
                status: Some(LibraryStatus::Planned),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
        // Not planned — must be excluded.
        upsert_impl(
            &pool,
            media(3),
            LibraryPatch {
                status: Some(LibraryStatus::Watching),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
        set_updated_at(&pool, 1, "2026-01-01T00:00:00.000Z").await;
        set_updated_at(&pool, 2, "2026-01-02T00:00:00.000Z").await;

        let candidates = list_planned_candidates_impl(&pool, "default", MediaType::Movie, 10)
            .await
            .unwrap();

        assert_eq!(
            candidates.iter().map(|i| i.media_id).collect::<Vec<_>>(),
            vec![2, 1]
        );
    }

    #[tokio::test]
    async fn list_completed_candidates_impl_orders_by_completed_at_descending_and_respects_the_media_type_filter()
     {
        let pool = migrated_pool().await;
        upsert_impl(
            &pool,
            media(1),
            LibraryPatch {
                status: Some(LibraryStatus::Completed),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
        upsert_impl(
            &pool,
            media(2),
            LibraryPatch {
                status: Some(LibraryStatus::Completed),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
        set_completed_at(&pool, 1, "2026-01-01T00:00:00.000Z").await;
        set_completed_at(&pool, 2, "2026-02-01T00:00:00.000Z").await;

        let candidates =
            list_completed_candidates_impl(&pool, "default", Some(MediaType::Movie), 10)
                .await
                .unwrap();

        assert_eq!(
            candidates.iter().map(|i| i.media_id).collect::<Vec<_>>(),
            vec![2, 1]
        );
    }

    #[tokio::test]
    async fn get_best_recommendation_seed_impl_prefers_a_rated_completed_title_over_a_favourite() {
        let pool = migrated_pool().await;
        upsert_impl(
            &pool,
            media(1),
            LibraryPatch {
                favourite: Some(true),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
        upsert_impl(
            &pool,
            media(2),
            LibraryPatch {
                status: Some(LibraryStatus::Completed),
                user_rating: Some(Some(9.0)),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();

        let seed = get_best_recommendation_seed_impl(&pool, "default")
            .await
            .unwrap();

        assert_eq!(seed.map(|item| item.media_id), Some(2));
    }

    #[tokio::test]
    async fn get_best_recommendation_seed_impl_breaks_a_rating_tie_by_the_most_recently_completed()
    {
        let pool = migrated_pool().await;
        upsert_impl(
            &pool,
            media(1),
            LibraryPatch {
                status: Some(LibraryStatus::Completed),
                user_rating: Some(Some(8.0)),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
        upsert_impl(
            &pool,
            media(2),
            LibraryPatch {
                status: Some(LibraryStatus::Completed),
                user_rating: Some(Some(8.0)),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
        set_completed_at(&pool, 1, "2026-01-01T00:00:00.000Z").await;
        set_completed_at(&pool, 2, "2026-06-01T00:00:00.000Z").await;

        let seed = get_best_recommendation_seed_impl(&pool, "default")
            .await
            .unwrap();

        assert_eq!(seed.map(|item| item.media_id), Some(2));
    }

    #[tokio::test]
    async fn get_best_recommendation_seed_impl_prefers_the_most_recently_updated_favourite() {
        let pool = migrated_pool().await;
        upsert_impl(
            &pool,
            media(1),
            LibraryPatch {
                favourite: Some(true),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
        upsert_impl(
            &pool,
            media(2),
            LibraryPatch {
                favourite: Some(true),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
        set_updated_at(&pool, 1, "2026-01-01T00:00:00.000Z").await;
        set_updated_at(&pool, 2, "2026-06-01T00:00:00.000Z").await;

        let seed = get_best_recommendation_seed_impl(&pool, "default")
            .await
            .unwrap();

        assert_eq!(seed.map(|item| item.media_id), Some(2));
    }

    #[tokio::test]
    async fn get_best_recommendation_seed_impl_falls_back_through_every_tier_to_a_watching_item() {
        let pool = migrated_pool().await;
        upsert_impl(
            &pool,
            media(1),
            LibraryPatch {
                status: Some(LibraryStatus::Watching),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();

        let seed = get_best_recommendation_seed_impl(&pool, "default")
            .await
            .unwrap();

        assert_eq!(seed.map(|item| item.media_id), Some(1));
    }

    #[tokio::test]
    async fn get_best_recommendation_seed_impl_returns_none_when_nothing_matches_any_tier() {
        let pool = migrated_pool().await;
        upsert_impl(
            &pool,
            media(1),
            LibraryPatch {
                status: Some(LibraryStatus::Planned),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();

        let seed = get_best_recommendation_seed_impl(&pool, "default")
            .await
            .unwrap();

        assert!(seed.is_none());
    }

    #[tokio::test]
    async fn list_ids_matching_filters_impl_applies_every_filter_dimension_together() {
        let pool = migrated_pool().await;
        // Matches every filter below.
        upsert_impl(
            &pool,
            MediaSummaryInput {
                genres: vec!["Sci-Fi".to_string()],
                ..media_titled(1, "Match", Some(8.0))
            },
            LibraryPatch {
                status: Some(LibraryStatus::Completed),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
        // Wrong genre.
        upsert_impl(
            &pool,
            MediaSummaryInput {
                genres: vec!["Comedy".to_string()],
                ..media_titled(2, "Wrong genre", Some(8.0))
            },
            LibraryPatch {
                status: Some(LibraryStatus::Completed),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
        // Rating too low.
        upsert_impl(
            &pool,
            MediaSummaryInput {
                genres: vec!["Sci-Fi".to_string()],
                ..media_titled(3, "Too low rated", Some(2.0))
            },
            LibraryPatch {
                status: Some(LibraryStatus::Completed),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();
        // Wrong status.
        upsert_impl(
            &pool,
            MediaSummaryInput {
                genres: vec!["Sci-Fi".to_string()],
                ..media_titled(4, "Wrong status", Some(8.0))
            },
            LibraryPatch {
                status: Some(LibraryStatus::Planned),
                ..Default::default()
            },
            "default",
        )
        .await
        .unwrap();

        let ids = list_ids_matching_filters_impl(
            &pool,
            "default",
            LibraryFilterParams {
                media_type: Some(MediaType::Movie),
                status: Some(LibraryStatus::Completed),
                genre: Some("Sci-Fi".to_string()),
                min_rating: Some(5.0),
            },
        )
        .await
        .unwrap();

        assert_eq!(ids.len(), 1);
        assert_eq!(ids[0].media_id, 1);
    }

    #[tokio::test]
    async fn list_ids_matching_filters_impl_returns_every_profile_item_when_no_filter_is_set() {
        let pool = migrated_pool().await;
        upsert_impl(&pool, media(1), LibraryPatch::default(), "default")
            .await
            .unwrap();
        upsert_impl(&pool, media(2), LibraryPatch::default(), "default")
            .await
            .unwrap();

        let ids = list_ids_matching_filters_impl(&pool, "default", LibraryFilterParams::default())
            .await
            .unwrap();

        assert_eq!(ids.len(), 2);
    }
}
