import type { MediaSummary } from "@/types/media";

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
