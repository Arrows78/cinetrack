-- cinetrack:version 1
-- cinetrack:name initial schema
-- cinetrack:statement
CREATE TABLE profiles (
  uuid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT,
  supabase_user_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
-- cinetrack:statement
CREATE TABLE library_items (
  uuid TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
  media_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
  title TEXT NOT NULL,
  poster_path TEXT,
  backdrop_path TEXT,
  year INTEGER CHECK (year IS NULL OR year > 1800),
  rating REAL CHECK (rating IS NULL OR (rating >= 0 AND rating <= 10)),
  genres TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','watching','paused','completed','dropped','rewatching')),
  favourite INTEGER NOT NULL DEFAULT 0 CHECK (favourite IN (0,1)),
  user_rating REAL CHECK (user_rating IS NULL OR (user_rating >= 1 AND user_rating <= 10)),
  notes TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  started_at TEXT,
  completed_at TEXT,
  rewatch_count INTEGER NOT NULL DEFAULT 0 CHECK (rewatch_count >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (profile_id, media_id, media_type)
)
-- cinetrack:statement
CREATE INDEX idx_library_profile_status ON library_items(profile_id, status, updated_at DESC)
-- cinetrack:statement
CREATE INDEX idx_library_profile_updated ON library_items(profile_id, updated_at DESC)
-- cinetrack:statement
CREATE INDEX idx_library_media_id ON library_items(media_id, media_type)
-- cinetrack:statement
CREATE TABLE watchlist_items (
  uuid TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
  media_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
  title TEXT NOT NULL,
  poster_path TEXT,
  backdrop_path TEXT,
  year INTEGER CHECK (year IS NULL OR year > 1800),
  rating REAL CHECK (rating IS NULL OR (rating >= 0 AND rating <= 10)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (profile_id, media_id, media_type)
)
-- cinetrack:statement
CREATE INDEX idx_watchlist_items_profile_created ON watchlist_items(profile_id, created_at DESC)
-- cinetrack:statement
CREATE INDEX idx_watchlist_media_id ON watchlist_items(media_id, media_type)
-- cinetrack:statement
CREATE TABLE seen_movies (
  uuid TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
  movie_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  poster_path TEXT,
  backdrop_path TEXT,
  watched_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (profile_id, movie_id)
)
-- cinetrack:statement
CREATE INDEX idx_seen_movies_profile_watched ON seen_movies(profile_id, watched_at DESC)
-- cinetrack:statement
CREATE INDEX idx_seen_movies_movie_id ON seen_movies(movie_id)
-- cinetrack:statement
CREATE TABLE episode_progress (
  uuid TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
  series_id INTEGER NOT NULL,
  episode_id INTEGER NOT NULL,
  season_number INTEGER NOT NULL CHECK (season_number >= 0),
  episode_number INTEGER NOT NULL CHECK (episode_number >= 0),
  watched INTEGER NOT NULL DEFAULT 1 CHECK (watched IN (0,1)),
  watched_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (profile_id, series_id, episode_id)
)
-- cinetrack:statement
CREATE INDEX idx_episode_progress_series_watched ON episode_progress(profile_id, series_id, watched)
-- cinetrack:statement
CREATE INDEX idx_episode_progress_episode_id ON episode_progress(episode_id)
-- cinetrack:statement
CREATE TABLE tracked_series (
  uuid TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
  series_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  poster_path TEXT,
  backdrop_path TEXT,
  total_episodes INTEGER NOT NULL DEFAULT 0 CHECK (total_episodes >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (profile_id, series_id)
)
-- cinetrack:statement
CREATE INDEX idx_tracked_series_profile_updated ON tracked_series(profile_id, updated_at DESC)
-- cinetrack:statement
CREATE INDEX idx_tracked_series_series_id ON tracked_series(series_id)
-- cinetrack:statement
CREATE TABLE viewing_events (
  uuid TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
  media_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
  title TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('watched','unwatched','rewatched')),
  watched_at TEXT NOT NULL,
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  episode_id INTEGER,
  season_number INTEGER CHECK (season_number IS NULL OR season_number >= 0),
  episode_number INTEGER CHECK (episode_number IS NULL OR episode_number >= 0),
  created_at TEXT NOT NULL
)
-- cinetrack:statement
CREATE INDEX idx_viewing_events_profile_date ON viewing_events(profile_id, watched_at DESC)
-- cinetrack:statement
CREATE INDEX idx_viewing_events_media_id ON viewing_events(media_id, media_type)
-- cinetrack:statement
CREATE TABLE activity_log (
  uuid TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
  media_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
  title TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN (
    'movie:watched','movie:unwatched','episode:watched','episode:unwatched',
    'season:watched','season:unwatched','series:watched','series:unwatched',
    'watchlist:add','watchlist:remove','library:update','list:add','list:remove'
  )),
  season_number INTEGER CHECK (season_number IS NULL OR season_number >= 0),
  episode_number INTEGER CHECK (episode_number IS NULL OR episode_number >= 0),
  episode_title TEXT,
  metadata TEXT,
  timestamp TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
-- cinetrack:statement
CREATE INDEX idx_activity_log_profile_timestamp ON activity_log(profile_id, timestamp DESC)
-- cinetrack:statement
CREATE INDEX idx_activity_log_media_id ON activity_log(media_id, media_type)
-- cinetrack:statement
CREATE TABLE custom_lists (
  uuid TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
-- cinetrack:statement
CREATE INDEX idx_custom_lists_profile_updated ON custom_lists(profile_id, updated_at DESC)
-- cinetrack:statement
CREATE TABLE custom_list_items (
  uuid TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES custom_lists(uuid) ON DELETE CASCADE,
  media_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
  title TEXT NOT NULL,
  poster_path TEXT,
  position INTEGER NOT NULL CHECK (position >= 0),
  added_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (list_id, media_id, media_type)
)
-- cinetrack:statement
CREATE INDEX idx_custom_list_items_position ON custom_list_items(list_id, position)
-- cinetrack:statement
CREATE INDEX idx_custom_list_items_media_id ON custom_list_items(media_id, media_type)
-- cinetrack:statement
CREATE TABLE availability_alerts (
  uuid TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
  media_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
  title TEXT NOT NULL,
  region TEXT NOT NULL,
  provider_ids TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
-- cinetrack:statement
CREATE INDEX idx_availability_alerts_profile_created ON availability_alerts(profile_id, created_at DESC)
-- cinetrack:statement
CREATE INDEX idx_availability_alerts_enabled ON availability_alerts(enabled, profile_id)
-- cinetrack:statement
CREATE TABLE availability_snapshots (
  media_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie','series')),
  region TEXT NOT NULL,
  provider_ids TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (media_id, media_type, region)
)
-- cinetrack:statement
CREATE TABLE preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
-- cinetrack:statement
INSERT OR IGNORE INTO profiles (uuid, name, created_at, updated_at)
VALUES ('default', 'Default', strftime('%Y-%m-%dT%H:%M:%S.000Z', 'now'), strftime('%Y-%m-%dT%H:%M:%S.000Z', 'now'))
