import Database from "@tauri-apps/plugin-sql";
import { isTauriApp } from "@/shared/lib/platform";
import type {
  AvailabilityAlert,
  AvailabilitySnapshot,
  CustomList,
  CustomListItem,
  EpisodeProgress,
  LibraryItem,
  TrackedSeriesItem,
  UserPreferences,
  UserProfile,
  ViewingEvent,
  ViewingHistoryItem,
  WatchlistItem,
} from "@/types/media";
import { runMigrations } from "./migrations";

const DB_URL = "sqlite:app.db";
const STORAGE_KEY = "cinetrack.browser-store.v2";

export interface BrowserStore {
  schemaVersion: number;
  watchlist: WatchlistItem[];
  seenMovies: Array<{
    profileId?: string;
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
  library: LibraryItem[];
  viewingEvents: ViewingEvent[];
  profiles: UserProfile[];
  customLists: CustomList[];
  customListItems: CustomListItem[];
  availabilitySnapshots: AvailabilitySnapshot[];
  availabilityAlerts: AvailabilityAlert[];
}

const defaultBrowserStore: BrowserStore = {
  schemaVersion: 1,
  watchlist: [],
  seenMovies: [],
  episodeProgress: [],
  trackedSeries: [],
  history: [],
  preferences: {},
  library: [],
  viewingEvents: [],
  profiles: [],
  customLists: [],
  customListItems: [],
  availabilitySnapshots: [],
  availabilityAlerts: [],
};

let databasePromise: Promise<Database> | null = null;

const readBrowserStore = (): BrowserStore => {
  if (typeof window === "undefined") return structuredClone(defaultBrowserStore);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem("cinetrack.browser-store");
    if (!raw) return structuredClone(defaultBrowserStore);
    return { ...structuredClone(defaultBrowserStore), ...(JSON.parse(raw) as Partial<BrowserStore>) };
  } catch {
    return structuredClone(defaultBrowserStore);
  }
};

const writeBrowserStore = (store: BrowserStore) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
};

export const browserStore = { read: readBrowserStore, write: writeBrowserStore };

export async function initializeDatabase() {
  if (!isTauriApp()) return null;

  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await Database.load(DB_URL);
      await runMigrations(db);
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
