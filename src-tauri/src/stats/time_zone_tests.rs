//! Every statistic buckets each event in the viewer's *real* time zone (an
//! IANA identifier such as `Europe/Paris`), the offset in force at that
//! event's own instant — not in one fixed offset taken from "now". With a
//! fixed offset, the watches of the other half of the year in a daylight
//! saving zone land an hour off and can fall on the wrong day, month or year.
//!
//! The instants below straddle the daylight-saving changes of Europe/Paris
//! (29 March and 25 October 2026) and America/New_York (8 March and 1
//! November 2026) and the 31 December -> 1 January boundary.

use sqlx::SqlitePool;
use sqlx::sqlite::SqlitePoolOptions;
use tauri::Manager;

use super::queries::activity::get_activity_stats_impl;
use super::queries::local_time::LocalClock;
use super::queries::overview::{get_stats_overview_impl, list_yearly_activity_impl};
use super::queries::ratings::get_rating_distribution_impl;
use super::queries::recap::get_monthly_recap_impl;
use super::queries::rewatch::get_rewatch_stats_impl;
use super::queries::viewing_events::list_on_this_day_events_impl;

const SINCE: &str = "2000-01-01T00:00:00.000Z";

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

fn zone(name: &str) -> LocalClock {
    LocalClock::from_request(0, Some(name)).unwrap()
}

/// One movie watched at `at`, a distinct title per call (id from the date),
/// rated 8 in the library so the rating averages have something to bucket.
async fn watch(pool: &SqlitePool, id: i64, at: &str) {
    sqlx::query(
        "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, created_at)
         VALUES ($1, 'default', $2, 'movie', $3, 'watched', $4, 60, $4)",
    )
    .bind(format!("ev-{id}"))
    .bind(id)
    .bind(format!("Movie {id}"))
    .bind(at)
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, genres, user_rating, status, created_at, updated_at)
         VALUES ($1, 'default', $2, 'movie', $3, '[]', 8.0, 'completed', 'now', 'now')",
    )
    .bind(format!("li-{id}"))
    .bind(id)
    .bind(format!("Movie {id}"))
    .execute(pool)
    .await
    .unwrap();
}

async fn watches(pool: &SqlitePool, instants: &[&str]) {
    for (index, at) in instants.iter().enumerate() {
        watch(pool, 100 + index as i64, at).await;
    }
}

fn labels(from: &str, to: &str) -> Vec<String> {
    // Every "YYYY-MM" from `from` to `to`, inclusive.
    let (mut year, mut month): (i32, u32) =
        (from[..4].parse().unwrap(), from[5..7].parse().unwrap());
    let end: (i32, u32) = (to[..4].parse().unwrap(), to[5..7].parse().unwrap());
    let mut out = Vec::new();
    while (year, month) <= end {
        out.push(format!("{year}-{month:02}"));
        if month == 12 {
            (year, month) = (year + 1, 1);
        } else {
            month += 1;
        }
    }
    out
}

async fn monthly_counts(
    pool: &SqlitePool,
    clock: LocalClock,
    from: &str,
    to: &str,
) -> Vec<(String, i64)> {
    get_stats_overview_impl(pool, "default", SINCE, &labels(from, to), clock)
        .await
        .unwrap()
        .monthly_activity
        .into_iter()
        .filter(|bucket| bucket.count > 0)
        .map(|bucket| (bucket.month, bucket.count))
        .collect()
}

#[tokio::test]
async fn a_summer_watch_is_bucketed_with_the_summer_offset_even_when_read_in_winter() {
    let pool = migrated_pool().await;
    // 00:30 on 1 August in Paris (CEST, UTC+2) — but 23:30 on 31 July at the
    // winter offset (UTC+1) a fixed "now" offset taken in January would use.
    watches(
        &pool,
        &[
            "2026-07-31T22:30:00.000Z",
            // 23:30 on 31 January in Paris (CET): still January; at the
            // summer offset (UTC+2) it would already be February.
            "2026-01-31T22:30:00.000Z",
        ],
    )
    .await;

    let paris = monthly_counts(&pool, zone("Europe/Paris"), "2026-01", "2026-08").await;
    assert_eq!(
        paris,
        vec![("2026-01".to_string(), 1), ("2026-08".to_string(), 1)]
    );

    // The fixed offsets of either season each get one of the two wrong.
    let winter_offset = monthly_counts(&pool, LocalClock::from(-60), "2026-01", "2026-08").await;
    assert_eq!(
        winter_offset,
        vec![("2026-01".to_string(), 1), ("2026-07".to_string(), 1)]
    );
    let summer_offset = monthly_counts(&pool, LocalClock::from(-120), "2026-01", "2026-08").await;
    assert_eq!(
        summer_offset,
        vec![("2026-02".to_string(), 1), ("2026-08".to_string(), 1)]
    );
}

