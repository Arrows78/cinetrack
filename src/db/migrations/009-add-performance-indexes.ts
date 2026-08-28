import type { Migration } from "./types";

// These indexes mirror the production Rust migration. The TypeScript
// migration path is test-only, but keeping both paths aligned ensures local
// SQLite contract tests exercise the same query shape as the desktop app.
export const migration: Migration = {
  version: 16,
  name: "add indexes for large-library statistics",
  statements: [
    "CREATE INDEX idx_viewing_events_profile_media_episode_date ON viewing_events(profile_id, media_id, media_type, episode_id, watched_at DESC, created_at DESC)",
    "CREATE INDEX idx_viewing_events_profile_media_date ON viewing_events(profile_id, media_id, media_type, watched_at DESC)",
    "CREATE INDEX idx_library_profile_type_status_completed ON library_items(profile_id, media_type, status, completed_at ASC)",
    "CREATE INDEX idx_library_profile_rating ON library_items(profile_id, user_rating) WHERE user_rating IS NOT NULL",
  ],
};
