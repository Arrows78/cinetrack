-- cinetrack:version 27
-- cinetrack:name add profile pin attempt limit
-- Counts the wrong PIN guesses per profile so the backend can slow a guesser
-- down (a 4-6 digit PIN has at most a million values). pin_failed_attempts is
-- the number of attempts since the last correct PIN (0 for a profile nobody
-- has tried to unlock); pin_locked_until, when set and in the future (same
-- RFC 3339 UTC millisecond form as every stored instant), refuses every
-- attempt until then. Both are reset by a correct PIN and whenever the PIN is
-- set or cleared. Neither is ever sent to the frontend (see profiles/models.rs).
--
-- New PINs are also stored as an Argon2id encoded hash in pin_hash (the
-- parameters and salt travel inside that string; pin_salt still holds the
-- salt, hex-encoded, because a PIN is "set" when both columns are non-null);
-- a PIN set before this migration keeps its salted SHA-256 digest until its
-- next correct entry, which re-hashes it.
-- cinetrack:statement
ALTER TABLE profiles ADD COLUMN pin_failed_attempts INTEGER NOT NULL DEFAULT 0
-- cinetrack:statement
ALTER TABLE profiles ADD COLUMN pin_locked_until TEXT
