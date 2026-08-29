-- cinetrack:version 9
-- cinetrack:name unique availability alert per profile and media
-- cinetrack:statement
DELETE FROM availability_alerts
WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM availability_alerts GROUP BY profile_id, media_id, media_type
)
-- cinetrack:statement
CREATE UNIQUE INDEX idx_availability_alerts_unique ON availability_alerts(profile_id, media_id, media_type)
