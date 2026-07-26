import type Database from "@tauri-apps/plugin-sql";

export interface Migration {
  version: number;
  name: string;
  statements: readonly string[];
}

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
      const message = error instanceof Error ? error.message : String(error);
      await db.execute("ROLLBACK");
      throw new Error(`Migration ${migration.version} (${migration.name}) failed: ${message}`);
    }
  }
}
