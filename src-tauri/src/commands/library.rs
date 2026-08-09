use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use sqlx::SqlitePool;
use tauri::State;

use crate::commands::macros::profile_scoped_command;
use crate::database::{current_profile_id, new_uuid, now_iso};
use crate::error::ApiError;
use crate::models::MediaType;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LibraryStatus {
    Planned,
    Watching,
    Paused,
    Completed,
    Dropped,
    Rewatching,
}

impl LibraryStatus {
    pub(crate) fn as_db_str(self) -> &'static str {
        match self {
            LibraryStatus::Planned => "planned",
            LibraryStatus::Watching => "watching",
            LibraryStatus::Paused => "paused",
            LibraryStatus::Completed => "completed",
            LibraryStatus::Dropped => "dropped",
            LibraryStatus::Rewatching => "rewatching",
        }
    }

    fn from_db_str(value: &str) -> Result<Self, ApiError> {
        serde_json::from_value(Value::String(value.to_string()))
            .map_err(|_| ApiError::internal(format!("Unknown library status in database: {value}")))
    }
}

/// A patch coming over `invoke()`, where every field is optional. `favourite`,
/// `status`, `tags` and `rewatchCount` treat both "key absent" and "key
/// present but null" as "not provided" (matching the TS `??` fallback) — a
/// plain `Option<T>` already collapses both cases to `None`, which is what we
/// want. `userRating`/`notes` instead distinguish an explicit `null` (clear
/// the value) from an absent key (keep the current value) — the TS code
/// checks `!== undefined` specifically — so those two need the classic serde
/// "double option" trick via `deserialize_double_option` below.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPatch {
    pub status: Option<LibraryStatus>,
    pub favourite: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub user_rating: Option<Option<f64>>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub notes: Option<Option<String>>,
    pub tags: Option<Vec<String>>,
    pub rewatch_count: Option<i64>,
}

fn deserialize_double_option<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Ok(Some(Option::deserialize(deserializer)?))
}

/// Only the fields `save_library_item` actually reads off the frontend's
/// full `MediaSummary` object — unknown fields (overview, cast, ...) are
/// silently ignored by serde, matching how the TS code only destructures
/// these too.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSummaryInput {
    pub id: i64,
    pub media_type: MediaType,
    pub title: String,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub year: Option<i64>,
    pub rating: Option<f64>,
    pub genres: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
    pub id: String,
    pub profile_id: String,
    pub media_id: i64,
    pub media_type: MediaType,
    pub title: String,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub year: Option<i64>,
    pub rating: Option<f64>,
    pub genres: Vec<String>,
    pub status: LibraryStatus,
    pub favourite: bool,
    pub user_rating: Option<f64>,
    pub notes: Option<String>,
    pub tags: Vec<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub rewatch_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(sqlx::FromRow)]
pub(crate) struct LibraryRow {
    pub(crate) uuid: String,
    pub(crate) profile_id: String,
    pub(crate) media_id: i64,
    pub(crate) media_type: String,
    pub(crate) title: String,
    pub(crate) poster_path: Option<String>,
    pub(crate) backdrop_path: Option<String>,
    pub(crate) year: Option<i64>,
    pub(crate) rating: Option<f64>,
    pub(crate) genres: String,
    pub(crate) status: String,
    pub(crate) favourite: bool,
    pub(crate) user_rating: Option<f64>,
    pub(crate) notes: Option<String>,
    pub(crate) tags: String,
    pub(crate) started_at: Option<String>,
    pub(crate) completed_at: Option<String>,
    pub(crate) rewatch_count: i64,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

impl TryFrom<LibraryRow> for LibraryItem {
    type Error = ApiError;

