-- cinetrack:version 16
-- cinetrack:name index large-library stats queries
-- cinetrack:statement
CREATE INDEX idx_viewing_events_profile_media_episode_date ON viewing_events(profile_id, media_id, media_type, episode_id, watched_at DESC, created_at DESC)
-- cinetrack:statement
CREATE INDEX idx_viewing_events_profile_media_date ON viewing_events(profile_id, media_id, media_type, watched_at DESC)
-- cinetrack:statement
CREATE INDEX idx_library_profile_type_status_completed ON library_items(profile_id, media_type, status, completed_at ASC)
-- cinetrack:statement
CREATE INDEX idx_library_profile_rating ON library_items(profile_id, user_rating) WHERE user_rating IS NOT NULL
