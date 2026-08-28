import type { Migration } from "./types";

// A smart list is a saved, named rule set (see `SmartListRules` in
// src/types/media.ts) evaluated live against the current library every time
// it's opened — never a stored/cached list of matching media ids, so a title
// added next week that matches the rules shows up without anyone editing the
// smart list itself. `rules` is stored as a single JSON TEXT column (same
// pattern as library_items.genres/tags) rather than its own relational
// columns: the rule shape is one small fixed struct, not something SQL needs
// to filter on — evaluation happens entirely client-side in TypeScript (see
// src/features/library/smart-list-evaluation.ts), reusing the exact same
// library/tracked-series/preferences data LibraryExplorer already loads for
// its own manual filters and custom lists.
export const migration: Migration = {
  version: 14,
  name: "add smart lists",
  statements: [
    `CREATE TABLE smart_lists (
      uuid TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
      name TEXT NOT NULL,
      rules TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    "CREATE INDEX idx_smart_lists_profile_updated ON smart_lists(profile_id, updated_at DESC)",
  ],
};
