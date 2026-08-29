-- cinetrack:version 15
-- cinetrack:name add saved filters
-- cinetrack:statement
CREATE TABLE saved_filters (
  uuid TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
  page TEXT NOT NULL,
  name TEXT NOT NULL,
  filters TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
-- cinetrack:statement
CREATE INDEX idx_saved_filters_profile_page_updated ON saved_filters(profile_id, page, updated_at DESC)
