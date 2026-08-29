use super::fixtures::migrated_pool;

#[derive(sqlx::FromRow)]
struct QueryPlanRow {
    detail: String,
}

fn joined_plan(rows: &[QueryPlanRow]) -> String {
    rows.iter()
        .map(|row| row.detail.as_str())
        .collect::<Vec<_>>()
        .join(" | ")
}

#[tokio::test]
async fn latest_event_stats_query_uses_partition_index_without_temp_sort() {
    let pool = migrated_pool().await;
    let rows: Vec<QueryPlanRow> = sqlx::query_as(
        "EXPLAIN QUERY PLAN
         WITH latest_events AS (
           SELECT media_type, episode_id, event_type, duration_minutes,
                  ROW_NUMBER() OVER (
                    PARTITION BY media_id, media_type, episode_id
                    ORDER BY watched_at DESC, created_at DESC
                  ) AS rn
           FROM viewing_events WHERE profile_id = 'default'
         )
         SELECT COUNT(*) FROM latest_events WHERE rn = 1",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let plan = joined_plan(&rows);

    assert!(
        plan.contains("idx_viewing_events_profile_media_episode_date"),
        "expected latest-event composite index, got: {plan}"
    );
    assert!(
        !plan.contains("USE TEMP B-TREE FOR ORDER BY"),
        "latest-event window should not need a temporary sort: {plan}"
    );
}

#[tokio::test]
async fn media_history_query_uses_profile_media_date_index() {
    let pool = migrated_pool().await;
    let rows: Vec<QueryPlanRow> = sqlx::query_as(
        "EXPLAIN QUERY PLAN
         SELECT uuid, event_type, watched_at, episode_id, season_number, episode_number, note
         FROM viewing_events
         WHERE profile_id = 'default' AND media_id = 42 AND media_type = 'movie'
         ORDER BY watched_at DESC",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let plan = joined_plan(&rows);

    assert!(
        plan.contains("idx_viewing_events_profile_media_date"),
        "expected profile/media/date index, got: {plan}"
    );
}

#[tokio::test]
async fn completed_series_milestone_query_uses_covering_index() {
    let pool = migrated_pool().await;
    let rows: Vec<QueryPlanRow> = sqlx::query_as(
        "EXPLAIN QUERY PLAN
         SELECT completed_at FROM library_items
         WHERE profile_id = 'default'
           AND media_type = 'series'
           AND status = 'completed'
           AND completed_at IS NOT NULL
         ORDER BY completed_at ASC",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let plan = joined_plan(&rows);

    assert!(
        plan.contains("idx_library_profile_type_status_completed"),
        "expected completed-series covering index, got: {plan}"
    );
}

#[tokio::test]
async fn rating_distribution_query_uses_partial_rating_index() {
    let pool = migrated_pool().await;
    let rows: Vec<QueryPlanRow> = sqlx::query_as(
        "EXPLAIN QUERY PLAN
         SELECT user_rating AS rating, COUNT(*) AS count
         FROM library_items
         WHERE profile_id = 'default' AND user_rating IS NOT NULL
         GROUP BY user_rating
         ORDER BY user_rating ASC",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let plan = joined_plan(&rows);

    assert!(
        plan.contains("idx_library_profile_rating"),
        "expected profile/rating partial index, got: {plan}"
    );
}

#[tokio::test]
async fn library_list_query_uses_profile_updated_index() {
    let pool = migrated_pool().await;
    let rows: Vec<QueryPlanRow> = sqlx::query_as(
        "EXPLAIN QUERY PLAN
         SELECT * FROM library_items
         WHERE profile_id = 'default'
         ORDER BY updated_at DESC
         LIMIT 5000",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let plan = joined_plan(&rows);

    assert!(
        plan.contains("idx_library_profile_updated"),
        "expected library profile/update index, got: {plan}"
    );
}

#[tokio::test]
async fn tracked_series_query_uses_profile_and_progress_indexes() {
    let pool = migrated_pool().await;
    let rows: Vec<QueryPlanRow> = sqlx::query_as(
        "EXPLAIN QUERY PLAN
         SELECT ts.uuid, ts.series_id, ts.title, ts.poster_path, ts.backdrop_path,
                ts.total_episodes, ts.status, ts.created_at, ts.updated_at,
                COUNT(ep.episode_id) as watched_episodes
         FROM tracked_series ts
         LEFT JOIN episode_progress ep
           ON ep.profile_id = ts.profile_id
          AND ep.series_id = ts.series_id
          AND ep.watched = 1
         WHERE ts.profile_id = 'default'
         GROUP BY ts.uuid, ts.series_id, ts.title, ts.poster_path, ts.backdrop_path,
                  ts.total_episodes, ts.status, ts.created_at, ts.updated_at
         ORDER BY ts.updated_at DESC",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let plan = joined_plan(&rows);

    assert!(
        plan.contains("SEARCH ts USING INDEX") || plan.contains("SEARCH ts USING COVERING INDEX"),
        "expected indexed tracked-series profile lookup, got: {plan}"
    );
    assert!(
        !plan.contains("SCAN ts"),
        "tracked-series lookup should not scan the table: {plan}"
    );
    assert!(
        plan.contains("idx_episode_progress_series_watched"),
        "expected episode-progress join index, got: {plan}"
    );
}