    fn try_from(row: LibraryRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.uuid,
            profile_id: row.profile_id,
            media_id: row.media_id,
            media_type: MediaType::from_db_str(&row.media_type),
            title: row.title,
            poster_path: row.poster_path,
            backdrop_path: row.backdrop_path,
            year: row.year,
            rating: row.rating,
            genres: serde_json::from_str(&row.genres).map_err(|e| ApiError::internal(e.to_string()))?,
            status: LibraryStatus::from_db_str(&row.status)?,
            favourite: row.favourite,
            user_rating: row.user_rating,
            notes: row.notes,
            tags: serde_json::from_str(&row.tags).map_err(|e| ApiError::internal(e.to_string()))?,
            started_at: row.started_at,
            completed_at: row.completed_at,
            rewatch_count: row.rewatch_count,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }
}

async fn list_impl(pool: &SqlitePool, profile_id: &str) -> Result<Vec<LibraryItem>, ApiError> {
    let rows: Vec<LibraryRow> =
        sqlx::query_as("SELECT * FROM library_items WHERE profile_id = $1 ORDER BY updated_at DESC")
            .bind(profile_id)
            .fetch_all(pool)
            .await
            .map_err(ApiError::from)?;
    rows.into_iter().map(LibraryItem::try_from).collect()
}

async fn get_impl(
    pool: &SqlitePool,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
) -> Result<Option<LibraryItem>, ApiError> {
    let row: Option<LibraryRow> = sqlx::query_as(
        "SELECT * FROM library_items WHERE profile_id = $1 AND media_id = $2 AND media_type = $3 LIMIT 1",
    )
    .bind(profile_id)
    .bind(media_id)
    .bind(media_type.as_db_str())
    .fetch_optional(pool)
    .await
    .map_err(ApiError::from)?;
    row.map(LibraryItem::try_from).transpose()
}

async fn upsert_impl(
    pool: &SqlitePool,
    media: MediaSummaryInput,
    patch: LibraryPatch,
    profile_id: &str,
) -> Result<LibraryItem, ApiError> {
    let current = get_impl(pool, profile_id, media.id, media.media_type).await?;
    let now = now_iso(pool).await?;
    let status = patch.status.unwrap_or_else(|| current.as_ref().map_or(LibraryStatus::Planned, |c| c.status));

    let is_currently_watching = matches!(status, LibraryStatus::Watching | LibraryStatus::Rewatching);
    let started_at = current
        .as_ref()
        .and_then(|c| c.started_at.clone())
        .or_else(|| is_currently_watching.then(|| now.clone()));
    let completed_at = if status == LibraryStatus::Completed {
        Some(current.as_ref().and_then(|c| c.completed_at.clone()).unwrap_or_else(|| now.clone()))
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
        favourite: patch.favourite.unwrap_or_else(|| current.as_ref().is_some_and(|c| c.favourite)),
        user_rating: match patch.user_rating {
            Some(explicit) => explicit,
            None => current.as_ref().and_then(|c| c.user_rating),
        },
        notes: match patch.notes {
            Some(explicit) => explicit,
            None => current.as_ref().and_then(|c| c.notes.clone()),
        },
        tags: patch.tags.unwrap_or_else(|| current.as_ref().map_or_else(Vec::new, |c| c.tags.clone())),
        started_at,
        completed_at,
        rewatch_count: patch.rewatch_count.unwrap_or_else(|| current.as_ref().map_or(0, |c| c.rewatch_count)),
        created_at: current.as_ref().map_or_else(|| now.clone(), |c| c.created_at.clone()),
        updated_at: now,
    };

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
    .execute(pool)
    .await
    .map_err(ApiError::from)?;

    Ok(item)
}

/// Rank used only to decide whether an automatic status sync (see
/// `auto_sync_status_impl`) is allowed to move a library item forward.
/// Watching/paused/dropped all count as "started" — none of them should be
/// clobbered by a stray episode toggle — while completed/rewatching both
/// count as "finished".
fn auto_sync_rank(status: LibraryStatus) -> u8 {
    match status {
        LibraryStatus::Planned => 0,
        LibraryStatus::Watching | LibraryStatus::Paused | LibraryStatus::Dropped => 1,
        LibraryStatus::Completed | LibraryStatus::Rewatching => 2,
    }
}

/// Called from progress.rs, inside the same transaction as a "vu" toggle,
/// to keep an *existing* library entry's status roughly in sync with
/// actual viewing: watching a movie completes it, watching an episode
/// starts a series, finishing every episode completes it.
///
/// Deliberately never creates a library entry — adding something to the
/// library stays a separate, explicit action — and never lowers the rank:
/// unwatching something, or watching a stray episode of an already
/// dropped/completed show, must not silently undo a manual status change.
/// Only an explicit manual edit (`save_library_item`) can move a status
/// back down.
pub(crate) async fn auto_sync_status_impl(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
    target: LibraryStatus,
    now: &str,
) -> Result<(), ApiError> {
    let current: Option<LibraryRow> = sqlx::query_as(
        "SELECT * FROM library_items WHERE profile_id = $1 AND media_id = $2 AND media_type = $3 LIMIT 1",
    )
    .bind(profile_id)
    .bind(media_id)
    .bind(media_type.as_db_str())
    .fetch_optional(&mut **tx)
    .await
    .map_err(ApiError::from)?;

    let Some(row) = current else { return Ok(()) };
    let current_status = LibraryStatus::from_db_str(&row.status)?;
    if auto_sync_rank(target) <= auto_sync_rank(current_status) {
        return Ok(());
    }

    let completed_at = if target == LibraryStatus::Completed { Some(now.to_string()) } else { row.completed_at };
    sqlx::query("UPDATE library_items SET status = $1, completed_at = $2, updated_at = $3 WHERE uuid = $4")
        .bind(target.as_db_str())
        .bind(&completed_at)
        .bind(now)
        .bind(&row.uuid)
        .execute(&mut **tx)
        .await
        .map_err(ApiError::from)?;
    Ok(())
}

async fn remove_impl(pool: &SqlitePool, profile_id: &str, media_id: i64, media_type: MediaType) -> Result<(), ApiError> {
    sqlx::query("DELETE FROM library_items WHERE profile_id = $1 AND media_id = $2 AND media_type = $3")
        .bind(profile_id)
        .bind(media_id)
        .bind(media_type.as_db_str())
        .execute(pool)
        .await
        .map_err(ApiError::from)?;
    Ok(())
}

profile_scoped_command! {
    pub async fn list_library() -> Vec<LibraryItem> => list_impl
}

profile_scoped_command! {
    pub async fn get_library_item(media_id: i64, media_type: MediaType) -> Option<LibraryItem> => get_impl
}

#[tauri::command]
pub async fn save_library_item(
    media: MediaSummaryInput,
    patch: Option<LibraryPatch>,
    pool: State<'_, SqlitePool>,
) -> Result<LibraryItem, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    upsert_impl(&pool, media, patch.unwrap_or_default(), &profile_id).await
}

