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
} from "@/types/media";

/** The full contents of a CineTrack backup — see portable-data.ts. */
export interface PortableData {
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

/** Shape of a pre-merge backup's `watchlist` array entry (see `legacyWatchlistItemSchema`). */
export interface LegacyWatchlistItem {
  id: string;
  profileId?: string;
  mediaId: number;
  mediaType: "movie" | "series";
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  year?: number | null;
  rating?: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Folds a pre-merge backup's legacy `watchlist` array into planned-status
 * library rows. Library always wins: a legacy entry is dropped (not merged)
 * whenever a library row already exists for the same
 * (profileId, mediaId, mediaType) — matches migration 10's own rule so an
 * old backup restores to the same shape a live upgrade would produce.
 */
export function foldLegacyWatchlistIntoLibrary(
  library: LibraryItem[],
  legacyWatchlist: LegacyWatchlistItem[] | undefined
): LibraryItem[] {
  if (!legacyWatchlist?.length) return library;

  const seen = new Set(library.map((item) => `${item.profileId}-${item.mediaType}-${item.mediaId}`));
  const additions: LibraryItem[] = [];
  for (const entry of legacyWatchlist) {
    const profileId = entry.profileId ?? "default";
    const key = `${profileId}-${entry.mediaType}-${entry.mediaId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    additions.push({
      id: entry.id,
      profileId,
      mediaId: entry.mediaId,
      mediaType: entry.mediaType,
      title: entry.title,
      posterPath: entry.posterPath ?? null,
      backdropPath: entry.backdropPath ?? null,
      year: entry.year ?? null,
      rating: entry.rating ?? null,
      genres: [],
      status: "planned",
      favourite: false,
      userRating: null,
      notes: null,
      tags: [],
      startedAt: null,
      completedAt: null,
      rewatchCount: 0,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
  }
  return [...library, ...additions];
}
