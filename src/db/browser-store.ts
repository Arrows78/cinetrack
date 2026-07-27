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
