//! `list_stale_planned_impl` must return exactly what the Today Hub used to
//! compute from a full library read: planned items whose last update is at
//! least 30 whole days old (`floor((now - updatedAt) / day) >= 30`), in the
//! library's own listing order, first N of them.

use sqlx::SqlitePool;

use super::queries::{list_impl, list_stale_planned_impl};
use super::status_transitions_tests::migrated_pool;

const DAY_MS: i64 = 24 * 60 * 60 * 1000;
const STALE_DAYS: i64 = 30;
const NOW_MS: i64 = 1_790_000_000_000; // 2026-09-21T14:13:20Z

/// `2026-09-21T14:13:20.000Z` from epoch milliseconds (proleptic Gregorian,
/// Howard Hinnant's civil-from-days).
fn iso(ms: i64) -> String {
    let days = ms.div_euclid(DAY_MS);
    let in_day = ms.rem_euclid(DAY_MS);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { year + 1 } else { year };
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        in_day / 3_600_000,
        in_day / 60_000 % 60,
        in_day / 1_000 % 60,
        in_day % 1_000
    )
}

struct Rng(u64);
impl Rng {
    fn below(&mut self, bound: u64) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        (self.0 >> 33) % bound
    }
}

async fn insert(
    pool: &SqlitePool,
    profile: &str,
    id: i64,
    kind: &str,
    status: &str,
    updated_ms: i64,
) {
    sqlx::query(
        "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'Title', $5, $6, $6)",
    )
    .bind(format!("{profile}-{kind}-{id}"))
    .bind(profile)
    .bind(id)
    .bind(kind)
    .bind(status)
    .bind(iso(updated_ms))
    .execute(pool)
    .await
    .unwrap();
}

#[test]
fn iso_formats_known_instants() {
    assert_eq!(iso(0), "1970-01-01T00:00:00.000Z");
    assert_eq!(iso(1_790_000_000_123), "2026-09-21T14:13:20.123Z");
    assert_eq!(iso(951_782_400_000), "2000-02-29T00:00:00.000Z");
}

/// The previous client-side rule, literally: the full list in listing order,
/// `status === "planned"`, `floor((now - updatedAt) / DAY) >= 30`, then the
/// card's `slice(0, limit)`.
async fn previous_implementation(
    pool: &SqlitePool,
    now_ms: i64,
    limit: usize,
) -> Vec<(i64, String)> {
    let all = list_impl(pool, "default", None).await.unwrap();
    all.into_iter()
        .filter(|item| item.status.as_db_str() == "planned")
        .filter(|item| {
            let updated = parse_iso(&item.updated_at);
            (now_ms - updated).div_euclid(DAY_MS) >= STALE_DAYS
        })
        .map(|item| (item.media_id, item.media_type.as_db_str().to_string()))
        .take(limit)
        .collect()
}

/// Inverse of `iso` for the fixed `YYYY-MM-DDTHH:MM:SS.mmmZ` shape.
fn parse_iso(text: &str) -> i64 {
    let n = |range: std::ops::Range<usize>| text[range].parse::<i64>().unwrap();
    let (year, month, day) = (n(0..4), n(5..7), n(8..10));
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400);
    let mp = if month > 2 { month - 3 } else { month + 9 };
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    days * DAY_MS + n(11..13) * 3_600_000 + n(14..16) * 60_000 + n(17..19) * 1_000 + n(20..23)
}

#[test]
fn parse_iso_round_trips() {
    for ms in [0, 1_790_000_000_123, 951_782_400_000, 1_234_567_890_001] {
        assert_eq!(parse_iso(&iso(ms)), ms);
    }
}

fn threshold(now_ms: i64) -> String {
    iso(now_ms - STALE_DAYS * DAY_MS)
}

#[tokio::test]
async fn the_thirty_day_boundary_is_inclusive_to_the_millisecond() {
    let pool = migrated_pool().await;
    let limit = NOW_MS - STALE_DAYS * DAY_MS;
    insert(&pool, "default", 1, "movie", "planned", limit).await; // exactly 30 days: stale
    insert(&pool, "default", 2, "movie", "planned", limit + 1).await; // 1 ms short: not stale
    insert(&pool, "default", 3, "movie", "planned", limit - 1).await; // older: stale

    let ids: Vec<i64> = list_stale_planned_impl(&pool, "default", &threshold(NOW_MS), 10)
        .await
        .unwrap()
        .into_iter()
        .map(|item| item.media_id)
        .collect();
    assert_eq!(ids, vec![1, 3]);
    let expected = previous_implementation(&pool, NOW_MS, 10).await;
    assert_eq!(expected.iter().map(|(id, _)| *id).collect::<Vec<_>>(), ids);
}