#[tokio::test]
async fn paris_days_follow_the_spring_forward_change() {
    let pool = migrated_pool().await;
    // 29 March 2026: clocks go from 02:00 to 03:00 in Paris (a 23-hour day).
    watches(
        &pool,
        &[
            "2026-03-28T22:59:00.000Z", // 23:59 CET on the 28th
            "2026-03-28T23:00:00.000Z", // 00:00 CET on the 29th
            "2026-03-29T00:59:00.000Z", // 01:59 CET
            "2026-03-29T01:00:00.000Z", // 03:00 CEST (02:xx never existed)
            "2026-03-29T21:59:00.000Z", // 23:59 CEST on the 29th
            "2026-03-29T22:00:00.000Z", // 00:00 CEST on the 30th
        ],
    )
    .await;

    let activity = get_activity_stats_impl(
        &pool,
        "default",
        SINCE,
        "2026-03-30T10:00:00.000Z",
        zone("Europe/Paris"),
    )
    .await
    .unwrap();

    // Four watches in the 23-hour day of the 29th, one before, one after: a
    // three-day run ending "today".
    let binge = activity.biggest_binge_day.unwrap();
    assert_eq!((binge.day.as_str(), binge.count), ("2026-03-29", 4));
    assert_eq!(activity.longest_streak_days, 3);
    assert_eq!(activity.current_streak_days, 3);
    let hour_of = |day: i64, hour: i64| {
        activity
            .heatmap
            .iter()
            .find(|bucket| bucket.day == day && bucket.hour == hour)
            .unwrap()
            .count
    };
    // 29 March 2026 is a Sunday (0): 00:xx, 01:xx, 03:xx and 23:xx.
    assert_eq!(hour_of(0, 0), 1);
    assert_eq!(hour_of(0, 1), 1);
    assert_eq!(hour_of(0, 2), 0, "the skipped hour has no watch");
    assert_eq!(hour_of(0, 3), 1);
    assert_eq!(hour_of(0, 23), 1);
}

#[tokio::test]
async fn paris_days_follow_the_fall_back_change() {
    let pool = migrated_pool().await;
    // 25 October 2026: clocks go from 03:00 back to 02:00 (a 25-hour day).
    watches(
        &pool,
        &[
            "2026-10-24T21:59:00.000Z", // 23:59 CEST on the 24th
            "2026-10-24T22:00:00.000Z", // 00:00 CEST on the 25th
            "2026-10-25T00:30:00.000Z", // 02:30 CEST
            "2026-10-25T01:30:00.000Z", // 02:30 CET (the repeated hour)
            "2026-10-25T22:59:00.000Z", // 23:59 CET on the 25th
            "2026-10-25T23:00:00.000Z", // 00:00 CET on the 26th
        ],
    )
    .await;

    let activity = get_activity_stats_impl(
        &pool,
        "default",
        SINCE,
        "2026-10-26T10:00:00.000Z",
        zone("Europe/Paris"),
    )
    .await
    .unwrap();

    let binge = activity.biggest_binge_day.unwrap();
    assert_eq!((binge.day.as_str(), binge.count), ("2026-10-25", 4));
    assert_eq!(activity.longest_streak_days, 3);
    // 25 October 2026 is a Sunday (0): the repeated 02:xx hour holds two.
    let at_two = activity
        .heatmap
        .iter()
        .find(|bucket| bucket.day == 0 && bucket.hour == 2)
        .unwrap();
    assert_eq!(at_two.count, 2);
}

