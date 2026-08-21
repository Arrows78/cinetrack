import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import type { LibraryItem, MediaSummary } from "@/types/media";

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
    ...overrides,
  };
}
