import type { Migration } from "./types";

// Cross-checked every repository query against the indexes actually
// declared for it (CREATE/DROP INDEX are always safe — unlike FK/CHECK
// constraints, they can't fail because of existing data).
export const migration: Migration = {
  version: 6,
  name: "index cleanup: fix unserved queries, drop dead indexes",
  statements: [
    // library_items: list() does `WHERE profile_id = ? ORDER BY updated_at
    // DESC` with no status filter. idx_library_profile_status sorts by
    // (profile_id, status, updated_at) — without a status predicate that
    // doesn't give a globally profile-sorted-by-updated_at order, so this
    // query was never actually served by an index.
    "CREATE INDEX IF NOT EXISTS idx_library_profile_updated ON library_items(profile_id, updated_at DESC)",

    // profile_seen_movies has no secondary index at all beyond its PK
    // (profile_id, movie_id) — listSeenMovies()'s `ORDER BY watched_at
    // DESC` was an unindexed sort.
    "CREATE INDEX IF NOT EXISTS idx_profile_seen_movies_watched ON profile_seen_movies(profile_id, watched_at DESC)",

    // availability_alerts: idx_availability_alert_profile(profile_id,
    // enabled) doesn't match listAlerts()'s actual query — `enabled` is
    // never filtered in SQL (availabilityMonitor filters it in JS after
    // fetching), the query orders by created_at DESC instead.
    "DROP INDEX IF EXISTS idx_availability_alert_profile",
    "CREATE INDEX IF NOT EXISTS idx_availability_alerts_profile_created ON availability_alerts(profile_id, created_at DESC)",

    // idx_library_favourite(profile_id, favourite): `favourite` is never
    // filtered in SQL anywhere in the app (library-repository.ts always
    // fetches the full list; favourites are filtered client-side) — this
    // index only added write overhead.
    "DROP INDEX IF EXISTS idx_library_favourite",

    // idx_activity_log_timestamp(timestamp DESC): superseded by migration
    // 5's idx_activity_log_profile_timestamp — every activity_log read now
    // filters by profile_id first, nothing queries by timestamp alone.
    "DROP INDEX IF EXISTS idx_activity_log_timestamp",
  ],
};
