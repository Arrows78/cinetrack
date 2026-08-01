use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

use crate::database::current_profile_id;
use crate::error::ApiError;
use crate::models::MediaType;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ViewingEventType {
    Watched,
    Unwatched,
    Rewatched,
}

impl ViewingEventType {
    pub(crate) fn as_db_str(self) -> &'static str {
        match self {
            ViewingEventType::Watched => "watched",
            ViewingEventType::Unwatched => "unwatched",
            ViewingEventType::Rewatched => "rewatched",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewingEvent {
    pub id: String,
    pub profile_id: String,
    pub media_id: i64,
    pub media_type: MediaType,
    pub title: String,
    pub event_type: ViewingEventType,
    pub watched_at: String,
    pub duration_minutes: Option<i64>,
    pub episode_id: Option<i64>,
    pub season_number: Option<i64>,
    pub episode_number: Option<i64>,
}

#[derive(sqlx::FromRow)]
struct ViewingEventRow {
    uuid: String,
    media_id: i64,
    media_type: String,
    title: String,
    event_type: String,
    watched_at: String,
    duration_minutes: Option<i64>,
    episode_id: Option<i64>,
    season_number: Option<i64>,
    episode_number: Option<i64>,
}

impl ViewingEventRow {
    fn into_event(self, profile_id: &str) -> Result<ViewingEvent, ApiError> {
        let event_type = match self.event_type.as_str() {
            "watched" => ViewingEventType::Watched,
            "unwatched" => ViewingEventType::Unwatched,
            "rewatched" => ViewingEventType::Rewatched,
            other => return Err(ApiError::internal(format!("Unknown viewing event type in database: {other}"))),
        };

        Ok(ViewingEvent {
            id: self.uuid,
            profile_id: profile_id.to_string(),
            media_id: self.media_id,
            media_type: MediaType::from_db_str(&self.media_type),
            title: self.title,
            event_type,
            watched_at: self.watched_at,
            duration_minutes: self.duration_minutes,
            episode_id: self.episode_id,
            season_number: self.season_number,
            episode_number: self.episode_number,
        })
    }
}

async fn list_viewing_events_impl(pool: &SqlitePool, profile_id: &str) -> Result<Vec<ViewingEvent>, ApiError> {
    let rows: Vec<ViewingEventRow> = sqlx::query_as(
        "SELECT uuid, media_id, media_type, title, event_type, watched_at, duration_minutes, episode_id, season_number, episode_number
         FROM viewing_events WHERE profile_id = $1",
    )
    .bind(profile_id)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    rows.into_iter().map(|row| row.into_event(profile_id)).collect()
}

#[tauri::command]
pub async fn list_viewing_events(pool: State<'_, SqlitePool>) -> Result<Vec<ViewingEvent>, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    list_viewing_events_impl(&pool, &profile_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(2).connect("sqlite::memory:").await.unwrap();
        crate::database::migrations::run_migrations(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn lists_viewing_events_scoped_to_the_profile() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, created_at)
             VALUES ('a', 'default', 1, 'movie', 'Test', 'watched', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('guest', 'Guest', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, created_at)
             VALUES ('b', 'guest', 2, 'movie', 'Other profile', 'watched', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let events = list_viewing_events_impl(&pool, "default").await.unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].title, "Test");
        assert_eq!(events[0].event_type, ViewingEventType::Watched);
    }
}
