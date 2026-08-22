import type { Migration } from "./types";

// library_items.notes is a single free-text field per title, overwritten on
// every edit — a rewatch replaces whatever the user wrote the first time
// around. This column is additive and separate: one optional note per
// individual watch event, so a rewatch's note doesn't erase an earlier
// watch's. Write-once-at-log-time (set only when the viewing_events row is
// first inserted, never edited afterward) — the simpler product decision for
// a v1, and it keeps viewing_events' existing append-only invariant intact
// (see 001-initial-schema.ts's header comment: "gets `created_at` only, no
// `updated_at`" still holds — this column never changes after insert, so no
// `updated_at` is needed here either).
export const migration: Migration = {
  version: 13,
  name: "add note to viewing_events",
  statements: ["ALTER TABLE viewing_events ADD COLUMN note TEXT"],
};
