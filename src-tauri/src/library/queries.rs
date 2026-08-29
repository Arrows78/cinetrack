use sqlx::{QueryBuilder, Sqlite, SqlitePool};

use super::models::{
    LibraryCursorPayload, LibraryItem, LibraryListParams, LibraryPage, LibraryRow, LibrarySort,
};
use crate::error::ApiError;
use crate::models::MediaType;

/// A defensive backstop against pathological growth (a corrupted DB, a
/// runaway import loop), not a real pagination contract — every caller of
/// `list_impl` (recommendation rails, smart list evaluation, custom lists,
/// the /movies and /series "My list" bucketing, stats/tracking aggregates)
/// needs the *whole* profile-scoped set for correctness, not a preview, so
/// this must stay comfortably above any realistic single-profile library
/// size rather than being tuned down for performance. `stats::performance`'s
/// own benchmark seeds up to 50_000 library items and expects a full,
/// untruncated read at that scale (see `benchmark.rs`'s `validate_iteration`)
/// — this constant must stay above that ceiling, and the query above stays
/// backed by `idx_library_profile_updated` (see `query_plans.rs`) so a full
/// read at this scale is still index-driven, not a table scan.
const LIST_SAFETY_LIMIT: i64 = 200_000;
const PAGE_MIN_LIMIT: i64 = 1;
const PAGE_MAX_LIMIT: i64 = 200;

pub(super) async fn list_impl(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<Vec<LibraryItem>, ApiError> {
    let rows: Vec<LibraryRow> = sqlx::query_as(
        "SELECT * FROM library_items
         WHERE profile_id = $1
         ORDER BY updated_at DESC, media_id DESC, media_type DESC
         LIMIT $2",
    )
    .bind(profile_id)
    .bind(LIST_SAFETY_LIMIT)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;
    rows.into_iter().map(LibraryItem::try_from).collect()
}

/// Cursor-paginated, server-filtered/sorted counterpart to `list_impl`. Used
/// by the Library page's own infinite-scroll grid/list, which is the one
/// consumer that actually renders an unbounded, scrollable view of the whole
/// library — every other `useLibrary()` caller (recommendation rails, smart
/// lists, the /movies and /series "My list" tabs' own bucketing) does a
/// bounded aggregate over the whole set and stays on `list_impl`'s existing
/// `LIST_SAFETY_LIMIT`-capped full array, unchanged.
///
/// Keyset (not OFFSET) pagination: the cursor encodes the sort column's
/// value plus the `(media_id, media_type)` tiebreaker from the last row of
/// the previous page, so paging stays correct — and index-backed — even as
/// rows are inserted/updated between page fetches. Fetches `limit + 1` rows
/// to know whether a next page exists without a separate COUNT query.
pub(super) async fn list_page_impl(
    pool: &SqlitePool,
    profile_id: &str,
    params: LibraryListParams,
) -> Result<LibraryPage, ApiError> {
    let limit = params.limit.clamp(PAGE_MIN_LIMIT, PAGE_MAX_LIMIT);
    let cursor = params
        .cursor
        .as_deref()
        .map(|raw| LibraryCursorPayload::decode(raw, params.sort))
        .transpose()?;

    let mut qb: QueryBuilder<Sqlite> =
        QueryBuilder::new("SELECT * FROM library_items WHERE profile_id = ");
    qb.push_bind(profile_id.to_string());

    if let Some(media_type) = params.media_type {
        qb.push(" AND media_type = ")
            .push_bind(media_type.as_db_str());
    }
    if let Some(status) = params.status {
        qb.push(" AND status = ").push_bind(status.as_db_str());
    }
    if params.favourites_only {
        qb.push(" AND favourite = 1");
    }
    if let Some(search) = params
        .search
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        qb.push(" AND title LIKE ")
            .push_bind(format!("%{search}%"))
            .push(" COLLATE NOCASE");
    }

    match (params.sort, &cursor) {
        (
            LibrarySort::Recent,
            Some(LibraryCursorPayload::Recent {
                updated_at,
                media_id,
                media_type,
            }),
        ) => {
            qb.push(" AND (updated_at, media_id, media_type) < (")
                .push_bind(updated_at.clone())
                .push(", ")
                .push_bind(*media_id)
                .push(", ")
                .push_bind(media_type.clone())
                .push(")");
        }
        (
            LibrarySort::Title,
            Some(LibraryCursorPayload::Title {
                title,
                media_id,
                media_type,
            }),
        ) => {
            qb.push(" AND (title, media_id, media_type) > (")
                .push_bind(title.clone())
                .push(", ")
                .push_bind(*media_id)
                .push(", ")
                .push_bind(media_type.clone())
                .push(")");
        }
        (
            LibrarySort::Rating,
            Some(LibraryCursorPayload::Rating {
                rating,
                media_id,
                media_type,
            }),
        ) => {
            qb.push(" AND (COALESCE(user_rating, rating, -1.0), media_id, media_type) < (")
                .push_bind(*rating)
                .push(", ")
                .push_bind(*media_id)
                .push(", ")
                .push_bind(media_type.clone())
                .push(")");
        }
        (_, None) => {}
        // Guarded against by LibraryCursorPayload::decode's tag check above —
        // a mismatched (sort, cursor variant) pair never reaches this match.
        (_, Some(_)) => unreachable!("cursor variant already validated against the requested sort"),
    }

    match params.sort {
        LibrarySort::Recent => qb.push(" ORDER BY updated_at DESC, media_id DESC, media_type DESC"),
        LibrarySort::Title => qb.push(" ORDER BY title ASC, media_id ASC, media_type ASC"),
        LibrarySort::Rating => qb.push(
            " ORDER BY COALESCE(user_rating, rating, -1.0) DESC, media_id DESC, media_type DESC",
        ),
    };
    qb.push(" LIMIT ").push_bind(limit + 1);

    let mut rows: Vec<LibraryRow> = qb
        .build_query_as()
        .fetch_all(pool)
        .await
        .map_err(ApiError::from)?;

    let has_more = rows.len() as i64 > limit;
    if has_more {
        rows.truncate(limit as usize);
    }

    let next_cursor = if has_more {
        rows.last()
            .map(|row| -> Result<String, ApiError> {
                let payload = match params.sort {
                    LibrarySort::Recent => LibraryCursorPayload::Recent {
                        updated_at: row.updated_at.clone(),
                        media_id: row.media_id,
                        media_type: row.media_type.clone(),
                    },
                    LibrarySort::Title => LibraryCursorPayload::Title {
                        title: row.title.clone(),
                        media_id: row.media_id,
                        media_type: row.media_type.clone(),
                    },
                    LibrarySort::Rating => LibraryCursorPayload::Rating {
                        rating: row.user_rating.or(row.rating).unwrap_or(-1.0),
                        media_id: row.media_id,
                        media_type: row.media_type.clone(),
                    },
                };
                payload.encode()
            })
            .transpose()?
    } else {
        None
    };

    let items = rows
        .into_iter()
        .map(LibraryItem::try_from)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(LibraryPage { items, next_cursor })
}

pub(super) async fn get_impl(
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

pub(super) async fn has_impl(
    pool: &SqlitePool,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
) -> Result<bool, ApiError> {
    let row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM library_items WHERE profile_id = $1 AND media_id = $2 AND media_type = $3",
    )
    .bind(profile_id)
    .bind(media_id)
    .bind(media_type.as_db_str())
    .fetch_one(pool)
    .await
    .map_err(ApiError::from)?;
    Ok(row.0 > 0)
}
