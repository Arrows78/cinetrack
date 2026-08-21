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
            other => {
                return Err(ApiError::internal(format!(
                    "Unknown viewing event type in database: {other}"
                )));
            }
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

async fn list_viewing_events_since_impl(
    pool: &SqlitePool,
    profile_id: &str,
    since: &str,
) -> Result<Vec<ViewingEvent>, ApiError> {
    let rows: Vec<ViewingEventRow> = sqlx::query_as(
        "SELECT uuid, media_id, media_type, title, event_type, watched_at, duration_minutes, episode_id, season_number, episode_number
         FROM viewing_events WHERE profile_id = $1 AND watched_at >= $2",
    )
    .bind(profile_id)
    .bind(since)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    rows.into_iter()
        .map(|row| row.into_event(profile_id))
        .collect()
}

/// Bounded fetch for computations that only need a recent window (current
/// streak, catch-up pace) — avoids pulling a profile's entire lifetime of
/// events for a calculation that never looks further back than `since`.
#[tauri::command]
pub async fn list_recent_viewing_events(
    since: String,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ViewingEvent>, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    list_viewing_events_since_impl(&pool, &profile_id, &since).await
}

async fn list_viewing_events_for_year_impl(
    pool: &SqlitePool,
    profile_id: &str,
    range_start: &str,
    range_end: &str,
) -> Result<Vec<ViewingEvent>, ApiError> {
    let rows: Vec<ViewingEventRow> = sqlx::query_as(
        "SELECT uuid, media_id, media_type, title, event_type, watched_at, duration_minutes, episode_id, season_number, episode_number
         FROM viewing_events WHERE profile_id = $1 AND watched_at >= $2 AND watched_at < $3",
    )
    .bind(profile_id)
    .bind(range_start)
    .bind(range_end)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    rows.into_iter()
        .map(|row| row.into_event(profile_id))
        .collect()
}

