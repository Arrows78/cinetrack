use serde_json::Value;
use sqlx::SqlitePool;

use super::models::{HistoryRow, ViewingHistoryItem};
use crate::database::current_profile_id;
use crate::error::ApiError;

/// `before` is an exclusive `(timestamp, uuid)` cursor — the last item seen
/// on a previous page — rather than an `OFFSET`. An offset would shift if a
/// new entry is logged between two page fetches (activity_log keeps growing
/// at the front), silently skipping or repeating rows. The `uuid` tiebreaker
/// matters too: several rows can share the exact same `timestamp` (e.g. one
/// transaction logging more than one entry), and comparing `timestamp` alone
/// would drop any sibling row after the last one actually returned.
pub(crate) async fn list_history_impl(
    pool: &SqlitePool,
    limit: u32,
    before: Option<(&str, &str)>,
) -> Result<Vec<ViewingHistoryItem>, ApiError> {
    let profile_id = current_profile_id(pool).await?;

    let rows: Vec<HistoryRow> = match before {
        Some((before_timestamp, before_id)) => {
            sqlx::query_as(
                "SELECT uuid, media_id, media_type, title, action, season_number, episode_number, episode_title, metadata, timestamp
                 FROM activity_log
                 WHERE profile_id = $1 AND (timestamp < $2 OR (timestamp = $2 AND uuid < $3))
                 ORDER BY timestamp DESC, uuid DESC LIMIT $4",
            )
            .bind(profile_id)
            .bind(before_timestamp)
            .bind(before_id)
            .bind(limit)
            .fetch_all(pool)
            .await
        }
        None => {
            sqlx::query_as(
                "SELECT uuid, media_id, media_type, title, action, season_number, episode_number, episode_title, metadata, timestamp
                 FROM activity_log WHERE profile_id = $1 ORDER BY timestamp DESC, uuid DESC LIMIT $2",
            )
            .bind(profile_id)
            .bind(limit)
            .fetch_all(pool)
            .await
        }
    }
    .map_err(ApiError::from)?;

    rows.into_iter().map(ViewingHistoryItem::try_from).collect()
}

