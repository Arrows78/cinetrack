-- cinetrack:version 14
-- cinetrack:name add smart lists
-- cinetrack:statement
CREATE TABLE smart_lists (
  uuid TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rules TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
-- cinetrack:statement
CREATE INDEX idx_smart_lists_profile_updated ON smart_lists(profile_id, updated_at DESC)
