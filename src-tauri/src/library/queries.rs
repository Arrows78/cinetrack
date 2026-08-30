use sqlx::{QueryBuilder, Sqlite, SqlitePool};

use super::domain::LibraryStatus;
use super::models::{
    LibraryCursorPayload, LibraryFilterParams, LibraryItem, LibraryListParams, LibraryMediaKey,
    LibraryPage, LibraryRow, LibrarySort, LibraryStatusCounts,
};
use crate::error::ApiError;
use crate::models::MediaType;

/// A defensive backstop against pathological growth (a corrupted DB, a
/// runaway import loop), not a real pagination contract. `list_impl` itself
/// is now a narrower-purpose full read than it once was: recommendation
/// rails, smart-list evaluation, and stats/tracking aggregates have their
/// own targeted commands below (`list_media_keys_impl`,
/// `list_planned_candidates_impl`, `list_completed_candidates_impl`,
/// `get_best_recommendation_seed_impl`, `list_ids_matching_filters_impl`,
/// `get_items_by_keys_impl`) instead of scanning the whole table. `list_impl`
/// remains the fallback full read for LibraryExplorer modes that need it,
/// while the locked /movies and /series "My list" tabs pass a media-type
/// scope so they only transfer the complete movie or series set needed for
/// client-side watch-progress bucketing. This limit must stay comfortably
/// above any realistic single-profile library size rather than being tuned
/// down for performance. `stats::performance`'s
/// own benchmark seeds up to 50_000 library items and expects a full,
/// untruncated read at that scale (see `benchmark.rs`'s `validate_iteration`)
/// — this constant must stay above that ceiling, and the query above stays
/// backed by `idx_library_profile_updated` (see `query_plans.rs`) so a full
/// read at this scale is still index-driven, not a table scan.
const LIST_SAFETY_LIMIT: i64 = 200_000;
const PAGE_MIN_LIMIT: i64 = 1;
const PAGE_MAX_LIMIT: i64 = 200;
const CANDIDATE_MIN_LIMIT: i64 = 1;
const CANDIDATE_MAX_LIMIT: i64 = 100;
/// A batch-by-keys caller always has a small, bounded set in hand already
/// (a TMDB collection's parts, one custom list's items) — this only guards
/// against a pathological caller turning this into an unbounded `OR` chain.
const MAX_BATCH_KEYS: usize = 500;

pub(super) async fn list_impl(
    pool: &SqlitePool,
    profile_id: &str,
    media_type: Option<MediaType>,
) -> Result<Vec<LibraryItem>, ApiError> {
    let mut qb: QueryBuilder<Sqlite> =
        QueryBuilder::new("SELECT * FROM library_items WHERE profile_id = ");
    qb.push_bind(profile_id.to_string());

    if let Some(media_type) = media_type {
        qb.push(" AND media_type = ")
            .push_bind(media_type.as_db_str());
    }

    qb.push(" ORDER BY updated_at DESC, media_id DESC, media_type DESC LIMIT ")
        .push_bind(LIST_SAFETY_LIMIT);

    let rows: Vec<LibraryRow> = qb
        .build_query_as()
        .fetch_all(pool)
        .await
        .map_err(ApiError::from)?;
    rows.into_iter().map(LibraryItem::try_from).collect()
}

/// Cursor-paginated, server-filtered/sorted counterpart to `list_impl`. Used
/// by the Library page's own infinite-scroll grid/list, which is the one
/// consumer that actually renders an unbounded, scrollable view of the whole
/// library. The locked /movies and /series hubs use `list_impl` with a media
/// type scope; custom/smart-list intersections can still use its full fallback
/// when they genuinely need the complete profile set.
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
        // A leading `%` means this can never use a B-tree index on `title`
        // the way a prefix search (`title LIKE 'foo%'`) could — confirmed by
        // `stats::performance`'s own benchmark, where every other
        // `list_library_page` case stays sub-millisecond at 50k rows but
        // this one's latency grows with `library_items` (see
        // docs/performance.md). Not switched to FTS5 preemptively: revisit
        // if this ever shows up as a real user-facing delay rather than a
        // benchmark number.
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

