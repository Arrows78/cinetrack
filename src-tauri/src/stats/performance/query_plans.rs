use super::fixtures::migrated_pool;
use crate::stats::queries::active_events_cte;

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
async fn current_state_stats_query_reads_events_through_the_log_order_index() {
    let pool = migrated_pool().await;
    // The query every statistic runs, not a copy of it: the shared
    // current-state definition followed by the simplest consumer.
    let rows: Vec<QueryPlanRow> = sqlx::query_as(concat!(
        "EXPLAIN QUERY PLAN ",
        active_events_cte!(),
        " SELECT COUNT(*) FROM counted WHERE rk = 1"
    ))
    .bind("default")
    .fetch_all(&pool)
    .await
    .unwrap();
    let plan = joined_plan(&rows);

    assert!(
        plan.contains("idx_viewing_events_profile_media_episode_seq"),
        "expected the log-order composite index, got: {plan}"
    );
    // The first window reads the events straight off that index in log order.
    // The later windows (the cut and the ranking of the counted watch) each
    // re-partition the rows already in memory, so they sort — that is
    // intended, and bounded by one profile's events.
    assert!(
        plan.contains("SEARCH viewing_events USING INDEX idx_viewing_events_profile_media_episode_seq (profile_id=?)"),
        "the events should be read by profile through the index, not scanned: {plan}"
    );
    assert!(
        !plan.contains("SCAN viewing_events"),
        "the viewing_events table must not be scanned: {plan}"
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
         LIMIT 200000",
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
async fn planned_library_candidates_query_stays_index_driven() {
    let pool = migrated_pool().await;
    let rows: Vec<QueryPlanRow> = sqlx::query_as(
        "EXPLAIN QUERY PLAN
         SELECT * FROM library_items
         WHERE profile_id = 'default' AND media_type = 'movie' AND status = 'planned'
         ORDER BY updated_at DESC, media_id DESC
         LIMIT 20",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let plan = joined_plan(&rows);

    // SQLite prefers idx_library_profile_updated here over
    // idx_library_profile_type_status_completed — it already satisfies the
    // ORDER BY without a separate sort step, even though media_type/status
    // then filter as a post-scan predicate rather than an index range. Both
    // are legitimate, non-scanning choices; which one wins is the query
    // planner's call, not a contract this test should pin.
    assert!(
        plan.contains("idx_library_profile_updated")
            || plan.contains("idx_library_profile_type_status_completed"),
        "expected planned-candidates to use an existing library index, got: {plan}"
    );
    assert!(
        !plan.contains("SCAN library_items"),
        "planned-candidates lookup should not scan the table: {plan}"
    );
}

#[tokio::test]
async fn completed_library_candidates_query_uses_the_type_status_completed_index() {
    let pool = migrated_pool().await;
    let rows: Vec<QueryPlanRow> = sqlx::query_as(
        "EXPLAIN QUERY PLAN
         SELECT * FROM library_items
         WHERE profile_id = 'default' AND status = 'completed' AND media_type = 'series'
         ORDER BY completed_at DESC, media_id DESC
         LIMIT 20",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let plan = joined_plan(&rows);

    assert!(
        plan.contains("idx_library_profile_type_status_completed"),
        "expected completed-candidates to use the type/status covering index, got: {plan}"
    );
    assert!(
        !plan.contains("SCAN library_items"),
        "completed-candidates lookup should not scan the table: {plan}"
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