#[tokio::test]
async fn only_planned_items_of_the_active_profile_count() {
    let pool = migrated_pool().await;
    sqlx::query("INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('other', 'Other', 't', 't')")
        .execute(&pool)
        .await
        .unwrap();
    let old = NOW_MS - 90 * DAY_MS;
    insert(&pool, "default", 1, "movie", "planned", old).await;
    insert(&pool, "default", 2, "movie", "completed", old).await;
    insert(&pool, "default", 3, "series", "watching", old).await;
    insert(&pool, "default", 4, "series", "dropped", old).await;
    insert(&pool, "other", 5, "movie", "planned", old).await;

    let ids: Vec<i64> = list_stale_planned_impl(&pool, "default", &threshold(NOW_MS), 10)
        .await
        .unwrap()
        .into_iter()
        .map(|item| item.media_id)
        .collect();
    assert_eq!(ids, vec![1]);
}

#[tokio::test]
async fn the_limit_is_clamped_to_a_sane_range() {
    let pool = migrated_pool().await;
    for id in 1..=5 {
        insert(
            &pool,
            "default",
            id,
            "movie",
            "planned",
            NOW_MS - 60 * DAY_MS - id,
        )
        .await;
    }
    let one = list_stale_planned_impl(&pool, "default", &threshold(NOW_MS), 0)
        .await
        .unwrap();
    assert_eq!(one.len(), 1, "a limit below 1 still returns one row");
    let negative = list_stale_planned_impl(&pool, "default", &threshold(NOW_MS), -7)
        .await
        .unwrap();
    assert_eq!(negative.len(), 1);
}

/// Same rows, same order as the previous full-read computation, on seeded
/// libraries: mixed statuses, tied timestamps (ordered by media id then
/// type), items right around the 30-day boundary, several limits.
#[tokio::test]
async fn matches_the_previous_client_side_computation_on_seeded_libraries() {
    let mut non_trivial = 0;
    for seed in 1..=30_u64 {
        let pool = migrated_pool().await;
        let mut rng = Rng(seed * 104_729);
        let items = 10 + rng.below(60) as i64;
        let tied_times = [
            NOW_MS - 45 * DAY_MS,
            NOW_MS - 31 * DAY_MS,
            NOW_MS - STALE_DAYS * DAY_MS,
            NOW_MS - STALE_DAYS * DAY_MS + 1,
            NOW_MS - 2 * DAY_MS,
        ];
        for id in 1..=items {
            let kind = if rng.below(2) == 0 { "movie" } else { "series" };
            let status = [
                "planned",
                "planned",
                "watching",
                "completed",
                "paused",
                "dropped",
            ][rng.below(6) as usize];
            let updated = if rng.below(3) == 0 {
                tied_times[rng.below(tied_times.len() as u64) as usize]
            } else {
                NOW_MS - rng.below(400 * DAY_MS as u64) as i64
            };
            insert(&pool, "default", id, kind, status, updated).await;
            // A same-id item of the other type, to exercise the type tiebreak.
            if rng.below(5) == 0 {
                let other = if kind == "movie" { "series" } else { "movie" };
                insert(&pool, "default", id, other, "planned", updated).await;
            }
        }

        for limit in [1_usize, 4, 25, 100] {
            let expected = previous_implementation(&pool, NOW_MS, limit).await;
            let actual: Vec<(i64, String)> =
                list_stale_planned_impl(&pool, "default", &threshold(NOW_MS), limit as i64)
                    .await
                    .unwrap()
                    .into_iter()
                    .map(|item| (item.media_id, item.media_type.as_db_str().to_string()))
                    .collect();
            assert_eq!(actual, expected, "seed {seed}, limit {limit}");
            if limit == 25 && !expected.is_empty() {
                non_trivial += 1;
            }
        }
    }
    assert!(
        non_trivial >= 25,
        "only {non_trivial} seeds had stale items"
    );
}
