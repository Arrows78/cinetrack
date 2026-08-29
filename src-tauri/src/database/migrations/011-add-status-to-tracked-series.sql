-- cinetrack:version 11
-- cinetrack:name add status to tracked_series
-- cinetrack:statement
ALTER TABLE tracked_series ADD COLUMN status TEXT
