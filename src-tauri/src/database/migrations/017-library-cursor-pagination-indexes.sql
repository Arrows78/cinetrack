-- cinetrack:version 17
-- cinetrack:name library cursor pagination indexes
-- cinetrack:statement
DROP INDEX idx_library_profile_updated
-- cinetrack:statement
CREATE INDEX idx_library_profile_updated ON library_items(profile_id, updated_at DESC, media_id DESC, media_type DESC)
-- cinetrack:statement
CREATE INDEX idx_library_profile_title ON library_items(profile_id, title ASC, media_id ASC, media_type ASC)
-- cinetrack:statement
CREATE INDEX idx_library_profile_rating_cursor ON library_items(profile_id, COALESCE(user_rating, rating, -1.0) DESC, media_id DESC, media_type DESC)