/// Bounded fetch for the yearly "wrapped" summary — only ever needs one
/// calendar year's worth of events, not the whole history. `range_start`/
/// `range_end` are ISO instants (end exclusive).
#[tauri::command]
pub async fn list_viewing_events_for_year(
    range_start: String,
    range_end: String,
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ViewingEvent>, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    list_viewing_events_for_year_impl(&pool, &profile_id, &range_start, &range_end).await
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsTotals {
    pub movies_watched: i64,
    pub episodes_watched: i64,
    pub minutes_watched: i64,
    /// Minutes from movie-typed events only — the movies/series split card
    /// on the Stats page reads this alongside `episode_minutes_watched`
    /// instead of re-deriving it from a second, unbounded events fetch.
    pub movie_minutes_watched: i64,
    pub episode_minutes_watched: i64,
    pub completed_series: i64,
    pub library_completion_percent: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyActivityBucket {
    pub month: String,
    pub count: i64,
    pub minutes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsOverview {
    pub totals: StatsTotals,
    pub monthly_activity: Vec<MonthlyActivityBucket>,
}

#[derive(sqlx::FromRow)]
struct EventTotalsRow {
    movies_watched: i64,
    episodes_watched: i64,
    minutes_watched: Option<i64>,
    movie_minutes_watched: Option<i64>,
    episode_minutes_watched: Option<i64>,
}

#[derive(sqlx::FromRow)]
struct LibraryTotalsRow {
    total: i64,
    completed: i64,
    completed_series: i64,
}

#[derive(sqlx::FromRow)]
struct MonthlyActivityRow {
    month: String,
    count: i64,
    minutes: Option<i64>,
}

/// `month_starts` are "YYYY-MM-01T00:00:00.000Z"-style bounds for the
/// window to aggregate, oldest first; the response always contains exactly
/// one bucket per entry (zero-filled), matching what the previous
/// client-side `eachMonthOfInterval` produced.
async fn get_stats_overview_impl(
    pool: &SqlitePool,
    profile_id: &str,
    window_start: &str,
    month_labels: &[String],
) -> Result<StatsOverview, ApiError> {
    let event_totals: EventTotalsRow = sqlx::query_as(
        "SELECT
           COUNT(CASE WHEN event_type IN ('watched','rewatched') AND media_type = 'movie' THEN 1 END) AS movies_watched,
           COUNT(CASE WHEN event_type IN ('watched','rewatched') AND episode_id IS NOT NULL THEN 1 END) AS episodes_watched,
           SUM(CASE WHEN event_type IN ('watched','rewatched') THEN duration_minutes ELSE 0 END) AS minutes_watched,
           SUM(CASE WHEN event_type IN ('watched','rewatched') AND media_type = 'movie' THEN duration_minutes ELSE 0 END) AS movie_minutes_watched,
           SUM(CASE WHEN event_type IN ('watched','rewatched') AND episode_id IS NOT NULL THEN duration_minutes ELSE 0 END) AS episode_minutes_watched
         FROM viewing_events WHERE profile_id = $1",
    )
    .bind(profile_id)
    .fetch_one(pool)
    .await
    .map_err(ApiError::from)?;

    let library_totals: LibraryTotalsRow = sqlx::query_as(
        "SELECT
           COUNT(*) AS total,
           COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed,
           COUNT(CASE WHEN media_type = 'series' AND status = 'completed' THEN 1 END) AS completed_series
         FROM library_items WHERE profile_id = $1",
    )
    .bind(profile_id)
    .fetch_one(pool)
    .await
    .map_err(ApiError::from)?;

    let monthly_rows: Vec<MonthlyActivityRow> = sqlx::query_as(
        "SELECT strftime('%Y-%m', watched_at) AS month, COUNT(*) AS count, SUM(duration_minutes) AS minutes
         FROM viewing_events
         WHERE profile_id = $1 AND event_type IN ('watched','rewatched') AND watched_at >= $2
         GROUP BY month",
    )
    .bind(profile_id)
    .bind(window_start)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    let monthly_by_label: std::collections::HashMap<String, &MonthlyActivityRow> = monthly_rows
        .iter()
        .map(|row| (row.month.clone(), row))
        .collect();

    let monthly_activity = month_labels
        .iter()
        .map(|label| match monthly_by_label.get(label) {
            Some(row) => MonthlyActivityBucket {
                month: label.clone(),
                count: row.count,
                minutes: row.minutes.unwrap_or(0),
            },
            None => MonthlyActivityBucket {
                month: label.clone(),
                count: 0,
                minutes: 0,
            },
        })
        .collect();

    let library_completion_percent = if library_totals.total > 0 {
        ((library_totals.completed as f64 / library_totals.total as f64) * 100.0).round() as i64
    } else {
        0
    };

    Ok(StatsOverview {
        totals: StatsTotals {
            movies_watched: event_totals.movies_watched,
            episodes_watched: event_totals.episodes_watched,
            minutes_watched: event_totals.minutes_watched.unwrap_or(0),
            movie_minutes_watched: event_totals.movie_minutes_watched.unwrap_or(0),
            episode_minutes_watched: event_totals.episode_minutes_watched.unwrap_or(0),
            completed_series: library_totals.completed_series,
            library_completion_percent,
        },
        monthly_activity,
    })
}

/// `window_start` and `month_labels` are computed client-side (date-fns
/// already owns "current month" logic elsewhere in the app) and passed in,
/// so this command stays a pure aggregation over a caller-specified window
/// rather than a second place that decides what "the last 12 months" means.
#[tauri::command]
pub async fn get_stats_overview(
    window_start: String,
    month_labels: Vec<String>,
    pool: State<'_, SqlitePool>,
) -> Result<StatsOverview, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    get_stats_overview_impl(&pool, &profile_id, &window_start, &month_labels).await
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YearlyActivityBucket {
    pub year: i64,
    pub movies_watched: i64,
    pub episodes_watched: i64,
    pub minutes_watched: i64,
}

#[derive(sqlx::FromRow)]
struct YearlyActivityRow {
    year: i64,
    movies_watched: i64,
    episodes_watched: i64,
    minutes_watched: Option<i64>,
}

impl From<YearlyActivityRow> for YearlyActivityBucket {
    fn from(row: YearlyActivityRow) -> Self {
        Self {
            year: row.year,
            movies_watched: row.movies_watched,
            episodes_watched: row.episodes_watched,
            minutes_watched: row.minutes_watched.unwrap_or(0),
        }
    }
}

/// One row per calendar year that has at least one `watched`/`rewatched`
/// event — every year in the profile's history in a single query, powering
/// the Stats page's year-over-year chart and bounding its year switcher
/// (rather than probing `list_viewing_events_for_year` one year at a time,
/// or guessing how far back to look).
async fn list_yearly_activity_impl(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<Vec<YearlyActivityBucket>, ApiError> {
    let rows: Vec<YearlyActivityRow> = sqlx::query_as(
        "SELECT
           CAST(strftime('%Y', watched_at) AS INTEGER) AS year,
           COUNT(CASE WHEN event_type IN ('watched','rewatched') AND media_type = 'movie' THEN 1 END) AS movies_watched,
           COUNT(CASE WHEN event_type IN ('watched','rewatched') AND episode_id IS NOT NULL THEN 1 END) AS episodes_watched,
           SUM(CASE WHEN event_type IN ('watched','rewatched') THEN duration_minutes ELSE 0 END) AS minutes_watched
         FROM viewing_events
         WHERE profile_id = $1 AND event_type IN ('watched','rewatched')
         GROUP BY year
         ORDER BY year ASC",
    )
    .bind(profile_id)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    Ok(rows.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub async fn list_yearly_activity(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<YearlyActivityBucket>, ApiError> {
    let profile_id = current_profile_id(&pool).await?;
    list_yearly_activity_impl(&pool, &profile_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
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
        pool
    }

    #[test]
    fn viewing_event_type_as_db_str_matches_the_wire_format() {
        assert_eq!(ViewingEventType::Watched.as_db_str(), "watched");
        assert_eq!(ViewingEventType::Unwatched.as_db_str(), "unwatched");
        assert_eq!(ViewingEventType::Rewatched.as_db_str(), "rewatched");
    }

    #[test]
    fn into_event_rejects_an_unrecognized_event_type() {
        let row = ViewingEventRow {
            uuid: "bogus-row".to_string(),
            media_id: 1,
            media_type: "movie".to_string(),
            title: "Test".to_string(),
            event_type: "bogus".to_string(),
            watched_at: "2026-01-01T00:00:00.000Z".to_string(),
            duration_minutes: None,
            episode_id: None,
            season_number: None,
            episode_number: None,
        };

        let result = row.into_event("default");

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn lists_recent_viewing_events_scoped_to_the_profile() {
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

        let events = list_viewing_events_since_impl(&pool, "default", "2025-01-01T00:00:00.000Z")
            .await
            .unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].title, "Test");
        assert_eq!(events[0].event_type, ViewingEventType::Watched);
    }

    async fn insert_event(
        pool: &SqlitePool,
        uuid: &str,
        watched_at: &str,
        event_type: &str,
        media_type: &str,
        duration_minutes: Option<i64>,
        episode_id: Option<i64>,
    ) {
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, episode_id, created_at)
             VALUES ($1, 'default', 1, $2, 'Test', $3, $4, $5, $6, $4)",
        )
        .bind(uuid)
        .bind(media_type)
        .bind(event_type)
        .bind(watched_at)
        .bind(duration_minutes)
        .bind(episode_id)
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn list_recent_only_returns_events_on_or_after_the_cutoff() {
        let pool = migrated_pool().await;
        insert_event(
            &pool,
            "old",
            "2025-01-01T00:00:00.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;
        insert_event(
            &pool,
            "recent",
            "2026-06-01T00:00:00.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;

        let events = list_viewing_events_since_impl(&pool, "default", "2026-01-01T00:00:00.000Z")
            .await
            .unwrap();

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "recent");
    }

    #[tokio::test]
    async fn list_for_year_excludes_events_outside_the_range() {
        let pool = migrated_pool().await;
        insert_event(
            &pool,
            "before",
            "2025-12-31T23:59:59.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;
        insert_event(
            &pool,
            "inside",
            "2026-06-15T00:00:00.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;
        insert_event(
            &pool,
            "after",
            "2027-01-01T00:00:00.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;

        let events = list_viewing_events_for_year_impl(
            &pool,
            "default",
            "2026-01-01T00:00:00.000Z",
            "2027-01-01T00:00:00.000Z",
        )
        .await
        .unwrap();

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "inside");
    }

    #[tokio::test]
    async fn stats_overview_aggregates_totals_and_zero_fills_empty_months() {
        let pool = migrated_pool().await;
        insert_event(
            &pool,
            "movie-1",
            "2026-03-10T00:00:00.000Z",
            "watched",
            "movie",
            Some(100),
            None,
        )
        .await;
        insert_event(
            &pool,
            "episode-1",
            "2026-03-12T00:00:00.000Z",
            "watched",
            "series",
            Some(40),
            Some(9001),
        )
        .await;
        insert_event(
            &pool,
            "episode-2",
            "2026-03-15T00:00:00.000Z",
            "rewatched",
            "series",
            Some(40),
            Some(9002),
        )
        .await;
        // An "unwatched" toggle must not count toward totals or minutes.
        insert_event(
            &pool,
            "unwatch-1",
            "2026-03-20T00:00:00.000Z",
            "unwatched",
            "series",
            Some(999),
            Some(9003),
        )
        .await;

        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at)
             VALUES ('lib-1', 'default', 1, 'series', 'Show A', 'completed', 'now', 'now'),
                    ('lib-2', 'default', 2, 'series', 'Show B', 'watching', 'now', 'now'),
                    ('lib-3', 'default', 3, 'movie', 'Film A', 'planned', 'now', 'now'),
                    ('lib-4', 'default', 4, 'movie', 'Film B', 'completed', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let month_labels = vec![
            "2026-02".to_string(),
            "2026-03".to_string(),
            "2026-04".to_string(),
        ];
        let overview =
            get_stats_overview_impl(&pool, "default", "2026-02-01T00:00:00.000Z", &month_labels)
                .await
                .unwrap();

        assert_eq!(overview.totals.movies_watched, 1);
        assert_eq!(overview.totals.episodes_watched, 2);
        assert_eq!(overview.totals.minutes_watched, 180);
        assert_eq!(overview.totals.movie_minutes_watched, 100);
        assert_eq!(overview.totals.episode_minutes_watched, 80);
        assert_eq!(overview.totals.completed_series, 1);
        // 2 completed out of 4 library items.
        assert_eq!(overview.totals.library_completion_percent, 50);

        assert_eq!(overview.monthly_activity.len(), 3);
        assert_eq!(
            overview.monthly_activity[0],
            MonthlyActivityBucket {
                month: "2026-02".into(),
                count: 0,
                minutes: 0
            }
        );
        assert_eq!(
            overview.monthly_activity[1],
            MonthlyActivityBucket {
                month: "2026-03".into(),
                count: 3,
                minutes: 180
            }
        );
        assert_eq!(
            overview.monthly_activity[2],
            MonthlyActivityBucket {
                month: "2026-04".into(),
                count: 0,
                minutes: 0
            }
        );
    }

    #[tokio::test]
    async fn stats_overview_zero_fills_completion_percent_when_library_is_empty() {
        let pool = migrated_pool().await;
        let month_labels = vec!["2026-03".to_string()];

        let overview =
            get_stats_overview_impl(&pool, "default", "2026-03-01T00:00:00.000Z", &month_labels)
                .await
                .unwrap();

        assert_eq!(overview.totals.library_completion_percent, 0);
    }

    #[tokio::test]
    async fn yearly_activity_groups_by_year_and_ignores_unwatched_toggles() {
        let pool = migrated_pool().await;
        insert_event(
            &pool,
            "y2025-movie",
            "2025-06-01T00:00:00.000Z",
            "watched",
            "movie",
            Some(100),
            None,
        )
        .await;
        insert_event(
            &pool,
            "y2026-movie",
            "2026-01-10T00:00:00.000Z",
            "watched",
            "movie",
            Some(120),
            None,
        )
        .await;
        insert_event(
            &pool,
            "y2026-episode",
            "2026-03-12T00:00:00.000Z",
            "watched",
            "series",
            Some(40),
            Some(9001),
        )
        .await;
        insert_event(
            &pool,
            "y2026-rewatch",
            "2026-05-01T00:00:00.000Z",
            "rewatched",
            "series",
            Some(40),
            Some(9002),
        )
        .await;
        insert_event(
            &pool,
            "y2026-unwatch",
            "2026-05-02T00:00:00.000Z",
            "unwatched",
            "series",
            Some(999),
            Some(9003),
        )
        .await;

        let yearly = list_yearly_activity_impl(&pool, "default").await.unwrap();

        assert_eq!(
            yearly,
            vec![
                YearlyActivityBucket {
                    year: 2025,
                    movies_watched: 1,
                    episodes_watched: 0,
                    minutes_watched: 100
                },
                YearlyActivityBucket {
                    year: 2026,
                    movies_watched: 1,
                    episodes_watched: 2,
                    minutes_watched: 200
                },
            ]
        );
    }

    #[tokio::test]
    async fn yearly_activity_is_scoped_to_the_active_profile() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('guest', 'Guest', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();
        insert_event(
            &pool,
            "default-movie",
            "2026-01-01T00:00:00.000Z",
            "watched",
            "movie",
            Some(100),
            None,
        )
        .await;
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, created_at)
             VALUES ('guest-movie', 'guest', 1, 'movie', 'Test', 'watched', '2026-01-01T00:00:00.000Z', 50, '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let yearly = list_yearly_activity_impl(&pool, "default").await.unwrap();

        assert_eq!(
            yearly,
            vec![YearlyActivityBucket {
                year: 2026,
                movies_watched: 1,
                episodes_watched: 0,
                minutes_watched: 100
            }]
        );
    }

    // The `#[tauri::command]` wrappers below only add profile resolution on
    // top of the `_impl` functions already thoroughly exercised above, so a
    // single happy-path call through a real `tauri::test::mock_app()` state
    // handle is enough per wrapper — see profiles.rs's
    // `list_profiles_command_returns_the_default_profile` for the pattern.

    #[tokio::test]
    async fn list_recent_viewing_events_wrapper_returns_events_for_the_active_profile() {
        let pool = migrated_pool().await;
        insert_event(
            &pool,
            "recent",
            "2026-06-01T00:00:00.000Z",
            "watched",
            "movie",
            None,
            None,
        )
        .await;

        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let events = list_recent_viewing_events("2026-01-01T00:00:00.000Z".to_string(), state)
            .await
            .unwrap();

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "recent");
    }

    #[tokio::test]
    async fn list_viewing_events_for_year_wrapper_returns_an_empty_list_for_a_fresh_profile() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let events = list_viewing_events_for_year(
            "2026-01-01T00:00:00.000Z".to_string(),
            "2027-01-01T00:00:00.000Z".to_string(),
            state,
        )
        .await
        .unwrap();

        assert!(events.is_empty());
    }

    #[tokio::test]
    async fn get_stats_overview_wrapper_returns_zeroed_totals_for_a_fresh_profile() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let overview = get_stats_overview(
            "2026-01-01T00:00:00.000Z".to_string(),
            vec!["2026-01".to_string()],
            state,
        )
        .await
        .unwrap();

        assert_eq!(overview.totals.movies_watched, 0);
        assert_eq!(overview.totals.episodes_watched, 0);
        assert_eq!(overview.totals.minutes_watched, 0);
        assert_eq!(overview.totals.library_completion_percent, 0);
        assert_eq!(
            overview.monthly_activity,
            vec![MonthlyActivityBucket {
                month: "2026-01".into(),
                count: 0,
                minutes: 0
            }]
        );
    }

    #[tokio::test]
    async fn list_yearly_activity_wrapper_returns_an_empty_list_for_a_fresh_profile() {
        let pool = migrated_pool().await;
        let app = tauri::test::mock_app();
        app.manage(pool);
        let state: State<'_, SqlitePool> = app.state();

        let yearly = list_yearly_activity(state).await.unwrap();

        assert!(yearly.is_empty());
    }
}
