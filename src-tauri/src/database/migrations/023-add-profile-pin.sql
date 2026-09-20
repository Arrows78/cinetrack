-- cinetrack:version 23
-- cinetrack:name add profile pin lock
-- Adds an optional PIN lock per local profile. Both columns null means no
-- PIN is set. pin_hash is a sha256 hex digest of pin_salt + the PIN, never
-- the raw PIN itself. Kept off the public UserProfile DTO sent to the
-- frontend (see profiles/models.rs) — only a derived `has_pin` boolean is
-- ever exposed there.
-- cinetrack:statement
ALTER TABLE profiles ADD COLUMN pin_hash TEXT
-- cinetrack:statement
ALTER TABLE profiles ADD COLUMN pin_salt TEXT
