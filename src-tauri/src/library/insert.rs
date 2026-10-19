//! The one `INSERT INTO library_items`: the editor's save (insert or update
//! in place) and the automatic creation from a watch both write a full
//! [`LibraryItem`] through [`insert_item`], so the column list and the
//! JSON-encoded columns are spelled once.

use sqlx::SqliteConnection;

use super::models::LibraryItem;
use crate::error::ApiError;

macro_rules! insert_statement {
    () => {
        "INSERT INTO library_items (
          uuid, profile_id, media_id, media_type, title, poster_path, backdrop_path, year, rating, genres,
          status, favourite, user_rating, notes, tags, started_at, completed_at, rewatch_count, created_at, updated_at,
          status_origin
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)"
    };
}

const INSERT_SQL: &str = insert_statement!();

const UPSERT_SQL: &str = concat!(
    insert_statement!(),
    "
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
          status_origin = excluded.status_origin"
);

/// What to do when the profile already holds the title.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum OnConflict {
    /// Fail on the unique key: the caller has just checked the title is absent.
    Fail,
    /// Update the row in place (keeping its uuid and `created_at`).
    Update,
}

pub(super) async fn insert_item(
    conn: &mut SqliteConnection,
    item: &LibraryItem,
    on_conflict: OnConflict,
) -> Result<(), ApiError> {
    let sql = match on_conflict {
        OnConflict::Fail => INSERT_SQL,
        OnConflict::Update => UPSERT_SQL,
    };
    sqlx::query(sql)
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
        .bind(item.status_origin.unwrap_or_default().as_db_str())
        .execute(conn)
        .await
        .map_err(ApiError::from)?;
    Ok(())
}
