//! The favourite genre of one calendar year, in one aggregate query.
//!
//! The Wrapped summary used to read the *whole* library to find it: for every
//! library item it scanned the year's events (`events.some(...)`) and counted
//! the genres of the items that matched — O(library x events) in TypeScript,
//! after shipping every library row over IPC. The rule is unchanged and
//! encoded here exactly:
//!
//! - an item counts when it has at least one *active* event in
//!   `[range_start, range_end)`: the same current-state rule as every other
//!   statistic (see `active_events.rs`), so a watch that was later undone
//!   (an `unwatched` after it) no longer counts;
//! - an item contributes each of its genres once per occurrence in its list;
//! - the winner is the genre with the highest count; a tie goes to the genre
//!   met first when the library is walked in its listing order
//!   (`updated_at DESC, media_id DESC, media_type DESC`, genres in stored
//!   order), which is what a stable sort over insertion-ordered counts gave.

use sqlx::SqlitePool;

use crate::error::ApiError;

pub(in crate::stats) async fn get_year_favourite_genre_impl(
    pool: &SqlitePool,
    profile_id: &str,
    range_start: &str,
    range_end: &str,
) -> Result<Option<String>, ApiError> {
    sqlx::query_scalar(concat!(
        active_events_cte!(),
        ",
         watched AS (
             SELECT DISTINCT media_id, media_type
             FROM active
             WHERE watched_at >= $2
               AND watched_at < $3
         ),
         ranked AS (
             SELECT g.value AS genre,
                    ROW_NUMBER() OVER (
                        ORDER BY li.updated_at DESC, li.media_id DESC, li.media_type DESC,
                                 CAST(g.key AS INTEGER)
                    ) AS position
             FROM watched w
             JOIN library_items li
               ON li.profile_id = $1
              AND li.media_id = w.media_id
              AND li.media_type = w.media_type
             JOIN json_each(CASE WHEN json_valid(li.genres) THEN li.genres ELSE '[]' END) g
               ON g.type = 'text'
         )
         SELECT genre FROM ranked
         GROUP BY genre
         ORDER BY COUNT(*) DESC, MIN(position) ASC
         LIMIT 1"
    ))
    .bind(profile_id)
    .bind(range_start)
    .bind(range_end)
    .fetch_optional(pool)
    .await
    .map_err(ApiError::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn migrated_pool() -> SqlitePool {
        crate::test_support::migrated_pool_with_connections(2).await
    }

    const START: &str = "2026-01-01T00:00:00.000Z";
    const END: &str = "2027-01-01T00:00:00.000Z";

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

    async fn add_item(
        pool: &SqlitePool,
        profile: &str,
        id: i64,
        kind: &str,
        genres: &str,
        at: &str,
    ) {
        sqlx::query(
            "INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, genres, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 'Title', $5, $6, $6)",
        )
        .bind(format!("{profile}-{kind}-{id}"))
        .bind(profile)
        .bind(id)
        .bind(kind)
        .bind(genres)
        .bind(at)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn add_event(
        pool: &SqlitePool,
        profile: &str,
        id: i64,
        kind: &str,
        event_type: &str,
        watched_at: &str,
        serial: usize,
    ) {
        sqlx::query(
            "INSERT INTO viewing_events (uuid, profile_id, media_id, media_type, title, event_type, watched_at, created_at)
             VALUES ($1, $2, $3, $4, 'Title', $5, $6, $6)",
        )
        .bind(format!("event-{serial}"))
        .bind(profile)
        .bind(id)
        .bind(kind)
        .bind(event_type)
        .bind(watched_at)
        .execute(pool)
        .await
        .unwrap();
    }

    /// The previous TypeScript computation, ported literally: walk the
    /// library in listing order, keep the items with a matching event among the
    /// year's events that were not undone, count genres in a map that remembers
    /// insertion order, stable-sort by count descending, take the first.
    async fn previous_implementation(pool: &SqlitePool, profile: &str) -> Option<String> {
        let library: Vec<(i64, String, String)> = sqlx::query_as(
            "SELECT media_id, media_type, genres FROM library_items WHERE profile_id = $1
             ORDER BY updated_at DESC, media_id DESC, media_type DESC",
        )
        .bind(profile)
        .fetch_all(pool)
        .await
        .unwrap();
        // The events still standing: everything after a title's last
        // `unwatched`, an `unwatched` itself never counting.
        let logged: Vec<(i64, String, String, String)> = sqlx::query_as(
            "SELECT media_id, media_type, event_type, watched_at FROM viewing_events
             WHERE profile_id = $1 ORDER BY insert_seq",
        )
        .bind(profile)
        .fetch_all(pool)
        .await
        .unwrap();
        let mut events: Vec<(i64, String)> = Vec::new();
        for (media_id, media_type, _, _) in &logged {
            let of_title: Vec<&(i64, String, String, String)> = logged
                .iter()
                .filter(|e| e.0 == *media_id && e.1 == *media_type)
                .collect();
            let cut = of_title
                .iter()
                .rposition(|e| e.2 == "unwatched")
                .map_or(0, |at| at + 1);
            if of_title[cut..]
                .iter()
                .any(|e| e.3.as_str() >= START && e.3.as_str() < END)
            {
                events.push((*media_id, media_type.clone()));
            }
        }

        let mut counts: Vec<(String, usize)> = Vec::new();
        for (media_id, media_type, genres) in library {
            if !events
                .iter()
                .any(|(id, kind)| *id == media_id && *kind == media_type)
            {
                continue;
            }
            for genre in serde_json::from_str::<Vec<String>>(&genres).unwrap() {
                match counts.iter_mut().find(|(name, _)| *name == genre) {
                    Some(entry) => entry.1 += 1,
                    None => counts.push((genre, 1)),
                }
            }
        }
        counts.sort_by_key(|entry| std::cmp::Reverse(entry.1)); // stable, like Array#sort
        counts.into_iter().next().map(|(genre, _)| genre)
    }

    #[tokio::test]
    async fn is_none_without_a_qualifying_event() {
        let pool = migrated_pool().await;
        add_item(
            &pool,
            "default",
            1,
            "movie",
            r#"["Drama"]"#,
            "2026-01-01T00:00:00.000Z",
        )
        .await;
        assert_eq!(
            get_year_favourite_genre_impl(&pool, "default", START, END)
                .await
                .unwrap(),
            None
        );

        // Only a rollback, and an event outside the year: still nothing.
        add_event(
            &pool,
            "default",
            1,
            "movie",
            "unwatched",
            "2026-05-01T00:00:00.000Z",
            1,
        )
        .await;
        add_event(
            &pool,
            "default",
            1,
            "movie",
            "watched",
            "2025-12-31T23:59:59.999Z",
            2,
        )
        .await;
        add_event(&pool, "default", 1, "movie", "watched", END, 3).await;
        assert_eq!(
            get_year_favourite_genre_impl(&pool, "default", START, END)
                .await
                .unwrap(),
            None
        );
    }

    #[tokio::test]
    async fn an_undone_watch_no_longer_counts() {
        let pool = migrated_pool().await;
        add_item(
            &pool,
            "default",
            1,
            "movie",
            r#"["Drama"]"#,
            "2026-01-02T00:00:00.000Z",
        )
        .await;
        add_item(
            &pool,
            "default",
            2,
            "movie",
            r#"["Comedy"]"#,
            "2026-01-01T00:00:00.000Z",
        )
        .await;
        add_event(
            &pool,
            "default",
            1,
            "movie",
            "watched",
            "2026-02-01T00:00:00.000Z",
            1,
        )
        .await;
        add_event(
            &pool,
            "default",
            1,
            "movie",
            "unwatched",
            "2026-02-02T00:00:00.000Z",
            2,
        )
        .await;
        add_event(
            &pool,
            "default",
            2,
            "movie",
            "watched",
            "2026-02-01T00:00:00.000Z",
            3,
        )
        .await;

        assert_eq!(
            get_year_favourite_genre_impl(&pool, "default", START, END)
                .await
                .unwrap(),
            Some("Comedy".to_string())
        );
    }

    #[tokio::test]
    async fn counts_each_item_once_however_many_events_it_has() {
        let pool = migrated_pool().await;
        // Item 1 is watched five times, items 2 and 3 once each: Drama has
        // count 1 + 0, Comedy 2 — events must not weigh in.
        add_item(
            &pool,
            "default",
            1,
            "series",
            r#"["Drama"]"#,
            "2026-01-03T00:00:00.000Z",
        )
        .await;
        add_item(
            &pool,
            "default",
            2,
            "movie",
            r#"["Comedy"]"#,
            "2026-01-02T00:00:00.000Z",
        )
        .await;
        add_item(
            &pool,
            "default",
            3,
            "movie",
            r#"["Comedy"]"#,
            "2026-01-01T00:00:00.000Z",
        )
        .await;
        for serial in 0..5 {
            add_event(
                &pool,
                "default",
                1,
                "series",
                "watched",
                "2026-02-01T00:00:00.000Z",
                serial,
            )
            .await;
        }
        add_event(
            &pool,
            "default",
            2,
            "movie",
            "watched",
            "2026-02-01T00:00:00.000Z",
            10,
        )
        .await;
        add_event(
            &pool,
            "default",
            3,
            "movie",
            "rewatched",
            "2026-02-01T00:00:00.000Z",
            11,
        )
        .await;

        assert_eq!(
            get_year_favourite_genre_impl(&pool, "default", START, END)
                .await
                .unwrap(),
            Some("Comedy".to_string())
        );
    }

    #[tokio::test]
    async fn a_movie_and_a_series_with_the_same_id_are_distinct_titles() {
        let pool = migrated_pool().await;
        add_item(
            &pool,
            "default",
            7,
            "movie",
            r#"["Horror"]"#,
            "2026-01-02T00:00:00.000Z",
        )
        .await;
        add_item(
            &pool,
            "default",
            7,
            "series",
            r#"["Western"]"#,
            "2026-01-01T00:00:00.000Z",
        )
        .await;
        add_event(
            &pool,
            "default",
            7,
            "series",
            "watched",
            "2026-03-01T00:00:00.000Z",
            1,
        )
        .await;

        assert_eq!(
            get_year_favourite_genre_impl(&pool, "default", START, END)
                .await
                .unwrap(),
            Some("Western".to_string())
        );
    }

    #[tokio::test]
    async fn ignores_another_profiles_library_and_events() {
        let pool = migrated_pool().await;
        sqlx::query("INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('other', 'Other', 't', 't')")
            .execute(&pool)
            .await
            .unwrap();
        add_item(
            &pool,
            "default",
            1,
            "movie",
            r#"["Drama"]"#,
            "2026-01-01T00:00:00.000Z",
        )
        .await;
        add_item(
            &pool,
            "other",
            1,
            "movie",
            r#"["Horror"]"#,
            "2026-01-01T00:00:00.000Z",
        )
        .await;
        add_event(
            &pool,
            "default",
            1,
            "movie",
            "watched",
            "2026-03-01T00:00:00.000Z",
            1,
        )
        .await;
        add_event(
            &pool,
            "other",
            1,
            "movie",
            "watched",
            "2026-03-01T00:00:00.000Z",
            2,
        )
        .await;
        add_event(
            &pool,
            "other",
            1,
            "movie",
            "watched",
            "2026-03-02T00:00:00.000Z",
            3,
        )
        .await;

        assert_eq!(
            get_year_favourite_genre_impl(&pool, "default", START, END)
                .await
                .unwrap(),
            Some("Drama".to_string())
        );
    }

    /// Same answer as the previous client-side computation on seeded data
    /// full of ties (few genres, identical timestamps, repeated genres inside
    /// one item, events of every type around the year boundaries).
    #[tokio::test]
    async fn matches_the_previous_client_side_computation_on_seeded_libraries() {
        const GENRES: [&str; 6] = ["Drama", "Comedy", "Action", "Horror", "Sci-Fi", "Romance"];
        const TIMES: [&str; 4] = [
            "2026-01-01T00:00:00.000Z",
            "2026-01-01T00:00:00.000Z",
            "2026-02-10T08:00:00.000Z",
            "2025-06-01T00:00:00.000Z",
        ];
        const WATCH_TIMES: [&str; 6] = [
            "2025-12-31T23:59:59.999Z",
            "2026-01-01T00:00:00.000Z",
            "2026-06-15T12:00:00.000Z",
            "2026-12-31T23:59:59.999Z",
            "2027-01-01T00:00:00.000Z",
            "2026-09-09T09:09:09.000Z",
        ];

        let mut non_trivial = 0;
        for seed in 1..=40_u64 {
            let pool = migrated_pool().await;
            let mut rng = Rng(seed * 7919);
            let mut serial = 0;
            let items = 5 + rng.below(40) as i64;
            for id in 1..=items {
                let kind = if rng.below(2) == 0 { "movie" } else { "series" };
                let genre_count = rng.below(4);
                let genres: Vec<&str> = (0..genre_count)
                    .map(|_| GENRES[rng.below(GENRES.len() as u64) as usize])
                    .collect();
                add_item(
                    &pool,
                    "default",
                    id,
                    kind,
                    &serde_json::to_string(&genres).unwrap(),
                    TIMES[rng.below(TIMES.len() as u64) as usize],
                )
                .await;
                for _ in 0..rng.below(4) {
                    serial += 1;
                    let event_type =
                        ["watched", "watched", "unwatched", "rewatched"][rng.below(4) as usize];
                    add_event(
                        &pool,
                        "default",
                        id,
                        kind,
                        event_type,
                        WATCH_TIMES[rng.below(WATCH_TIMES.len() as u64) as usize],
                        serial,
                    )
                    .await;
                }
            }

            let expected = previous_implementation(&pool, "default").await;
            let actual = get_year_favourite_genre_impl(&pool, "default", START, END)
                .await
                .unwrap();
            assert_eq!(actual, expected, "seed {seed}");
            if expected.is_some() {
                non_trivial += 1;
            }
        }
        assert!(non_trivial >= 30, "only {non_trivial} seeds had an answer");
    }
}
