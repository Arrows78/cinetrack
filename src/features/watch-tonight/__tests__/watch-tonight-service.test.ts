import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Movie, Series } from "@/types/media";

const mocks = vi.hoisted(() => ({
  plannedCandidates: vi.fn(),
  idsMatchingFilters: vi.fn(),
  completedCandidates: vi.fn(),
  getMovieDetails: vi.fn(),
  getSeriesDetails: vi.fn(),
  getWatchAvailability: vi.fn(),
  discoverMovies: vi.fn(),
  discoverSeries: vi.fn(),
  loggerWarn: vi.fn(),
  listDismissed: vi.fn(),
}));

vi.mock("@/features/library/library-repository", () => ({
  libraryRepository: {
    plannedCandidates: mocks.plannedCandidates,
    idsMatchingFilters: mocks.idsMatchingFilters,
    completedCandidates: mocks.completedCandidates,
  },
}));

vi.mock("@/features/recommendations/recommendations-repository", () => ({
  recommendationsRepository: {
    listDismissed: mocks.listDismissed,
  },
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

vi.mock("@/shared/lib/logger", () => ({
  logger: { warn: mocks.loggerWarn },
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

interface LibraryFixtureItem {
  mediaId: number;
  mediaType: "movie" | "series";
  status: "planned" | "completed";
  /** Only relevant for `status: "completed"` items — feeds the genre-affinity ranking signal (see completedCandidates in watch-tonight-service.ts). Canonical English labels, same format as LibraryItem.genres. */
  genres?: string[];
}

// pickMovies/pickSeries now get their planned candidates from
// list_planned_library_candidates_impl (pre-filtered/sorted server-side)
// and their hide-watched check from a completed-only key set
// (list_library_ids_matching_filters_impl) instead of a single full
// libraryRepository.list() array filtered in JS — this stands in for both,
// splitting one fixture array into the two shapes the real commands return.
function seedLibrary(items: LibraryFixtureItem[]) {
  mocks.plannedCandidates.mockImplementation((mediaType: "movie" | "series") =>
    Promise.resolve(
      items
        .filter((item) => item.mediaType === mediaType && item.status === "planned")
        .map((item) => ({ mediaId: item.mediaId, mediaType: item.mediaType }))
    )
  );
  mocks.idsMatchingFilters.mockResolvedValue(
    items
      .filter((item) => item.status === "completed")
      .map((item) => ({ mediaId: item.mediaId, mediaType: item.mediaType }))
  );
  mocks.completedCandidates.mockImplementation((mediaType: "movie" | "series") =>
    Promise.resolve(
      items
        .filter((item) => item.mediaType === mediaType && item.status === "completed")
        .map((item) => ({ mediaId: item.mediaId, mediaType: item.mediaType, genres: item.genres ?? [] }))
    )
  );
}

describe("watchTonightService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedLibrary([]);
    mocks.listDismissed.mockResolvedValue([]);
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

    expect(mocks.discoverMovies).toHaveBeenCalledWith({
      genre: undefined,
      provider: undefined,
      maxRuntime: undefined,
      originCountry: undefined,
    });
    expect(mocks.discoverSeries).toHaveBeenCalledWith({
      genre: undefined,
      provider: undefined,
      maxRuntime: undefined,
      originCountry: undefined,
    });
    expect(result.movies).toHaveLength(4);
    expect(result.series).toHaveLength(4);
  });

  it("keeps planned movies only when the selected provider is available", async () => {
    seedLibrary([
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
    seedLibrary([
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
    seedLibrary([
      { mediaId: 30, mediaType: "series", status: "planned" },
      { mediaId: 31, mediaType: "series", status: "planned" },
    ]);
    mocks.getSeriesDetails.mockImplementation((id: number) =>
      Promise.resolve(series(id, { genreIds: id === 30 ? [10765] : [35], runtime: id === 30 ? 30 : 90 }))
    );

    const result = await watchTonightService.pick({ genreSeries: 10765, maxRuntime: 45 });

    expect(result.series.map((item) => item.id)).toEqual([30]);
  });

  it("filters planned candidates by origin country, and passes it through to the catalogue fallback", async () => {
    seedLibrary([
      { mediaId: 40, mediaType: "movie", status: "planned" },
      { mediaId: 41, mediaType: "movie", status: "planned" },
    ]);
    mocks.getMovieDetails.mockImplementation((id: number) =>
      Promise.resolve(movie(id, { country: id === 40 ? ["KR"] : ["US"] }))
    );

    const result = await watchTonightService.pick({ originCountry: "KR" });

    expect(result.movies.map((item) => item.id)).toEqual([40]);
    expect(mocks.discoverSeries).toHaveBeenCalledWith(expect.objectContaining({ originCountry: "KR" }));
  });

  it("logs a warning and drops the candidate when getMovieDetails rejects for one planned movie, without failing the whole pick", async () => {
    seedLibrary([
      { mediaId: 40, mediaType: "movie", status: "planned" },
      { mediaId: 41, mediaType: "movie", status: "planned" },
    ]);
    mocks.getMovieDetails.mockImplementation((id: number) =>
      id === 40 ? Promise.reject(new Error("network down")) : Promise.resolve(movie(id))
    );

    const result = await watchTonightService.pick({});

    expect(result.movies.map((item) => item.id)).toEqual([41]);
    expect(mocks.discoverMovies).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(expect.stringContaining("40"));
  });

  it("logs a warning and drops the candidate when getSeriesDetails rejects for one planned series, without failing the whole pick", async () => {
    seedLibrary([
      { mediaId: 50, mediaType: "series", status: "planned" },
      { mediaId: 51, mediaType: "series", status: "planned" },
    ]);
    mocks.getSeriesDetails.mockImplementation((id: number) =>
      id === 50 ? Promise.reject(new Error("network down")) : Promise.resolve(series(id))
    );

    const result = await watchTonightService.pick({});

    expect(result.series.map((item) => item.id)).toEqual([51]);
    expect(mocks.discoverSeries).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(expect.stringContaining("50"));
  });

  it("keeps a planned candidate available on any of several preferred providers (OR match)", async () => {
    seedLibrary([
      { mediaId: 10, mediaType: "movie", status: "planned" },
      { mediaId: 11, mediaType: "movie", status: "planned" },
      { mediaId: 12, mediaType: "movie", status: "planned" },
    ]);
    mocks.getMovieDetails.mockImplementation((id: number) => Promise.resolve(movie(id)));
    mocks.getWatchAvailability.mockImplementation((_type: string, id: number) =>
      Promise.resolve({
        link: null,
        flatrate: id === 10 ? [{ id: 8, name: "Netflix" }] : id === 11 ? [{ id: 337, name: "Disney+" }] : [],
        free: [],
        rent: [],
        buy: [],
      })
    );

    const result = await watchTonightService.pick({ provider: [8, 337] });

    expect(result.movies.map((item) => item.id).sort()).toEqual([10, 11]);
    expect(mocks.discoverMovies).not.toHaveBeenCalled();
  });

  it("joins multiple provider ids with a pipe when falling back to catalogue discovery", async () => {
    seedLibrary([]);

    await watchTonightService.pick({ provider: [8, 337] });

    expect(mocks.discoverMovies).toHaveBeenCalledWith({
      genre: undefined,
      provider: [8, 337],
      maxRuntime: undefined,
      originCountry: undefined,
    });
    expect(mocks.discoverSeries).toHaveBeenCalledWith({
      genre: undefined,
      provider: [8, 337],
      maxRuntime: undefined,
      originCountry: undefined,
    });
  });

  it("drops a catalogue-fallback movie already completed in the library when hideWatched is on", async () => {
    seedLibrary([{ mediaId: 2, mediaType: "movie", status: "completed" }]);

    const result = await watchTonightService.pick({ hideWatched: true });

    expect(result.movies.map((item) => item.id)).not.toContain(2);
  });

  it("drops a catalogue-fallback series already completed in the library when hideWatched is on", async () => {
    seedLibrary([{ mediaId: 2, mediaType: "series", status: "completed" }]);

    const result = await watchTonightService.pick({ hideWatched: true });

    expect(result.series.map((item) => item.id)).not.toContain(2);
  });

  it("keeps an already-completed catalogue-fallback title when hideWatched is off (the default)", async () => {
    seedLibrary([{ mediaId: 2, mediaType: "movie", status: "completed" }]);

    const result = await watchTonightService.pick({});

    expect(result.movies.map((item) => item.id)).toContain(2);
  });

  it("always drops a dismissed ('not interested') movie, regardless of hideWatched", async () => {
    mocks.listDismissed.mockResolvedValue([{ mediaId: 2, mediaType: "movie", title: "Film 2" }]);

    const result = await watchTonightService.pick({});

    expect(result.movies.map((item) => item.id)).not.toContain(2);
  });

  it("always drops a dismissed ('not interested') series, regardless of hideWatched", async () => {
    mocks.listDismissed.mockResolvedValue([{ mediaId: 3, mediaType: "series", title: "Série 3" }]);

    const result = await watchTonightService.pick({});

    expect(result.series.map((item) => item.id)).not.toContain(3);
  });

  it("caps picks at PICKS_PER_TYPE (8) when more planned candidates match than that, for both movies and series", async () => {
    seedLibrary([
      { mediaId: 60, mediaType: "movie", status: "planned" },
      { mediaId: 61, mediaType: "movie", status: "planned" },
      { mediaId: 62, mediaType: "movie", status: "planned" },
      { mediaId: 63, mediaType: "movie", status: "planned" },
      { mediaId: 64, mediaType: "movie", status: "planned" },
      { mediaId: 65, mediaType: "movie", status: "planned" },
      { mediaId: 66, mediaType: "movie", status: "planned" },
      { mediaId: 67, mediaType: "movie", status: "planned" },
      { mediaId: 68, mediaType: "movie", status: "planned" },
      { mediaId: 70, mediaType: "series", status: "planned" },
      { mediaId: 71, mediaType: "series", status: "planned" },
      { mediaId: 72, mediaType: "series", status: "planned" },
      { mediaId: 73, mediaType: "series", status: "planned" },
      { mediaId: 74, mediaType: "series", status: "planned" },
      { mediaId: 75, mediaType: "series", status: "planned" },
      { mediaId: 76, mediaType: "series", status: "planned" },
      { mediaId: 77, mediaType: "series", status: "planned" },
    ]);
    mocks.getMovieDetails.mockImplementation((id: number) => Promise.resolve(movie(id)));
    mocks.getSeriesDetails.mockImplementation((id: number) => Promise.resolve(series(id)));

    const result = await watchTonightService.pick({});

    expect(result.movies).toHaveLength(8);
    expect(result.series).toHaveLength(8);
    expect(mocks.discoverMovies).not.toHaveBeenCalled();
    expect(mocks.discoverSeries).not.toHaveBeenCalled();
  });

  describe("ranking and reason", () => {
    it("ranks a candidate matching the profile's completed-genre affinity above one that doesn't, with a genre reason", async () => {
      seedLibrary([
        { mediaId: 1, mediaType: "movie", status: "completed", genres: ["Drama"] },
        { mediaId: 2, mediaType: "movie", status: "completed", genres: ["Drama"] },
        { mediaId: 100, mediaType: "movie", status: "planned" },
        { mediaId: 101, mediaType: "movie", status: "planned" },
      ]);
      mocks.getMovieDetails.mockImplementation(
        (id: number) => Promise.resolve(movie(id, { genreIds: id === 100 ? [18] : [27] })) // 18 = Drama, 27 = Horror
      );

      const result = await watchTonightService.pick({});

      expect(result.movies.map((item) => item.id)).toEqual([100, 101]);
      expect(result.movies[0]?.watchTonightReason).toEqual({ kind: "genre", genreLabelKey: "genres.drama" });
      expect(result.movies[1]?.watchTonightReason).toBeNull();
    });

    it("falls back to a highlyRated reason, ranked by rating, when no candidate matches the genre affinity", async () => {
      seedLibrary([
        { mediaId: 200, mediaType: "movie", status: "planned" },
        { mediaId: 201, mediaType: "movie", status: "planned" },
      ]);
      mocks.getMovieDetails.mockImplementation((id: number) =>
        Promise.resolve(movie(id, { rating: id === 200 ? 9 : 5 }))
      );

      const result = await watchTonightService.pick({});

      expect(result.movies.map((item) => item.id)).toEqual([200, 201]);
      expect(result.movies[0]?.watchTonightReason).toEqual({ kind: "highlyRated" });
      expect(result.movies[1]?.watchTonightReason).toBeNull();
    });

    it("does not surface a genre reason off a single completed title in that genre — ranking only, no explanation", async () => {
      seedLibrary([
        { mediaId: 1, mediaType: "movie", status: "completed", genres: ["Drama"] },
        { mediaId: 300, mediaType: "movie", status: "planned" },
      ]);
      mocks.getMovieDetails.mockImplementation((id: number) =>
        Promise.resolve(movie(id, { genreIds: [18], rating: 5 }))
      );

      const result = await watchTonightService.pick({});

      expect(result.movies[0]?.watchTonightReason).toBeNull();
    });
  });
});
