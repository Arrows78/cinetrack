import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import type { EpisodeProgress, LibraryItem, MediaSummary, TrackedSeriesItem, ViewingEvent } from "@/types/media";

export function makeMedia(overrides: Partial<MediaSummary> = {}): MediaSummary {
  return {
    id: 1,
    mediaType: "movie",
    title: "Test Movie",
    overview: "",
    posterPath: null,
    backdropPath: null,
    year: 2024,
    rating: 7.5,
    genres: ["Drama"],
    cast: [],
    ...overrides,
  };
}

export function makeLibraryItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: "item-1",
    profileId: DEFAULT_PROFILE_ID,
    mediaId: 550,
    mediaType: "movie",
    title: "Fight Club",
    year: 1999,
    rating: 8.4,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    genres: ["Drama"],
    status: "completed",
    favourite: false,
    userRating: null,
    notes: null,
    tags: [],
    rewatchCount: 0,
    posterPath: null,
    backdropPath: null,
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

export function makeTrackedSeries(overrides: Partial<TrackedSeriesItem> = {}): TrackedSeriesItem {
  return {
    id: "tracked-1",
    profileId: DEFAULT_PROFILE_ID,
    seriesId: 1,
    title: "Test Series",
    posterPath: null,
    backdropPath: null,
    totalEpisodes: 10,
    watchedEpisodes: 4,
    status: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeEpisodeProgress(overrides: Partial<EpisodeProgress> = {}): EpisodeProgress {
  return {
    id: "progress-1",
    profileId: null,
    seriesId: 9,
    episodeId: 1,
    seasonNumber: 1,
    episodeNumber: 1,
    watched: true,
    watchedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeViewingEvent(overrides: Partial<ViewingEvent> = {}): ViewingEvent {
  return {
    id: "event-1",
    profileId: DEFAULT_PROFILE_ID,
    mediaId: 1,
    mediaType: "movie",
    title: "Test",
    eventType: "watched",
    watchedAt: "2026-01-01T00:00:00.000Z",
    durationMinutes: null,
    episodeId: null,
    seasonNumber: null,
    episodeNumber: null,
    ...overrides,
  };
}
