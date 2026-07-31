import type { ZodType } from "zod";
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
import { browserStoreSchema } from "./browser-store-schema";

const STORAGE_KEY = "cinetrack.browser-store.v2";
const LEGACY_STORAGE_KEY = "cinetrack.browser-store";

// Bump when the persisted shape changes incompatibly. Data stamped with a
// HIGHER version than this (written by a newer app build) is left untouched
// and defaults are served instead of misreading it.
const CURRENT_SCHEMA_VERSION = 1;

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
  schemaVersion: CURRENT_SCHEMA_VERSION,
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

// Validates one section independently so a corrupted array (bad manual
// edit, interrupted write, another tab) only resets that section instead
// of silently poisoning repositories or wiping the whole store.
function validSection<Key extends keyof BrowserStore>(
  key: Key,
  value: unknown,
  fallback: BrowserStore[Key]
): BrowserStore[Key] {
  const schema = browserStoreSchema.shape[key] as ZodType<unknown>;
  const result = schema.safeParse(value);
  if (!result.success || result.data === undefined) return fallback;
  return result.data as BrowserStore[Key];
}

const readBrowserStore = (): BrowserStore => {
  if (typeof window === "undefined") return structuredClone(defaultBrowserStore);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return structuredClone(defaultBrowserStore);

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return structuredClone(defaultBrowserStore);
    const record = parsed as Record<string, unknown>;

    const version = typeof record.schemaVersion === "number" ? record.schemaVersion : CURRENT_SCHEMA_VERSION;
    if (version > CURRENT_SCHEMA_VERSION) return structuredClone(defaultBrowserStore);

    const store = structuredClone(defaultBrowserStore);
    for (const key of Object.keys(defaultBrowserStore) as Array<keyof BrowserStore>) {
      if (key === "schemaVersion") continue;
      (store as Record<keyof BrowserStore, unknown>)[key] = validSection(key, record[key], store[key]);
    }
    return store;
  } catch {
    return structuredClone(defaultBrowserStore);
  }
};

const writeBrowserStore = (store: BrowserStore) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...store, schemaVersion: CURRENT_SCHEMA_VERSION }));
};

export const browserStore = { read: readBrowserStore, write: writeBrowserStore };
