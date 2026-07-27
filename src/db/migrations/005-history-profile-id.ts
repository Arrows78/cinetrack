import type { Migration } from "./types";

// history-repository.ts used to scope activity_log rows to a profile via
// json_extract(metadata, '$.profileId') — no index is possible on that
// expression, so every history read/delete was a full table scan. Add a
// real column, backfill it from the same metadata field (defaulting to
// 'default' for legacy rows with no profileId at all, matching the old
// query's fallback), and index it.
export const migration: Migration = {
  version: 5,
  name: "index activity_log by profile",
  statements: [
    "ALTER TABLE activity_log ADD COLUMN profile_id TEXT",
    `UPDATE activity_log SET profile_id = COALESCE(json_extract(metadata, '$.profileId'), 'default') WHERE profile_id IS NULL`,
    "CREATE INDEX IF NOT EXISTS idx_activity_log_profile_timestamp ON activity_log(profile_id, timestamp DESC)",
  ],
};