/// A membership set only (no rows) — for callers that just need "which of
/// my TMDB search/discover results am I already tracking" (a rail's
/// exclude-if-owned filter, a calendar entry's mine-vs-discovery flip),
/// never the full row.
pub(super) async fn list_media_keys_impl(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<Vec<LibraryMediaKey>, ApiError> {
    let rows: Vec<(i64, String)> = sqlx::query_as(
        "SELECT media_id, media_type FROM library_items WHERE profile_id = $1 LIMIT $2",
    )
    .bind(profile_id)
    .bind(LIST_SAFETY_LIMIT)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;
    Ok(rows
        .into_iter()
        .map(|(media_id, media_type)| LibraryMediaKey {
            media_id,
            media_type: MediaType::from_db_str(&media_type),
        })
        .collect())
}

/// Batch counterpart to `get_impl` — a caller-bounded set of specific
/// `(media_id, media_type)` pairs (a collection's parts, one custom list's
/// items), not "give me everything."
pub(super) async fn get_items_by_keys_impl(
    pool: &SqlitePool,
    profile_id: &str,
    keys: &[LibraryMediaKey],
) -> Result<Vec<LibraryItem>, ApiError> {
    if keys.is_empty() {
        return Ok(Vec::new());
    }
    let keys = &keys[..keys.len().min(MAX_BATCH_KEYS)];

    let mut qb: QueryBuilder<Sqlite> =
        QueryBuilder::new("SELECT * FROM library_items WHERE profile_id = ");
    qb.push_bind(profile_id.to_string());
    qb.push(" AND (");
    for (index, key) in keys.iter().enumerate() {
        if index > 0 {
            qb.push(" OR ");
        }
        qb.push("(media_id = ")
            .push_bind(key.media_id)
            .push(" AND media_type = ")
            .push_bind(key.media_type.as_db_str())
            .push(")");
    }
    qb.push(")");

    let rows: Vec<LibraryRow> = qb
        .build_query_as()
        .fetch_all(pool)
        .await
        .map_err(ApiError::from)?;
    rows.into_iter().map(LibraryItem::try_from).collect()
}

/// One round-trip status breakdown, replacing a full library read reduced
/// to a count in JS (e.g. the Home page's "planned" rail counter).
pub(super) async fn list_status_counts_impl(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<LibraryStatusCounts, ApiError> {
    let rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT status, COUNT(*) FROM library_items WHERE profile_id = $1 GROUP BY status",
    )
    .bind(profile_id)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    let mut counts = LibraryStatusCounts {
        planned: 0,
        watching: 0,
        paused: 0,
        completed: 0,
        dropped: 0,
    };
    for (status, count) in rows {
        match LibraryStatus::from_db_str(&status)? {
            LibraryStatus::Planned => counts.planned = count,
            LibraryStatus::Watching => counts.watching = count,
            LibraryStatus::Paused => counts.paused = count,
            LibraryStatus::Completed => counts.completed = count,
            LibraryStatus::Dropped => counts.dropped = count,
        }
    }
    Ok(counts)
}

/// Up to `limit` most-recently-touched planned items of one media type —
/// Watch Tonight's candidate pool, instead of filtering the whole library
/// in JS for a `status = 'planned'` slice.
pub(super) async fn list_planned_candidates_impl(
    pool: &SqlitePool,
    profile_id: &str,
    media_type: MediaType,
    limit: i64,
) -> Result<Vec<LibraryItem>, ApiError> {
    let limit = limit.clamp(CANDIDATE_MIN_LIMIT, CANDIDATE_MAX_LIMIT);
    let rows: Vec<LibraryRow> = sqlx::query_as(
        "SELECT * FROM library_items
         WHERE profile_id = $1 AND media_type = $2 AND status = 'planned'
         ORDER BY updated_at DESC, media_id DESC
         LIMIT $3",
    )
    .bind(profile_id)
    .bind(media_type.as_db_str())
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;
    rows.into_iter().map(LibraryItem::try_from).collect()
}

/// Up to `limit` most-recently-completed items (optionally of one media
/// type) — the "people you watch most" rail's candidate pool, instead of
/// filtering the whole library in JS for a `status = 'completed'` slice
/// sorted by `completedAt`.
pub(super) async fn list_completed_candidates_impl(
    pool: &SqlitePool,
    profile_id: &str,
    media_type: Option<MediaType>,
    limit: i64,
) -> Result<Vec<LibraryItem>, ApiError> {
    let limit = limit.clamp(CANDIDATE_MIN_LIMIT, CANDIDATE_MAX_LIMIT);
    let mut qb: QueryBuilder<Sqlite> =
        QueryBuilder::new("SELECT * FROM library_items WHERE profile_id = ");
    qb.push_bind(profile_id.to_string());
    qb.push(" AND status = 'completed'");
    if let Some(media_type) = media_type {
        qb.push(" AND media_type = ")
            .push_bind(media_type.as_db_str());
    }
    qb.push(" ORDER BY completed_at DESC, media_id DESC LIMIT ")
        .push_bind(limit);

    let rows: Vec<LibraryRow> = qb
        .build_query_as()
        .fetch_all(pool)
        .await
        .map_err(ApiError::from)?;
    rows.into_iter().map(LibraryItem::try_from).collect()
}

/// The "because you liked" rail's single seed item, as a 4-tier priority
/// waterfall run server-side instead of a full-library JS reduction:
/// (1) a rated completed title, highest-rated first; (2) a favourite,
/// most-recently-touched first; (3) any completed title, most recent
/// first; (4) whatever's currently being watched, most recent first.
/// Short-circuits on the first tier that returns a row.
pub(super) async fn get_best_recommendation_seed_impl(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<Option<LibraryItem>, ApiError> {
    const TIERS: [&str; 4] = [
        "SELECT * FROM library_items WHERE profile_id = $1 AND status = 'completed' AND user_rating IS NOT NULL \
         ORDER BY user_rating DESC, completed_at DESC LIMIT 1",
        "SELECT * FROM library_items WHERE profile_id = $1 AND favourite = 1 ORDER BY updated_at DESC LIMIT 1",
        "SELECT * FROM library_items WHERE profile_id = $1 AND status = 'completed' ORDER BY completed_at DESC LIMIT 1",
        "SELECT * FROM library_items WHERE profile_id = $1 AND status = 'watching' ORDER BY updated_at DESC LIMIT 1",
    ];
    for tier_sql in TIERS {
        let row: Option<LibraryRow> = sqlx::query_as(tier_sql)
            .bind(profile_id)
            .fetch_optional(pool)
            .await
            .map_err(ApiError::from)?;
        if let Some(row) = row {
            return Ok(Some(LibraryItem::try_from(row)?));
        }
    }
    Ok(None)
}

/// Ids matching a narrow set of purely-relational `library_items` filters —
/// never a full rule DSL. See `LibraryFilterParams`'s own doc comment for
/// why this stays this narrow: a caller with a richer rule set (e.g. a
/// SmartList's provider/episode-waiting/runtime rules) applies those as a
/// client-side post-filter over this command's already-smaller candidate
/// set instead of Rust ever inspecting that rule shape.
pub(super) async fn list_ids_matching_filters_impl(
    pool: &SqlitePool,
    profile_id: &str,
    filters: LibraryFilterParams,
) -> Result<Vec<LibraryMediaKey>, ApiError> {
    let mut qb: QueryBuilder<Sqlite> =
        QueryBuilder::new("SELECT media_id, media_type FROM library_items WHERE profile_id = ");
    qb.push_bind(profile_id.to_string());

    if let Some(media_type) = filters.media_type {
        qb.push(" AND media_type = ")
            .push_bind(media_type.as_db_str());
    }
    if let Some(status) = filters.status {
        qb.push(" AND status = ").push_bind(status.as_db_str());
    }
    if let Some(genre) = filters
        .genre
        .as_deref()
        .map(str::trim)
        .filter(|g| !g.is_empty())
    {
        // genres is a JSON-serialized string array (no relational genres
        // table) — a quoted substring match so e.g. "Sci-Fi" doesn't match
        // a longer genre name that merely contains it.
        qb.push(" AND genres LIKE ")
            .push_bind(format!("%\"{genre}\"%"));
    }
    if let Some(min_rating) = filters.min_rating {
        qb.push(" AND COALESCE(user_rating, rating, -1.0) >= ")
            .push_bind(min_rating);
    }
    qb.push(" LIMIT ").push_bind(LIST_SAFETY_LIMIT);

    let rows: Vec<(i64, String)> = qb
        .build_query_as()
        .fetch_all(pool)
        .await
        .map_err(ApiError::from)?;
    Ok(rows
        .into_iter()
        .map(|(media_id, media_type)| LibraryMediaKey {
            media_id,
            media_type: MediaType::from_db_str(&media_type),
        })
        .collect())
}
