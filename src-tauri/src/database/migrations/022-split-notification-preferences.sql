-- cinetrack:version 22
-- cinetrack:name split notification preferences
-- Backfills the two new per-category notification preferences
-- (availabilityAlertsEnabled, desktopNotificationsEnabled) from the
-- existing single notificationsEnabled flag, so anyone who already opted in
-- keeps getting availability alerts and desktop toasts once the Settings
-- page splits that one switch into three. A profile that never touched
-- notificationsEnabled (still on its default) has no row to copy here, and
-- the two new keys fall back to their own same false default.
-- cinetrack:statement
INSERT INTO preferences (key, value, updated_at)
SELECT 'availabilityAlertsEnabled', value, updated_at FROM preferences WHERE key = 'notificationsEnabled'
-- cinetrack:statement
INSERT INTO preferences (key, value, updated_at)
SELECT 'desktopNotificationsEnabled', value, updated_at FROM preferences WHERE key = 'notificationsEnabled'
