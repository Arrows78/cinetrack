import type Database from "@tauri-apps/plugin-sql";

export interface Migration {
  version: number;
  name: string;
  statements: readonly string[];
}

// `watchlist`, `seen_movies`, `tracked_series`, and `episode_progress` (this
// migration) are superseded by their `profile_*` / `library_items`
// equivalents from migration 3 onward and are no longer written to by any
// repository. They stay in the schema, unused, purely so migration 3's
// `INSERT OR IGNORE ... SELECT ... FROM <legacy table>` backfill keeps
// working against databases created before profiles existed — dropping them
// would break that one-time migration for existing installs.
export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: "initial schema and indexes",
    statements: [
      `CREATE TABLE IF NOT EXISTS watchlist (
        media_id INTEGER NOT NULL,
        media_type TEXT NOT NULL,
        title TEXT NOT NULL,
        poster_path TEXT,
        backdrop_path TEXT,
        year INTEGER,
        rating REAL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (media_id, media_type)
      )`,
      `CREATE TABLE IF NOT EXISTS seen_movies (
        movie_id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        poster_path TEXT,
        backdrop_path TEXT,
        watched_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS tracked_series (
        series_id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        poster_path TEXT,
        backdrop_path TEXT,
        total_episodes INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS episode_progress (
        series_id INTEGER NOT NULL,
        episode_id INTEGER NOT NULL,
        season_number INTEGER NOT NULL,
        episode_number INTEGER NOT NULL,
        watched INTEGER NOT NULL DEFAULT 1,
        watched_at TEXT,
        PRIMARY KEY (series_id, episode_id)
      )`,
      `CREATE TABLE IF NOT EXISTS activity_log (
        id TEXT PRIMARY KEY,
        media_id INTEGER NOT NULL,
        media_type TEXT NOT NULL,
        title TEXT NOT NULL,
        action TEXT NOT NULL,
        season_number INTEGER,
        episode_number INTEGER,
        episode_title TEXT,
        timestamp TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp DESC)",
      "CREATE INDEX IF NOT EXISTS idx_episode_progress_series_watched ON episode_progress(series_id, watched)",
      "CREATE INDEX IF NOT EXISTS idx_tracked_series_updated ON tracked_series(updated_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_watchlist_created ON watchlist(created_at DESC)",
    ],
  },
  {
    version: 2,
    name: "unified library, tags and viewing events",
    statements: [
      "ALTER TABLE activity_log ADD COLUMN metadata TEXT",
      `CREATE TABLE IF NOT EXISTS library_items (
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
      )`,
      `CREATE TABLE IF NOT EXISTS viewing_events (
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
      )`,
      `INSERT OR IGNORE INTO library_items (
        profile_id, media_id, media_type, title, poster_path, backdrop_path, year, rating, genres,
        status, favourite, tags, rewatch_count, created_at, updated_at
      )
      SELECT 'default', media_id, media_type, title, poster_path, backdrop_path, year, rating, '[]',
        'planned', 0, '[]', 0, created_at, created_at
      FROM watchlist`,
      "CREATE INDEX IF NOT EXISTS idx_library_profile_status ON library_items(profile_id, status, updated_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_library_favourite ON library_items(profile_id, favourite)",
      "CREATE INDEX IF NOT EXISTS idx_viewing_events_date ON viewing_events(profile_id, watched_at DESC)",
    ],
  },
  {
    version: 3,
    name: "profiles and custom lists",
    statements: [
      `CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        avatar TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS profile_watchlist (
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
      )`,
      `CREATE TABLE IF NOT EXISTS profile_seen_movies (
        profile_id TEXT NOT NULL,
        movie_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        poster_path TEXT,
        backdrop_path TEXT,
        watched_at TEXT NOT NULL,
        PRIMARY KEY (profile_id, movie_id)
      )`,
      `CREATE TABLE IF NOT EXISTS profile_episode_progress (
        profile_id TEXT NOT NULL,
        series_id INTEGER NOT NULL,
        episode_id INTEGER NOT NULL,
        season_number INTEGER NOT NULL,
        episode_number INTEGER NOT NULL,
        watched INTEGER NOT NULL DEFAULT 1,
        watched_at TEXT,
        PRIMARY KEY (profile_id, series_id, episode_id)
      )`,
      `CREATE TABLE IF NOT EXISTS profile_tracked_series (
        profile_id TEXT NOT NULL,
        series_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        poster_path TEXT,
        backdrop_path TEXT,
        total_episodes INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile_id, series_id)
      )`,
      `INSERT OR IGNORE INTO profile_watchlist
        SELECT 'default', media_id, media_type, title, poster_path, backdrop_path, year, rating, created_at FROM watchlist`,
      `INSERT OR IGNORE INTO profile_seen_movies
        SELECT 'default', movie_id, title, poster_path, backdrop_path, watched_at FROM seen_movies`,
      `INSERT OR IGNORE INTO profile_episode_progress
        SELECT 'default', series_id, episode_id, season_number, episode_number, watched, watched_at FROM episode_progress`,
      `INSERT OR IGNORE INTO profile_tracked_series
        SELECT 'default', series_id, title, poster_path, backdrop_path, total_episodes, updated_at FROM tracked_series`,
      "CREATE INDEX IF NOT EXISTS idx_profile_watchlist_created ON profile_watchlist(profile_id, created_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_profile_episode_progress ON profile_episode_progress(profile_id, series_id, watched)",
      "CREATE INDEX IF NOT EXISTS idx_profile_tracked_series ON profile_tracked_series(profile_id, updated_at DESC)",
      `CREATE TABLE IF NOT EXISTS custom_lists (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS custom_list_items (
        list_id TEXT NOT NULL,
        media_id INTEGER NOT NULL,
        media_type TEXT NOT NULL,
        title TEXT NOT NULL,
        poster_path TEXT,
        position INTEGER NOT NULL,
        added_at TEXT NOT NULL,
        PRIMARY KEY (list_id, media_id, media_type)
      )`,
      "INSERT OR IGNORE INTO profiles (id, name, created_at) VALUES ('default', 'Principal', datetime('now'))",
      "CREATE INDEX IF NOT EXISTS idx_custom_lists_profile ON custom_lists(profile_id, updated_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_custom_list_items_position ON custom_list_items(list_id, position)",
    ],
  },
  {
    version: 4,
    name: "availability alerts and snapshots",
    statements: [
      `CREATE TABLE IF NOT EXISTS availability_alerts (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        media_id INTEGER NOT NULL,
        media_type TEXT NOT NULL,
        title TEXT NOT NULL,
        region TEXT NOT NULL,
        provider_ids TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS availability_snapshots (
        media_id INTEGER NOT NULL,
        media_type TEXT NOT NULL,
        region TEXT NOT NULL,
        provider_ids TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        PRIMARY KEY (media_id, media_type, region)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_availability_alert_profile ON availability_alerts(profile_id, enabled)",
    ],
  },
];

export async function runMigrations(db: Database): Promise<void> {
  const rows = await db.select<Array<{ user_version: number }>>("PRAGMA user_version");
  let currentVersion = Number(rows[0]?.user_version ?? 0);

  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;

    await db.execute("BEGIN IMMEDIATE");
    try {
      for (const statement of migration.statements) {
        try {
          await db.execute(statement);
        } catch (error) {
          const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
          const duplicateAddColumn = statement.startsWith("ALTER TABLE") && message.includes("duplicate column");
          if (!duplicateAddColumn) throw error;
        }
      }
      await db.execute(`PRAGMA user_version = ${migration.version}`);
      await db.execute("COMMIT");
      currentVersion = migration.version;
    } catch (error) {
      await db.execute("ROLLBACK");
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Migration ${migration.version} (${migration.name}) failed: ${message}`,
      );
    }
  }
}
