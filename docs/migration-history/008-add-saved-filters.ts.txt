import type { Migration } from "./types";

// A saved filter is a named snapshot of one page's own filter-control state
// (LibraryExplorer's type/status/favourites/list/sort/search, or SearchPage's
// scope/genre/provider) — reopening it just means "set that page's filter
// state to this JSON blob," entirely client-side, so this table (like
// smart_lists.rules) stores an opaque JSON TEXT column rather than relational
// columns per filter dimension. `page` distinguishes which page a row belongs
// to since the two pages' filter shapes are unrelated — a Library-saved
// filter should never show up in Search's own saved-filters list or vice
// versa.
export const migration: Migration = {
  version: 15,
  name: "add saved filters",
  statements: [
    `CREATE TABLE saved_filters (
      uuid TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
      page TEXT NOT NULL,
      name TEXT NOT NULL,
      filters TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    "CREATE INDEX idx_saved_filters_profile_page_updated ON saved_filters(profile_id, page, updated_at DESC)",
  ],
};
