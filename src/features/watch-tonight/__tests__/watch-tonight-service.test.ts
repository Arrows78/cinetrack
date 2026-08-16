import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Movie, Series } from "@/types/media";

const mocks = vi.hoisted(() => ({
  listLibrary: vi.fn(),
  getMovieDetails: vi.fn(),
  getSeriesDetails: vi.fn(),
  getWatchAvailability: vi.fn(),
  discoverMovies: vi.fn(),
  discoverSeries: vi.fn(),
}));

vi.mock("@/features/library/library-repository", () => ({
  libraryRepository: { list: mocks.listLibrary },
}));

vi.mock("@/features/media/media-repository", () => ({
  mediaRepository: {
    getMovieDetails: mocks.getMovieDetails,
    getSeriesDetails: mocks.getSeriesDetails,
    getWatchAvailability: mocks.getWatchAvailability,
    discoverMovies: mocks.discoverMovies,
    discoverSeries: mocks.discoverSeries,
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

const series = (id: number, overrides: Partial<Series> = {}): Series => ({
  id,
  mediaType: "series",
  title: `Série ${id}`,
  overview: "",
  genres: [],
  genreIds: [],
  cast: [],
  numberOfSeasons: 1,
  seasons: [],
  runtime: 40,
  ...overrides,
});

describe("watchTonightService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listLibrary.mockResolvedValue([]);
    mocks.discoverMovies.mockResolvedValue({
      page: 1,
      totalPages: 1,
      totalResults: 4,
      results: [movie(1), movie(2), movie(3), movie(4)],
    });
    mocks.discoverSeries.mockResolvedValue({
      page: 1,
      totalPages: 1,
      totalResults: 4,
      results: [series(1), series(2), series(3), series(4)],
    });
  });

  it("falls back to catalogue discovery for both types for a new user without filters", async () => {
    const result = await watchTonightService.pick({});

    expect(mocks.discoverMovies).toHaveBeenCalledWith({ genre: undefined, provider: undefined, maxRuntime: undefined });
    expect(mocks.discoverSeries).toHaveBeenCalledWith({ genre: undefined, provider: undefined, maxRuntime: undefined });
    expect(result.movies).toHaveLength(4);
    expect(result.series).toHaveLength(4);
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

    expect(result.movies.map((item) => item.id)).toEqual([10]);
    expect(mocks.discoverMovies).not.toHaveBeenCalled();
  });

  it("keeps planned series only when the selected provider is available", async () => {
    mocks.listLibrary.mockResolvedValue([
      { mediaId: 20, mediaType: "series", status: "planned" },
      { mediaId: 21, mediaType: "series", status: "planned" },
    ]);
    mocks.getSeriesDetails.mockImplementation((id: number) => Promise.resolve(series(id)));
    mocks.getWatchAvailability.mockImplementation((_type: string, id: number) =>
      Promise.resolve({
        link: null,
        flatrate: id === 20 ? [{ id: 8, name: "Provider" }] : [],
        free: [],
        rent: [],
        buy: [],
      })
    );

    const result = await watchTonightService.pick({ provider: 8 });

    expect(result.series.map((item) => item.id)).toEqual([20]);
    expect(mocks.discoverSeries).not.toHaveBeenCalled();
  });

  it("filters series candidates by the series-specific genre id and by episode runtime", async () => {
    mocks.listLibrary.mockResolvedValue([
      { mediaId: 30, mediaType: "series", status: "planned" },
      { mediaId: 31, mediaType: "series", status: "planned" },
    ]);
    mocks.getSeriesDetails.mockImplementation((id: number) =>
      Promise.resolve(series(id, { genreIds: id === 30 ? [10765] : [35], runtime: id === 30 ? 30 : 90 }))
    );

    const result = await watchTonightService.pick({ genreSeries: 10765, maxRuntime: 45 });

    expect(result.series.map((item) => item.id)).toEqual([30]);
  });
});
