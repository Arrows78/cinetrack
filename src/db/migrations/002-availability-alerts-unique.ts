import type { Migration } from "./types";

// Fixes a real gap: toggle_availability_alert read-then-wrote without a
// transaction, so two concurrent toggles for the same media could both
// insert an alert. The DELETE below clears any duplicate this already
// produced (keeping the oldest row) before the UNIQUE index makes it
// impossible going forward.
export const migration: Migration = {
  version: 9,
  name: "unique availability alert per profile and media",
  statements: [
    `DELETE FROM availability_alerts
     WHERE rowid NOT IN (
       SELECT MIN(rowid) FROM availability_alerts GROUP BY profile_id, media_id, media_type
     )`,
    "CREATE UNIQUE INDEX idx_availability_alerts_unique ON availability_alerts(profile_id, media_id, media_type)",
  ],
};
