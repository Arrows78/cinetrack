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

/** The full contents of a CineTrack backup — see portable-data.ts. */
export interface PortableData {
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

export const emptyData = (): PortableData => ({
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
});

export const mediaType = (value: unknown) => (value === "movie" ? ("movie" as const) : ("series" as const));
