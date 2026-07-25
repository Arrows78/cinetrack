import Database from "@tauri-apps/plugin-sql";
import { isTauriApp } from "@/shared/lib/platform";
import type {
  EpisodeProgress,
  TrackedSeriesItem,
  UserPreferences,
  ViewingHistoryItem,
  WatchlistItem,
} from "@/types/media";

const DB_URL = "sqlite:app.db";
const STORAGE_KEY = "cinetrack.browser-store";

interface BrowserStore {
  watchlist: WatchlistItem[];
  seenMovies: Array<{
    movieId: number;
    title: string;
    posterPath?: string | null;
    backdropPath?: string | null;
    watchedAt: string;
  }>;
  episodeProgress: EpisodeProgress[];
  trackedSeries: TrackedSeriesItem[];
  history: ViewingHistoryItem[];
  preferences: Partial<UserPreferences>;
}

const defaultBrowserStore: BrowserStore = {
  watchlist: [],
  seenMovies: [],
  episodeProgress: [],
  trackedSeries: [],
  history: [],
  preferences: {},
};

let databasePromise: Promise<Database> | null = null;

const schemaStatements = [
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
];

const readBrowserStore = (): BrowserStore => {
  if (typeof window === "undefined") return defaultBrowserStore;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultBrowserStore, ...JSON.parse(raw) } : defaultBrowserStore;
  } catch {
    return defaultBrowserStore;
  }
};

const writeBrowserStore = (store: BrowserStore) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
};

export const browserStore = {
  read: readBrowserStore,
  write: writeBrowserStore,
};

export async function initializeDatabase() {
  if (!isTauriApp()) return null;

  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await Database.load(DB_URL);

      for (const statement of schemaStatements) {
        await db.execute(statement);
      }

      return db;
    })().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }

  return databasePromise;
}

export async function getDatabase() {
  return initializeDatabase();
}
