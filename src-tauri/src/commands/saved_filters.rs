use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::SqlitePool;
use tauri::State;

use crate::commands::macros::profile_scoped_command;
use crate::database::{current_profile_id, new_uuid, now_iso};
use crate::error::ApiError;

/// A saved filter is a named snapshot of one page's own filter-control
/// state — LibraryExplorer's type/status/favourites/list/sort/search, or
/// SearchPage's scope/genre/provider — captured verbatim so reopening it is
/// just "set that page's filter state to this JSON blob," entirely
/// client-side (there is no evaluation logic here, unlike smart lists: a
/// saved filter never gets re-run against the library, it only rehydrates
/// the page's own React state). `filters` is deliberately an opaque
/// `serde_json::Value` for the same reason smart_lists' `rules` is: nothing
/// in Rust ever inspects its fields, so keeping the shape untyped here means
/// the two sides can't drift out of a shared enum, at the cost of only
/// shallow validation (must be a JSON object, see `validate_filters`).
///
/// `page` distinguishes which page a row belongs to, since the two pages'
/// filter shapes are unrelated — a Library-saved filter must never show up
/// in Search's own saved-filters list or vice versa.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedFilter {
    pub id: String,
    pub profile_id: String,
    pub page: String,
    pub name: String,
    pub filters: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(sqlx::FromRow)]
pub(crate) struct SavedFilterRow {
    uuid: String,
    profile_id: String,
    page: String,
    name: String,
    filters: String,
    created_at: String,
    updated_at: String,
}

impl TryFrom<SavedFilterRow> for SavedFilter {
    type Error = ApiError;

    fn try_from(row: SavedFilterRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.uuid,
            profile_id: row.profile_id,
            page: row.page,
            name: row.name,
            filters: serde_json::from_str(&row.filters)
                .map_err(|e| ApiError::internal(format!("Corrupt saved filter: {e}")))?,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }
}

const MAX_NAME_LENGTH: usize = 100;
// Generous but bounded: every real filter-state object (a handful of scalar
// fields per page) serializes to well under a kilobyte — this only guards
// against a caller sending something pathological, not a real usage limit.
const MAX_FILTERS_JSON_LENGTH: usize = 10_000;
// The only two pages that currently expose saved filters. Kept as a single
// source of truth here (rather than re-typing the two literals in every
// validation/query call) so a third page added later only has to change
// this list.
const VALID_PAGES: &[&str] = &["library", "search"];

fn validate_name(name: &str) -> Result<String, ApiError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(ApiError::bad_request("The filter name is required."));
    }
    if trimmed.chars().count() > MAX_NAME_LENGTH {
        return Err(ApiError::bad_request(format!(
            "The filter name cannot exceed {MAX_NAME_LENGTH} characters."
        )));
    }
    Ok(trimmed.to_string())
}

fn validate_page(page: &str) -> Result<(), ApiError> {
    if VALID_PAGES.contains(&page) {
        Ok(())
    } else {
        Err(ApiError::bad_request(format!(
            "Unknown saved-filter page \"{page}\"."
        )))
    }
}

/// Only checks the filters value is a JSON object within a sane size — see
/// this module's doc comment for why deeper (per-field) validation
/// deliberately isn't Rust's job here.
fn validate_filters(filters: &Value) -> Result<String, ApiError> {
    if !filters.is_object() {
        return Err(ApiError::bad_request(
            "Saved filter state must be an object.",
        ));
    }
    let serialized =
        serde_json::to_string(filters).map_err(|e| ApiError::internal(e.to_string()))?;
    if serialized.len() > MAX_FILTERS_JSON_LENGTH {
        return Err(ApiError::bad_request("Saved filter state is too large."));
    }
    Ok(serialized)
}

