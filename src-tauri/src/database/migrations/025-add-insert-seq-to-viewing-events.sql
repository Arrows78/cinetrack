-- cinetrack:version 25
-- cinetrack:name add insertion order to viewing events
-- A title is "seen" when its latest viewing event is a watch, and "latest"
-- has to mean the order the events were logged in: dates cannot decide it,
-- because a watch can legitimately carry an earlier date than an unwatch that
-- came before it (a TV Time import of old history, a clock that ran late) and
-- two events can share a date. `insert_seq` is that order: a unique,
-- increasing number the database gives each new row (see the trigger below),
-- never reused for another row's place and never changed.
--
-- Existing rows are numbered in the order they sit in the table (their rowid),
-- which is the order they were logged in.
-- cinetrack:statement
ALTER TABLE viewing_events ADD COLUMN insert_seq INTEGER NOT NULL DEFAULT 0
-- cinetrack:statement
UPDATE viewing_events SET insert_seq = rowid
-- cinetrack:statement
CREATE UNIQUE INDEX idx_viewing_events_insert_seq ON viewing_events(insert_seq)
-- cinetrack:statement
CREATE INDEX idx_viewing_events_profile_media_episode_seq ON viewing_events(profile_id, media_id, media_type, episode_id, insert_seq)
-- A row inserted without an explicit position (every app write, a sync pull)
-- is numbered right after the last one. A statement that supplies one (> 0)
-- keeps it. `viewing_events` has no UPDATE sync trigger, so numbering the row
-- does not queue a second cloud mutation.
-- cinetrack:statement
CREATE TRIGGER viewing_events_assign_insert_seq AFTER INSERT ON viewing_events
WHEN NEW.insert_seq = 0
BEGIN
  UPDATE viewing_events
  SET insert_seq = (SELECT COALESCE(MAX(insert_seq), 0) + 1 FROM viewing_events)
  WHERE rowid = NEW.rowid;
END
