import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Movie } from "@/types/media";

const mocks = vi.hoisted(() => ({
  listLibrary: vi.fn(),
  getMovieDetails: vi.fn(),
  getWatchAvailability: vi.fn(),
  discoverMovies: vi.fn(),
}));

vi.mock("@/features/library/library-repository", () => ({
  libraryRepository: { list: mocks.listLibrary },
}));

vi.mock("@/features/media/media-repository", () => ({
  mediaRepository: {
    getMovieDetails: mocks.getMovieDetails,
    getWatchAvailability: mocks.getWatchAvailability,
    discoverMovies: mocks.discoverMovies,
  },
}));

import { watchTonightService } from "../watch-tonight-service";

const movie = (id: number, overrides: Partial<Movie> = {}): Movie => ({
  id,
  mediaType: "movie",
  title: `Film ${id}`,
  overview: "",
  genres: [],
  genreIds: [],
  cast: [],
  runtime: 100,
  ...overrides,
});

describe("watchTonightService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listLibrary.mockResolvedValue([]);
    mocks.discoverMovies.mockResolvedValue({
      page: 1,
      totalPages: 1,
      totalResults: 3,
      results: [movie(1), movie(2), movie(3)],
    });
  });

  it("falls back to catalogue discovery for a new user without filters", async () => {
    const result = await watchTonightService.pick({});

    expect(mocks.discoverMovies).toHaveBeenCalledWith({
      genre: undefined,
      provider: undefined,
      maxRuntime: undefined,
    });
    expect(result).toHaveLength(3);
  });

  it("keeps planned movies only when the selected provider is available", async () => {
    mocks.listLibrary.mockResolvedValue([
      { mediaId: 10, mediaType: "movie", status: "planned" },
      { mediaId: 11, mediaType: "movie", status: "planned" },
    ]);
    mocks.getMovieDetails.mockImplementation((id: number) => Promise.resolve(movie(id)));
    mocks.getWatchAvailability.mockImplementation((_type: string, id: number) =>
      Promise.resolve({
        link: null,
        flatrate: id === 10 ? [{ id: 8, name: "Provider" }] : [],
        free: [],
        rent: [],
        buy: [],
      })
    );

    const result = await watchTonightService.pick({ provider: 8 });

    expect(result.map((item) => item.id)).toEqual([10]);
    expect(mocks.discoverMovies).not.toHaveBeenCalled();
  });
});