profile_scoped_command! {
    pub async fn remove_library_item(media_id: i64, media_type: MediaType) -> () => remove_impl
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(4).connect("sqlite::memory:").await.unwrap();
        crate::database::migrations::run_migrations(&pool).await.unwrap();
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

    #[tokio::test]
    async fn creates_a_new_entry_defaulting_to_the_planned_status() {
        let pool = migrated_pool().await;

        let item = upsert_impl(&pool, media(7), LibraryPatch::default(), "default").await.unwrap();
        assert_eq!(item.status, LibraryStatus::Planned);
        assert!(!item.favourite);

        let fetched = get_impl(&pool, "default", 7, MediaType::Movie).await.unwrap();
        assert_eq!(fetched.unwrap().media_id, 7);
    }

    #[tokio::test]
    async fn a_freshly_created_items_returned_id_matches_the_persisted_row() {
        let pool = migrated_pool().await;

        let item = upsert_impl(&pool, media(7), LibraryPatch::default(), "default").await.unwrap();
        let fetched = get_impl(&pool, "default", 7, MediaType::Movie).await.unwrap().unwrap();
        assert_eq!(item.id, fetched.id);
    }

    #[tokio::test]
    async fn sets_completed_at_when_the_status_transitions_to_completed() {
        let pool = migrated_pool().await;
        upsert_impl(&pool, media(7), LibraryPatch::default(), "default").await.unwrap();

        let patch = LibraryPatch {
            status: Some(LibraryStatus::Completed),
            ..Default::default()
        };
        let updated = upsert_impl(&pool, media(7), patch, "default").await.unwrap();

        assert_eq!(updated.status, LibraryStatus::Completed);
        assert!(updated.completed_at.is_some());
    }

    #[tokio::test]
    async fn clears_completed_at_when_the_status_moves_away_from_completed() {
        let pool = migrated_pool().await;
        upsert_impl(
            &pool,
            media(7),
            LibraryPatch { status: Some(LibraryStatus::Completed), ..Default::default() },
            "default",
        )
        .await
        .unwrap();

        let updated = upsert_impl(
            &pool,
            media(7),
            LibraryPatch { status: Some(LibraryStatus::Watching), ..Default::default() },
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
        upsert_impl(&pool, media(7), first_patch, "default").await.unwrap();

        let second_patch = LibraryPatch { status: Some(LibraryStatus::Watching), ..Default::default() };
        let updated = upsert_impl(&pool, media(7), second_patch, "default").await.unwrap();

        assert_eq!(updated.user_rating, Some(8.0));
        assert_eq!(updated.tags, vec!["favourite-director".to_string()]);
    }

    #[tokio::test]
    async fn an_explicit_null_clears_user_rating_and_notes() {
        let pool = migrated_pool().await;
        let first_patch =
            LibraryPatch { user_rating: Some(Some(8.0)), notes: Some(Some("Great".to_string())), ..Default::default() };
        upsert_impl(&pool, media(7), first_patch, "default").await.unwrap();

        let clearing_patch = LibraryPatch { user_rating: Some(None), notes: Some(None), ..Default::default() };
        let updated = upsert_impl(&pool, media(7), clearing_patch, "default").await.unwrap();

        assert_eq!(updated.user_rating, None);
        assert_eq!(updated.notes, None);
    }

    #[tokio::test]
    async fn removes_an_entry() {
        let pool = migrated_pool().await;
        upsert_impl(&pool, media(7), LibraryPatch::default(), "default").await.unwrap();

        remove_impl(&pool, "default", 7, MediaType::Movie).await.unwrap();

        assert!(get_impl(&pool, "default", 7, MediaType::Movie).await.unwrap().is_none());
    }
}
