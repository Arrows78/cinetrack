use sqlx::SqlitePool;

use super::{ActivityStats, BiggestBingeDay, HeatmapBucket};
use crate::error::ApiError;

// `tz_offset_minutes` is JS's `Date.getTimezoneOffset()` (UTC minus local,
// in minutes) — shifting a stored UTC `watched_at` by `-tz_offset_minutes`
// via `datetime(watched_at, printf('%+d minutes', -$N))` converts it to the
// caller's local wall-clock time before bucketing. Streak/binge-day/heatmap
// all read as "days" or "hours you experienced", not UTC days — matching
// how the equivalent TS (`date-fns`'s `parseISO`/`format`, plain
// `Date.getDay()`/`getHours()`) worked before this moved to SQL. Unlike
// `list_on_this_day_events_impl`'s UTC-only month-day match, these need to
// be timezone-precise: a "when do you like to watch" heatmap in UTC hours
// would misrepresent anyone outside UTC.
//
// Each query below repeats this shift as a literal string rather than
// building the SQL dynamically (sqlx 0.9 requires a `&'static str` for
// `query_as`, specifically to make it easy to audit that no query is ever
// built by interpolating untrusted data into SQL text).

#[derive(sqlx::FromRow)]
struct DayIslandRow {
    island_end: String,
    streak_len: i64,
}

#[derive(sqlx::FromRow)]
struct BingeDayRow {
    day: String,
    count: i64,
}

#[derive(sqlx::FromRow)]
struct HeatmapRow {
    day_of_week: i64,
    hour: i64,
    count: i64,
}

fn local_day_before(local_day: &str) -> Result<String, ApiError> {
    use chrono::NaiveDate;
    let date = NaiveDate::parse_from_str(local_day, "%Y-%m-%d").map_err(|error| {
        ApiError::internal(format!("Malformed local day '{local_day}': {error}"))
    })?;
    Ok((date - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string())
}

pub(in crate::stats) async fn get_activity_stats_impl(
    pool: &SqlitePool,
    profile_id: &str,
    since: &str,
    today: &str,
    tz_offset_minutes: i64,
) -> Result<ActivityStats, ApiError> {
    // "Islands" of consecutive local calendar days: for each distinct
    // watched day, `julianday(day) - ROW_NUMBER()` is constant within a run
    // of consecutive days and differs across a gap, so grouping by it
    // yields one row per run — the run's own length, and its last (most
    // recent) day. Ordered newest-run-first so the current streak (if any)
    // is always the first row.
    let islands: Vec<DayIslandRow> = sqlx::query_as(
        "WITH days AS (
           SELECT DISTINCT date(datetime(watched_at, printf('%+d minutes', -$3))) AS day
           FROM viewing_events
           WHERE profile_id = $1 AND event_type IN ('watched','rewatched') AND watched_at >= $2
         ),
         numbered AS (
           SELECT day, julianday(day) - ROW_NUMBER() OVER (ORDER BY day) AS island
           FROM days
         )
         SELECT MAX(day) AS island_end, COUNT(*) AS streak_len
         FROM numbered
         GROUP BY island
         ORDER BY island_end DESC",
    )
    .bind(profile_id)
    .bind(since)
    .bind(tz_offset_minutes)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    let longest_streak_days = islands.iter().map(|row| row.streak_len).max().unwrap_or(0);

    let local_today_row: (String,) =
        sqlx::query_as("SELECT date(datetime($1, printf('%+d minutes', -$2)))")
            .bind(today)
            .bind(tz_offset_minutes)
            .fetch_one(pool)
            .await
            .map_err(ApiError::from)?;
    let local_today = local_today_row.0;
    let local_yesterday = local_day_before(&local_today)?;

    // A streak still "counts" if the most recent watched day is today or
    // yesterday (local time) — it only breaks once a full day passes with
    // no watch, not the instant a new day starts before today's first watch.
    let current_streak_days = islands
        .first()
        .filter(|row| row.island_end == local_today || row.island_end == local_yesterday)
        .map(|row| row.streak_len)
        .unwrap_or(0);

    let binge_row: Option<BingeDayRow> = sqlx::query_as(
        "SELECT date(datetime(watched_at, printf('%+d minutes', -$3))) AS day, COUNT(*) AS count
         FROM viewing_events
         WHERE profile_id = $1 AND event_type IN ('watched','rewatched') AND watched_at >= $2
         GROUP BY day
         ORDER BY count DESC, day DESC
         LIMIT 1",
    )
    .bind(profile_id)
    .bind(since)
    .bind(tz_offset_minutes)
    .fetch_optional(pool)
    .await
    .map_err(ApiError::from)?;

    // tz_offset_minutes is bound twice ($3, $4) rather than reusing $3 in
    // both CAST expressions — sqlx/SQLite numbered parameters can be reused
    // by number, but binding each occurrence explicitly avoids relying on
    // that being the case here.
    let heatmap_rows: Vec<HeatmapRow> = sqlx::query_as(
        "SELECT CAST(strftime('%w', datetime(watched_at, printf('%+d minutes', -$3))) AS INTEGER) AS day_of_week,
                CAST(strftime('%H', datetime(watched_at, printf('%+d minutes', -$4))) AS INTEGER) AS hour,
                COUNT(*) AS count
         FROM viewing_events
         WHERE profile_id = $1 AND event_type IN ('watched','rewatched') AND watched_at >= $2
         GROUP BY day_of_week, hour",
    )
    .bind(profile_id)
    .bind(since)
    .bind(tz_offset_minutes)
    .bind(tz_offset_minutes)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;

    let mut heatmap = Vec::with_capacity(7 * 24);
    for day in 0..7 {
        for hour in 0..24 {
            let count = heatmap_rows
                .iter()
                .find(|row| row.day_of_week == day && row.hour == hour)
                .map(|row| row.count)
                .unwrap_or(0);
            heatmap.push(HeatmapBucket { day, hour, count });
        }
    }

    Ok(ActivityStats {
        current_streak_days,
        longest_streak_days,
        biggest_binge_day: binge_row.map(|row| BiggestBingeDay {
            day: row.day,
            count: row.count,
        }),
        heatmap,
    })
}