async fn list_impl(
    pool: &SqlitePool,
    profile_id: &str,
    page: String,
) -> Result<Vec<SavedFilter>, ApiError> {
    validate_page(&page)?;
    let rows: Vec<SavedFilterRow> = sqlx::query_as(
        "SELECT * FROM saved_filters WHERE profile_id = $1 AND page = $2 ORDER BY updated_at DESC",
    )
    .bind(profile_id)
    .bind(&page)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;
    rows.into_iter().map(SavedFilter::try_from).collect()
}

async fn create_impl(
    pool: &SqlitePool,
    profile_id: &str,
    page: &str,
    name: &str,
    filters: Value,
) -> Result<SavedFilter, ApiError> {
    validate_page(page)?;
    let name = validate_name(name)?;
    let filters_json = validate_filters(&filters)?;

    let now = now_iso(pool).await?;
    let saved_filter = SavedFilter {
        id: new_uuid(),
        profile_id: profile_id.to_string(),
        page: page.to_string(),
        name,
        filters,
        created_at: now.clone(),
        updated_at: now,
    };

    sqlx::query(
        "INSERT INTO saved_filters (uuid, profile_id, page, name, filters, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    )
    .bind(&saved_filter.id)
    .bind(&saved_filter.profile_id)
    .bind(&saved_filter.page)
    .bind(&saved_filter.name)
    .bind(&filters_json)
    .bind(&saved_filter.created_at)
    .bind(&saved_filter.updated_at)
    .execute(pool)
    .await
    .map_err(ApiError::from)?;

    Ok(saved_filter)
}

/// `remove_saved_filter` takes a bare `saved_filter_id` from the frontend
/// with no other proof of ownership, so it must confirm the row belongs to
/// the caller's active profile before deleting it — same rule
/// custom_lists.rs's own `assert_owns_list` documents, otherwise a profile
/// that merely knows another profile's saved-filter UUID could delete it.
/// `not_found` (rather than a distinct "forbidden") avoids confirming to the
/// caller that a saved filter with that UUID exists at all under a
/// different profile.
async fn assert_owns_saved_filter(
    pool: &SqlitePool,
    profile_id: &str,
    saved_filter_id: &str,
) -> Result<(), ApiError> {
    let owned: Option<(i64,)> =
        sqlx::query_as("SELECT 1 FROM saved_filters WHERE uuid = $1 AND profile_id = $2")
            .bind(saved_filter_id)
            .bind(profile_id)
            .fetch_optional(pool)
            .await
            .map_err(ApiError::from)?;
    owned
        .map(|_| ())
        .ok_or_else(|| ApiError::not_found("Saved filter not found."))
}

async fn remove_impl(
    pool: &SqlitePool,
    profile_id: &str,
    saved_filter_id: &str,
) -> Result<(), ApiError> {
    assert_owns_saved_filter(pool, profile_id, saved_filter_id).await?;
    sqlx::query("DELETE FROM saved_filters WHERE uuid = $1")
        .bind(saved_filter_id)
        .execute(pool)
        .await
        .map_err(ApiError::from)?;
    Ok(())
}

profile_scoped_command! {
    pub async fn list_saved_filters(page: String) -> Vec<SavedFilter> => list_impl
}

#[tauri::command]
pub async fn create_saved_filter(
    page: String,
    name: String,
    filters: Value,
    pool: State<'_, SqlitePool>,
) -> Result<SavedFilter, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    create_impl(&pool, &profile_id, &page, &name, filters).await
}

