-- v1 initial schema and indexes
CREATE TABLE IF NOT EXISTS watchlist (
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      year INTEGER,
      rating REAL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (media_id, media_type)
    );
CREATE TABLE IF NOT EXISTS seen_movies (
      movie_id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      watched_at TEXT NOT NULL
    );
CREATE TABLE IF NOT EXISTS tracked_series (
      series_id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      total_episodes INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
CREATE TABLE IF NOT EXISTS episode_progress (
      series_id INTEGER NOT NULL,
      episode_id INTEGER NOT NULL,
      season_number INTEGER NOT NULL,
      episode_number INTEGER NOT NULL,
      watched INTEGER NOT NULL DEFAULT 1,
      watched_at TEXT,
      PRIMARY KEY (series_id, episode_id)
    );
CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      action TEXT NOT NULL,
      season_number INTEGER,
      episode_number INTEGER,
      episode_title TEXT,
      timestamp TEXT NOT NULL
    );
CREATE TABLE IF NOT EXISTS preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_episode_progress_series_watched ON episode_progress(series_id, watched);
CREATE INDEX IF NOT EXISTS idx_tracked_series_updated ON tracked_series(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_watchlist_created ON watchlist(created_at DESC);
PRAGMA user_version = 1;
-- v2 unified library, tags and viewing events
ALTER TABLE activity_log ADD COLUMN metadata TEXT;
CREATE TABLE IF NOT EXISTS library_items (
      profile_id TEXT NOT NULL,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      year INTEGER,
      rating REAL,
      genres TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'planned',
      favourite INTEGER NOT NULL DEFAULT 0,
      user_rating REAL,
      notes TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      started_at TEXT,
      completed_at TEXT,
      rewatch_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (profile_id, media_id, media_type)
    );
CREATE TABLE IF NOT EXISTS viewing_events (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      event_type TEXT NOT NULL,
      watched_at TEXT NOT NULL,
      duration_minutes INTEGER,
      episode_id INTEGER,
      season_number INTEGER,
      episode_number INTEGER
    );
INSERT OR IGNORE INTO library_items (
      profile_id, media_id, media_type, title, poster_path, backdrop_path, year, rating, genres,
      status, favourite, tags, rewatch_count, created_at, updated_at
    )
    SELECT 'default', media_id, media_type, title, poster_path, backdrop_path, year, rating, '[]',
      'planned', 0, '[]', 0, created_at, created_at
    FROM watchlist;
CREATE INDEX IF NOT EXISTS idx_library_profile_status ON library_items(profile_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_library_favourite ON library_items(profile_id, favourite);
CREATE INDEX IF NOT EXISTS idx_viewing_events_date ON viewing_events(profile_id, watched_at DESC);
PRAGMA user_version = 2;
-- v3 profiles and custom lists
CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT,
      created_at TEXT NOT NULL
    );
CREATE TABLE IF NOT EXISTS profile_watchlist (
      profile_id TEXT NOT NULL,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      year INTEGER,
      rating REAL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (profile_id, media_id, media_type)
    );
CREATE TABLE IF NOT EXISTS profile_seen_movies (
      profile_id TEXT NOT NULL,
      movie_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      watched_at TEXT NOT NULL,
      PRIMARY KEY (profile_id, movie_id)
    );
CREATE TABLE IF NOT EXISTS profile_episode_progress (
      profile_id TEXT NOT NULL,
      series_id INTEGER NOT NULL,
      episode_id INTEGER NOT NULL,
      season_number INTEGER NOT NULL,
      episode_number INTEGER NOT NULL,
      watched INTEGER NOT NULL DEFAULT 1,
      watched_at TEXT,
      PRIMARY KEY (profile_id, series_id, episode_id)
    );
CREATE TABLE IF NOT EXISTS profile_tracked_series (
      profile_id TEXT NOT NULL,
      series_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      total_episodes INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (profile_id, series_id)
    );
INSERT OR IGNORE INTO profile_watchlist
      SELECT 'default', media_id, media_type, title, poster_path, backdrop_path, year, rating, created_at FROM watchlist;
INSERT OR IGNORE INTO profile_seen_movies
      SELECT 'default', movie_id, title, poster_path, backdrop_path, watched_at FROM seen_movies;
INSERT OR IGNORE INTO profile_episode_progress
      SELECT 'default', series_id, episode_id, season_number, episode_number, watched, watched_at FROM episode_progress;
INSERT OR IGNORE INTO profile_tracked_series
      SELECT 'default', series_id, title, poster_path, backdrop_path, total_episodes, updated_at FROM tracked_series;
CREATE INDEX IF NOT EXISTS idx_profile_watchlist_created ON profile_watchlist(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_episode_progress ON profile_episode_progress(profile_id, series_id, watched);
CREATE INDEX IF NOT EXISTS idx_profile_tracked_series ON profile_tracked_series(profile_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS custom_lists (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
CREATE TABLE IF NOT EXISTS custom_list_items (
      list_id TEXT NOT NULL,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      position INTEGER NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (list_id, media_id, media_type)
    );
INSERT OR IGNORE INTO profiles (id, name, created_at) VALUES ('default', 'Principal', datetime('now'));
CREATE INDEX IF NOT EXISTS idx_custom_lists_profile ON custom_lists(profile_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_list_items_position ON custom_list_items(list_id, position);
PRAGMA user_version = 3;
-- v4 availability alerts and snapshots
CREATE TABLE IF NOT EXISTS availability_alerts (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      region TEXT NOT NULL,
      provider_ids TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
CREATE TABLE IF NOT EXISTS availability_snapshots (
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      region TEXT NOT NULL,
      provider_ids TEXT NOT NULL,
      checked_at TEXT NOT NULL,
      PRIMARY KEY (media_id, media_type, region)
    );
CREATE INDEX IF NOT EXISTS idx_availability_alert_profile ON availability_alerts(profile_id, enabled);
PRAGMA user_version = 4;
-- v5 index activity_log by profile
ALTER TABLE activity_log ADD COLUMN profile_id TEXT;
UPDATE activity_log SET profile_id = COALESCE(json_extract(metadata, '$.profileId'), 'default') WHERE profile_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_activity_log_profile_timestamp ON activity_log(profile_id, timestamp DESC);
PRAGMA user_version = 5;
-- v6 index cleanup: fix unserved queries, drop dead indexes
CREATE INDEX IF NOT EXISTS idx_library_profile_updated ON library_items(profile_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_seen_movies_watched ON profile_seen_movies(profile_id, watched_at DESC);
DROP INDEX IF EXISTS idx_availability_alert_profile;
CREATE INDEX IF NOT EXISTS idx_availability_alerts_profile_created ON availability_alerts(profile_id, created_at DESC);
DROP INDEX IF EXISTS idx_library_favourite;
DROP INDEX IF EXISTS idx_activity_log_timestamp;
PRAGMA user_version = 6;
-- v7 enforce foreign keys on profile- and list-scoped tables
UPDATE profile_watchlist SET profile_id = 'default' WHERE profile_id NOT IN (SELECT id FROM profiles);
UPDATE profile_seen_movies SET profile_id = 'default' WHERE profile_id NOT IN (SELECT id FROM profiles);
UPDATE profile_episode_progress SET profile_id = 'default' WHERE profile_id NOT IN (SELECT id FROM profiles);
UPDATE profile_tracked_series SET profile_id = 'default' WHERE profile_id NOT IN (SELECT id FROM profiles);
UPDATE library_items SET profile_id = 'default' WHERE profile_id NOT IN (SELECT id FROM profiles);
UPDATE viewing_events SET profile_id = 'default' WHERE profile_id NOT IN (SELECT id FROM profiles);
UPDATE availability_alerts SET profile_id = 'default' WHERE profile_id NOT IN (SELECT id FROM profiles);
UPDATE activity_log SET profile_id = 'default' WHERE profile_id IS NOT NULL AND profile_id NOT IN (SELECT id FROM profiles);
UPDATE custom_lists SET profile_id = 'default' WHERE profile_id NOT IN (SELECT id FROM profiles);
DELETE FROM custom_list_items WHERE list_id NOT IN (SELECT id FROM custom_lists);
DROP TABLE IF EXISTS profile_watchlist_new;
CREATE TABLE profile_watchlist_new (
      profile_id TEXT NOT NULL,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      year INTEGER,
      rating REAL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (profile_id, media_id, media_type),
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );
INSERT INTO profile_watchlist_new SELECT * FROM profile_watchlist;
DROP TABLE profile_watchlist;
ALTER TABLE profile_watchlist_new RENAME TO profile_watchlist;
CREATE INDEX IF NOT EXISTS idx_profile_watchlist_created ON profile_watchlist(profile_id, created_at DESC);
DROP TABLE IF EXISTS profile_seen_movies_new;
CREATE TABLE profile_seen_movies_new (
      profile_id TEXT NOT NULL,
      movie_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      watched_at TEXT NOT NULL,
      PRIMARY KEY (profile_id, movie_id),
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );
INSERT INTO profile_seen_movies_new SELECT * FROM profile_seen_movies;
DROP TABLE profile_seen_movies;
ALTER TABLE profile_seen_movies_new RENAME TO profile_seen_movies;
CREATE INDEX IF NOT EXISTS idx_profile_seen_movies_watched ON profile_seen_movies(profile_id, watched_at DESC);
DROP TABLE IF EXISTS profile_episode_progress_new;
CREATE TABLE profile_episode_progress_new (
      profile_id TEXT NOT NULL,
      series_id INTEGER NOT NULL,
      episode_id INTEGER NOT NULL,
      season_number INTEGER NOT NULL,
      episode_number INTEGER NOT NULL,
      watched INTEGER NOT NULL DEFAULT 1,
      watched_at TEXT,
      PRIMARY KEY (profile_id, series_id, episode_id),
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );
INSERT INTO profile_episode_progress_new SELECT * FROM profile_episode_progress;
DROP TABLE profile_episode_progress;
ALTER TABLE profile_episode_progress_new RENAME TO profile_episode_progress;
CREATE INDEX IF NOT EXISTS idx_profile_episode_progress ON profile_episode_progress(profile_id, series_id, watched);
DROP TABLE IF EXISTS profile_tracked_series_new;
CREATE TABLE profile_tracked_series_new (
      profile_id TEXT NOT NULL,
      series_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      total_episodes INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (profile_id, series_id),
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );
INSERT INTO profile_tracked_series_new SELECT * FROM profile_tracked_series;
DROP TABLE profile_tracked_series;
ALTER TABLE profile_tracked_series_new RENAME TO profile_tracked_series;
CREATE INDEX IF NOT EXISTS idx_profile_tracked_series ON profile_tracked_series(profile_id, updated_at DESC);
DROP TABLE IF EXISTS library_items_new;
CREATE TABLE library_items_new (
      profile_id TEXT NOT NULL,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      year INTEGER,
      rating REAL,
      genres TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'planned',
      favourite INTEGER NOT NULL DEFAULT 0,
      user_rating REAL,
      notes TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      started_at TEXT,
      completed_at TEXT,
      rewatch_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (profile_id, media_id, media_type),
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );
INSERT INTO library_items_new SELECT * FROM library_items;
DROP TABLE library_items;
ALTER TABLE library_items_new RENAME TO library_items;
CREATE INDEX IF NOT EXISTS idx_library_profile_status ON library_items(profile_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_library_profile_updated ON library_items(profile_id, updated_at DESC);
DROP TABLE IF EXISTS viewing_events_new;
CREATE TABLE viewing_events_new (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      event_type TEXT NOT NULL,
      watched_at TEXT NOT NULL,
      duration_minutes INTEGER,
      episode_id INTEGER,
      season_number INTEGER,
      episode_number INTEGER,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );
INSERT INTO viewing_events_new SELECT * FROM viewing_events;
DROP TABLE viewing_events;
ALTER TABLE viewing_events_new RENAME TO viewing_events;
CREATE INDEX IF NOT EXISTS idx_viewing_events_date ON viewing_events(profile_id, watched_at DESC);
DROP TABLE IF EXISTS availability_alerts_new;
CREATE TABLE availability_alerts_new (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      region TEXT NOT NULL,
      provider_ids TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );
INSERT INTO availability_alerts_new SELECT * FROM availability_alerts;
DROP TABLE availability_alerts;
ALTER TABLE availability_alerts_new RENAME TO availability_alerts;
CREATE INDEX IF NOT EXISTS idx_availability_alerts_profile_created ON availability_alerts(profile_id, created_at DESC);
DROP TABLE IF EXISTS activity_log_new;
CREATE TABLE activity_log_new (
      id TEXT PRIMARY KEY,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      action TEXT NOT NULL,
      season_number INTEGER,
      episode_number INTEGER,
      episode_title TEXT,
      timestamp TEXT NOT NULL,
      metadata TEXT,
      profile_id TEXT,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );
INSERT INTO activity_log_new SELECT * FROM activity_log;
DROP TABLE activity_log;
ALTER TABLE activity_log_new RENAME TO activity_log;
CREATE INDEX IF NOT EXISTS idx_activity_log_profile_timestamp ON activity_log(profile_id, timestamp DESC);
DROP TABLE IF EXISTS custom_lists_new;
CREATE TABLE custom_lists_new (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );
INSERT INTO custom_lists_new SELECT * FROM custom_lists;
DROP TABLE custom_lists;
ALTER TABLE custom_lists_new RENAME TO custom_lists;
CREATE INDEX IF NOT EXISTS idx_custom_lists_profile ON custom_lists(profile_id, updated_at DESC);
DROP TABLE IF EXISTS custom_list_items_new;
CREATE TABLE custom_list_items_new (
      list_id TEXT NOT NULL,
      media_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      position INTEGER NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (list_id, media_id, media_type),
      FOREIGN KEY (list_id) REFERENCES custom_lists(id) ON DELETE CASCADE
    );
INSERT INTO custom_list_items_new SELECT * FROM custom_list_items;
DROP TABLE custom_list_items;
ALTER TABLE custom_list_items_new RENAME TO custom_list_items;
CREATE INDEX IF NOT EXISTS idx_custom_list_items_position ON custom_list_items(list_id, position);
PRAGMA user_version = 7;
-- v8 link profiles to a supabase user
ALTER TABLE profiles ADD COLUMN supabase_user_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_supabase_user ON profiles(supabase_user_id);
PRAGMA user_version = 8;