#[tokio::test]
async fn new_york_changes_of_hour_and_the_new_year() {
    let pool = migrated_pool().await;
    watches(
        &pool,
        &[
            // New Year in New York (EST, UTC-5).
            "2026-01-01T04:59:00.000Z", // 23:59 on 31 December 2025
            "2026-01-01T05:00:00.000Z", // 00:00 on 1 January 2026
            // Month boundary in summer (EDT, UTC-4).
            "2026-07-01T03:59:00.000Z", // 23:59 on 30 June
            "2026-07-01T04:00:00.000Z", // 00:00 on 1 July
            // 8 March 2026 spring forward, 1 November fall back.
            "2026-03-08T06:59:00.000Z", // 01:59 EST on 8 March
            "2026-03-08T07:00:00.000Z", // 03:00 EDT
            "2026-11-01T05:30:00.000Z", // 01:30 EDT on 1 November
            "2026-11-01T06:30:00.000Z", // 01:30 EST (repeated)
            "2026-11-02T04:59:00.000Z", // 23:59 EST on 1 November
            "2026-11-02T05:00:00.000Z", // 00:00 EST on 2 November
        ],
    )
    .await;
    let new_york = zone("America/New_York");

    // Years: 2025 holds the 23:59 of New Year's Eve.
    let years = list_yearly_activity_impl(&pool, "default", new_york)
        .await
        .unwrap();
    let per_year: Vec<(i64, i64)> = years
        .iter()
        .map(|year| (year.year, year.movies_watched))
        .collect();
    assert_eq!(per_year, vec![(2025, 1), (2026, 9)]);

    // Months.
    let months = monthly_counts(&pool, new_york, "2025-12", "2026-11").await;
    assert_eq!(
        months,
        vec![
            ("2025-12".to_string(), 1),
            ("2026-01".to_string(), 1),
            ("2026-03".to_string(), 2),
            ("2026-06".to_string(), 1),
            ("2026-07".to_string(), 1),
            ("2026-11".to_string(), 4),
        ]
    );

    // The recap of November 2026: the 25-hour day of the 1st holds three,
    // the 2nd one.
    let recap = get_monthly_recap_impl(
        &pool,
        "default",
        "2026-11",
        "2026-11-01T00:00:00.000Z",
        "2026-12-01T00:00:00.000Z",
        new_york,
    )
    .await
    .unwrap();
    assert_eq!(recap.movies_watched, 4);
    let binge = recap.biggest_binge_day.unwrap();
    assert_eq!((binge.day.as_str(), binge.count), ("2026-11-01", 3));
}

#[tokio::test]
async fn paris_new_year_ratings_and_on_this_day_follow_the_zone() {
    let pool = migrated_pool().await;
    watches(
        &pool,
        &[
            "2025-12-31T22:59:00.000Z", // 23:59 CET on 31 December 2025
            "2025-12-31T23:00:00.000Z", // 00:00 CET on 1 January 2026
        ],
    )
    .await;
    let paris = zone("Europe/Paris");

    let ratings = get_rating_distribution_impl(&pool, "default", SINCE, paris)
        .await
        .unwrap();
    let years: Vec<(&str, i64)> = ratings
        .average_by_year
        .iter()
        .map(|period| (period.period.as_str(), period.count))
        .collect();
    assert_eq!(years, vec![("2025", 1), ("2026", 1)]);
    let months: Vec<(&str, i64)> = ratings
        .average_by_month
        .iter()
        .map(|period| (period.period.as_str(), period.count))
        .collect();
    assert_eq!(months, vec![("2025-12", 1), ("2026-01", 1)]);

    // "On this day" a year later, on 1 January 2027 at 10:00 in Paris: only
    // the watch that happened on 1 January (local) matches.
    let on_this_day =
        list_on_this_day_events_impl(&pool, "default", "2027-01-01T09:00:00.000Z", paris)
            .await
            .unwrap();
    assert_eq!(on_this_day.len(), 1);
    assert_eq!(on_this_day[0].watched_at, "2025-12-31T23:00:00.000Z");
}

