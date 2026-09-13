-- cinetrack:version 19
-- cinetrack:name add rating to episode_progress
-- cinetrack:statement
ALTER TABLE episode_progress ADD COLUMN rating INTEGER CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5))
