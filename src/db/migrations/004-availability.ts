import type { Migration } from "./types";

export const migration: Migration = {
  version: 4,
  name: "availability alerts and snapshots",
  statements: [
    `CREATE TABLE IF NOT EXISTS availability_alerts (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      region TEXT NOT NULL,
      provider_ids TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS availability_snapshots (
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      region TEXT NOT NULL,
      provider_ids TEXT NOT NULL,
      checked_at TEXT NOT NULL,
      PRIMARY KEY (media_id, media_type, region)
    )`,
    "CREATE INDEX IF NOT EXISTS idx_availability_alert_profile ON availability_alerts(profile_id, enabled)",
  ],
};