#[tokio::test]
async fn rewatch_activity_is_bucketed_in_the_zone_too() {
    let pool = migrated_pool().await;
    watch(&pool, 1, "2026-01-01T10:00:00.000Z").await;
    // A rewatch at 00:30 CEST on 1 August (22:30 UTC on 31 July).
    sqlx::query(
        "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, duration_minutes, created_at)
         VALUES ('rw', 'default', 1, 'movie', 'Movie 1', 'rewatched', '2026-07-31T22:30:00.000Z', 60, '2026-07-31T22:30:00.000Z')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let stats = get_rewatch_stats_impl(
        &pool,
        "default",
        SINCE,
        &labels("2026-07", "2026-08"),
        zone("Europe/Paris"),
    )
    .await
    .unwrap();

    let months: Vec<(String, i64)> = stats
        .rewatch_activity
        .into_iter()
        .map(|bucket| (bucket.month, bucket.count))
        .collect();
    assert_eq!(
        months,
        vec![("2026-07".to_string(), 0), ("2026-08".to_string(), 1)]
    );
}

#[test]
fn an_unknown_or_empty_zone_is_refused_and_no_zone_keeps_the_fixed_offset() {
    assert!(LocalClock::from_request(0, Some("Mars/Olympus_Mons")).is_err());
    assert!(LocalClock::from_request(0, Some("")).is_err());
    // Injection-shaped input is just an unknown name.
    assert!(LocalClock::from_request(0, Some("Europe/Paris'; DROP TABLE x;--")).is_err());
    let refused = LocalClock::from_request(0, Some("Nowhere/Land")).unwrap_err();
    assert_eq!(refused.status, Some(400));

    // No zone: the legacy fixed offset (UTC-1 here, JS-style -60 means UTC+1).
    let fixed = LocalClock::from_request(-60, None).unwrap();
    assert_eq!(
        fixed.day("2026-07-31T23:30:00.000Z").unwrap().to_string(),
        "2026-08-01"
    );
    // A zone wins over a stale offset.
    let named = LocalClock::from_request(-60, Some("Europe/Paris")).unwrap();
    assert_eq!(
        named.day("2026-07-31T22:30:00.000Z").unwrap().to_string(),
        "2026-08-01"
    );
}

/// What `Intl.DateTimeFormat().resolvedOptions().timeZone` reports depends on
/// the operating system and its tz database vintage: a zone a runtime can name
/// must never be a 400, or the statistics page would be unusable for that
/// viewer (old aliases, the renamed zones, half-hour and 45-minute offsets).
#[test]
fn the_identifiers_runtimes_report_are_all_known() {
    for name in [
        "UTC",
        "Etc/UTC",
        "GMT",
        "Europe/Paris",
        "Europe/Kyiv",
        "Europe/Kiev",
        "America/Ciudad_Juarez",
        "America/Argentina/Buenos_Aires",
        "America/Buenos_Aires",
        "Asia/Calcutta",
        "Asia/Kolkata",
        "Asia/Katmandu",
        "Pacific/Chatham",
        "Pacific/Kiritimati",
        "Australia/Lord_Howe",
        "US/Pacific",
        "Etc/GMT+5",
    ] {
        assert!(LocalClock::from_request(0, Some(name)).is_ok(), "{name}");
    }
    // Offsets of those zones are applied at each instant, not only whole hours.
    let kathmandu = LocalClock::from_request(0, Some("Asia/Kathmandu")).unwrap();
    assert_eq!(
        kathmandu
            .local("2026-06-30T18:20:00.000Z")
            .unwrap()
            .to_string(),
        "2026-07-01 00:05:00"
    );
}

/// The commands accept the zone next to the legacy offset: a client that
/// sends only the offset keeps working, one that sends the zone gets the
/// real-zone figures, and a bad zone is a 400 — never a silent fallback.
#[tokio::test]
async fn the_commands_take_an_optional_time_zone_next_to_the_legacy_offset() {
    let pool = migrated_pool().await;
    watches(&pool, &["2026-07-31T22:30:00.000Z"]).await;
    let app = tauri::test::mock_app();
    app.manage(pool.clone());
    let labels = labels("2026-07", "2026-08");

    let legacy =
        crate::stats::get_stats_overview(SINCE.to_string(), labels.clone(), -60, None, app.state())
            .await
            .unwrap();
    assert_eq!(
        legacy
            .monthly_activity
            .iter()
            .map(|bucket| bucket.count)
            .collect::<Vec<_>>(),
        vec![1, 0]
    );

    let with_zone = crate::stats::get_stats_overview(
        SINCE.to_string(),
        labels.clone(),
        -60,
        Some("Europe/Paris".to_string()),
        app.state(),
    )
    .await
    .unwrap();
    assert_eq!(
        with_zone
            .monthly_activity
            .iter()
            .map(|bucket| bucket.count)
            .collect::<Vec<_>>(),
        vec![0, 1]
    );

    let refused = crate::stats::get_stats_overview(
        SINCE.to_string(),
        labels,
        -60,
        Some("Not/AZone".to_string()),
        app.state(),
    )
    .await
    .unwrap_err();
    assert_eq!(refused.status, Some(400));

    // Every other zone-aware command takes it too.
    let yearly =
        crate::stats::list_yearly_activity(-60, Some("America/New_York".to_string()), app.state())
            .await
            .unwrap();
    assert_eq!(yearly.len(), 1);
}