#[tauri::command]
pub async fn remove_saved_filter(
    saved_filter_id: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    remove_impl(&pool, &profile_id, &saved_filter_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
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
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('other', 'Other', '2026-01-01', '2026-01-01')",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    #[tokio::test]
    async fn creates_and_lists_a_saved_filter_scoped_to_its_page() {
        let pool = migrated_pool().await;
        let saved = create_impl(
            &pool,
            "default",
            "library",
            "  Paused shows  ",
            json!({ "statusFilter": "paused" }),
        )
        .await
        .unwrap();
        assert_eq!(saved.name, "Paused shows");
        assert_eq!(saved.page, "library");

        let library_filters = list_impl(&pool, "default", "library".to_string())
            .await
            .unwrap();
        assert_eq!(library_filters.len(), 1);
        let search_filters = list_impl(&pool, "default", "search".to_string())
            .await
            .unwrap();
        assert_eq!(search_filters.len(), 0);
    }

    #[tokio::test]
    async fn rejects_an_unknown_page() {
        let pool = migrated_pool().await;
        assert!(
            create_impl(&pool, "default", "bogus", "Name", json!({}))
                .await
                .is_err()
        );
        assert!(
            list_impl(&pool, "default", "bogus".to_string())
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn rejects_a_whitespace_only_name() {
        let pool = migrated_pool().await;
        assert!(
            create_impl(&pool, "default", "library", "   ", json!({}))
                .await
                .is_err()
        );
        assert_eq!(
            list_impl(&pool, "default", "library".to_string())
                .await
                .unwrap()
                .len(),
            0
        );
    }

    #[tokio::test]
    async fn rejects_a_name_over_the_length_limit() {
        let pool = migrated_pool().await;
        let too_long = "a".repeat(MAX_NAME_LENGTH + 1);
        assert!(
            create_impl(&pool, "default", "library", &too_long, json!({}))
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn rejects_non_object_filter_state() {
        let pool = migrated_pool().await;
        assert!(
            create_impl(
                &pool,
                "default",
                "library",
                "Name",
                json!(["not", "an", "object"])
            )
            .await
            .is_err()
        );
    }

    #[tokio::test]
    async fn removes_a_saved_filter() {
        let pool = migrated_pool().await;
        let saved = create_impl(
            &pool,
            "default",
            "search",
            "Sci-fi",
            json!({ "genreSeries": "878" }),
        )
        .await
        .unwrap();

        remove_impl(&pool, "default", &saved.id).await.unwrap();

        assert_eq!(
            list_impl(&pool, "default", "search".to_string())
                .await
                .unwrap()
                .len(),
            0
        );
    }

    #[tokio::test]
    async fn a_profile_cannot_read_or_delete_another_profiles_saved_filter() {
        let pool = migrated_pool().await;
        let saved = create_impl(&pool, "default", "library", "Privé", json!({}))
            .await
            .unwrap();

        assert!(remove_impl(&pool, "other", &saved.id).await.is_err());
        assert_eq!(
            list_impl(&pool, "default", "library".to_string())
                .await
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            list_impl(&pool, "other", "library".to_string())
                .await
                .unwrap()
                .len(),
            0
        );
    }

    #[tokio::test]
    async fn create_saved_filter_command_creates_a_filter_for_the_active_profile() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let saved = create_saved_filter(
            "library".to_string(),
            "Ma vue".to_string(),
            json!({ "sort": "rating" }),
            state,
        )
        .await
        .unwrap();
        assert_eq!(saved.name, "Ma vue");
        assert_eq!(saved.profile_id, "default");
    }

    #[tokio::test]
    async fn list_saved_filters_command_returns_only_the_requested_pages_filters() {
        let pool = migrated_pool().await;
        create_impl(&pool, "default", "library", "Lib", json!({}))
            .await
            .unwrap();
        create_impl(&pool, "default", "search", "Search", json!({}))
            .await
            .unwrap();

        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();
        let results = list_saved_filters("search".to_string(), state)
            .await
            .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Search");
    }

    #[tokio::test]
    async fn remove_saved_filter_command_removes_the_callers_filter() {
        let pool = migrated_pool().await;
        let saved = create_impl(&pool, "default", "library", "À supprimer", json!({}))
            .await
            .unwrap();

        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();
        remove_saved_filter(saved.id.clone(), state).await.unwrap();

        assert_eq!(
            list_impl(&app.state::<SqlitePool>(), "default", "library".to_string())
                .await
                .unwrap()
                .len(),
            0
        );
    }
}