/// Generic over the executor so callers that already opened their own
/// transaction (e.g. library's upsert/remove, which must log history
/// atomically with their own write) can pass `&mut *tx` instead of forcing a
/// second, separate transaction. `pool` is only used for the active-profile
/// fallback when `item.metadata` doesn't already carry a `profileId` —
/// callers writing inside a transaction should always pre-populate it (as
/// every caller in this codebase does) to avoid a second connection
/// checkout while the transaction's connection is held.
pub(crate) async fn add_history_item_impl<'e, E>(
    executor: E,
    pool: &SqlitePool,
    item: ViewingHistoryItem,
) -> Result<(), ApiError>
where
    E: sqlx::Executor<'e, Database = sqlx::Sqlite>,
{
    let profile_id = match item
        .metadata
        .as_ref()
        .and_then(|m| m.get("profileId"))
        .and_then(Value::as_str)
    {
        Some(id) => id.to_string(),
        None => current_profile_id(pool).await?,
    };

    let mut metadata = item
        .metadata
        .unwrap_or_else(|| Value::Object(Default::default()));
    if let Value::Object(map) = &mut metadata {
        map.insert("profileId".to_string(), Value::String(profile_id.clone()));
    }

    sqlx::query(
        "INSERT INTO activity_log
          (uuid, profile_id, media_id, media_type, title, action, season_number, episode_number, episode_title, metadata, timestamp, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $11)
         ON CONFLICT (uuid) DO UPDATE SET
           profile_id = excluded.profile_id,
           media_id = excluded.media_id,
           media_type = excluded.media_type,
           title = excluded.title,
           action = excluded.action,
           season_number = excluded.season_number,
           episode_number = excluded.episode_number,
           episode_title = excluded.episode_title,
           metadata = excluded.metadata,
           timestamp = excluded.timestamp,
           updated_at = excluded.updated_at",
    )
    .bind(&item.id)
    .bind(&profile_id)
    .bind(item.media_id)
    .bind(item.media_type.as_db_str())
    .bind(item.title)
    .bind(item.action.as_db_str())
    .bind(item.season_number)
    .bind(item.episode_number)
    .bind(item.episode_title)
    .bind(metadata.to_string())
    .bind(item.timestamp)
    .execute(executor)
    .await
    .map_err(ApiError::from)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::history::models::HistoryAction;
    use crate::models::MediaType;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database::migrations::run_migrations(&pool)
            .await
            .unwrap();
        pool
    }

    fn entry(id: &str, timestamp: &str, title: &str) -> ViewingHistoryItem {
        ViewingHistoryItem {
            id: id.to_string(),
            media_id: 1,
            media_type: MediaType::Movie,
            title: title.to_string(),
            action: HistoryAction::MovieWatched,
            timestamp: timestamp.to_string(),
            season_number: None,
            episode_number: None,
            episode_title: None,
            metadata: None,
        }
    }

    #[tokio::test]
    async fn returns_entries_newest_first() {
        let pool = migrated_pool().await;

        add_history_item_impl(
            &pool,
            &pool,
            entry("1", "2026-01-02T00:00:00.000Z", "Milieu"),
        )
        .await
        .unwrap();
        add_history_item_impl(
            &pool,
            &pool,
            entry("2", "2026-01-01T00:00:00.000Z", "Ancien"),
        )
        .await
        .unwrap();
        add_history_item_impl(
            &pool,
            &pool,
            entry("3", "2026-01-03T00:00:00.000Z", "Recent"),
        )
        .await
        .unwrap();

        let list = list_history_impl(&pool, 50, None).await.unwrap();
        assert_eq!(
            list.into_iter().map(|item| item.title).collect::<Vec<_>>(),
            vec!["Recent", "Milieu", "Ancien"]
        );
    }

    #[tokio::test]
    async fn respects_the_limit_parameter() {
        let pool = migrated_pool().await;
        for index in 0..5 {
            add_history_item_impl(
                &pool,
                &pool,
                entry(
                    &index.to_string(),
                    &format!("2026-01-0{}T00:00:00.000Z", index + 1),
                    "Title",
                ),
            )
            .await
            .unwrap();
        }

        assert_eq!(list_history_impl(&pool, 2, None).await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn paginates_with_a_cursor_instead_of_repeating_or_skipping_rows() {
        let pool = migrated_pool().await;
        for index in 0..5 {
            add_history_item_impl(
                &pool,
                &pool,
                entry(
                    &index.to_string(),
                    &format!("2026-01-0{}T00:00:00.000Z", index + 1),
                    &format!("Title {index}"),
                ),
            )
            .await
            .unwrap();
        }

        let first_page = list_history_impl(&pool, 2, None).await.unwrap();
        assert_eq!(
            first_page
                .iter()
                .map(|item| &item.title)
                .collect::<Vec<_>>(),
            vec!["Title 4", "Title 3"]
        );

        let last = first_page.last().unwrap();
        let second_page = list_history_impl(&pool, 2, Some((&last.timestamp, &last.id)))
            .await
            .unwrap();
        assert_eq!(
            second_page
                .iter()
                .map(|item| &item.title)
                .collect::<Vec<_>>(),
            vec!["Title 2", "Title 1"]
        );
    }

    #[tokio::test]
    async fn a_cursor_never_drops_a_sibling_row_sharing_the_exact_same_timestamp() {
        let pool = migrated_pool().await;
        // Same instant, e.g. two entries written by one transaction — only the
        // uuid tiebreaker can tell them apart, since ORDER BY timestamp alone
        // wouldn't guarantee "c" comes back before "b" or "a" is never lost.
        add_history_item_impl(&pool, &pool, entry("a", "2026-01-01T00:00:00.000Z", "A"))
            .await
            .unwrap();
        add_history_item_impl(&pool, &pool, entry("b", "2026-01-01T00:00:00.000Z", "B"))
            .await
            .unwrap();
        add_history_item_impl(&pool, &pool, entry("c", "2026-01-01T00:00:00.000Z", "C"))
            .await
            .unwrap();

        let first_page = list_history_impl(&pool, 2, None).await.unwrap();
        assert_eq!(first_page.len(), 2);

        let last = first_page.last().unwrap();
        let second_page = list_history_impl(&pool, 2, Some((&last.timestamp, &last.id)))
            .await
            .unwrap();

        let mut all_ids: Vec<String> = first_page
            .iter()
            .chain(second_page.iter())
            .map(|item| item.id.clone())
            .collect();
        all_ids.sort();
        assert_eq!(all_ids, vec!["a", "b", "c"]);
    }

    #[tokio::test]
    async fn stamps_entries_with_the_active_profile_and_scopes_list_to_it() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('guest', 'Guest', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();

        add_history_item_impl(
            &pool,
            &pool,
            entry("1", "2026-01-01T00:00:00.000Z", "Default profile entry"),
        )
        .await
        .unwrap();
        assert_eq!(list_history_impl(&pool, 50, None).await.unwrap().len(), 1);

        sqlx::query(
            "INSERT INTO preferences (key, value, updated_at) VALUES ('activeProfileId', '\"guest\"', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();
        assert_eq!(list_history_impl(&pool, 50, None).await.unwrap().len(), 0);

        add_history_item_impl(
            &pool,
            &pool,
            entry("2", "2026-01-01T00:00:00.000Z", "Guest entry"),
        )
        .await
        .unwrap();
        let guest_history = list_history_impl(&pool, 50, None).await.unwrap();
        assert_eq!(guest_history.len(), 1);
        assert_eq!(
            guest_history[0]
                .metadata
                .as_ref()
                .and_then(|m| m.get("profileId"))
                .and_then(Value::as_str),
            Some("guest")
        );
    }

    #[tokio::test]
    async fn keeps_an_explicit_metadata_profile_id_instead_of_the_active_profile() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('guest', 'Guest', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let mut item = entry("1", "2026-01-01T00:00:00.000Z", "Explicit profile");
        item.metadata = Some(serde_json::json!({ "profileId": "guest" }));
        add_history_item_impl(&pool, &pool, item).await.unwrap();

        assert_eq!(list_history_impl(&pool, 50, None).await.unwrap().len(), 0);

        sqlx::query(
            "INSERT INTO preferences (key, value, updated_at) VALUES ('activeProfileId', '\"guest\"', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();
        assert_eq!(list_history_impl(&pool, 50, None).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn tolerates_non_object_metadata_without_injecting_a_profile_id() {
        let pool = migrated_pool().await;
        // A non-object JSON value (a bare string here) can't have a key
        // inserted into it — `add_history_item_impl` must store it as-is
        // rather than panicking on the `if let Value::Object` match.
        let mut item = entry("1", "2026-01-01T00:00:00.000Z", "Weird metadata");
        item.metadata = Some(serde_json::json!("not-an-object"));

        add_history_item_impl(&pool, &pool, item).await.unwrap();

        let list = list_history_impl(&pool, 50, None).await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].metadata, Some(serde_json::json!("not-an-object")));
    }
}
