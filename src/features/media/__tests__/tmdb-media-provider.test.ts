import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserPreferences } from "@/types/media";
import type {
  TmdbMovieDto,
  TmdbMultiSearchResultDto,
  TmdbTvDto,
  TmdbVideoDto,
  TmdbWatchProviderDto,
} from "@/features/media/api/types";

const mocks = vi.hoisted(() => ({
  tmdbFetch: vi.fn(),
  getPreferences: vi.fn(),
}));

vi.mock("@/features/media/api/client", () => ({
  tmdbFetch: mocks.tmdbFetch,
}));

vi.mock("@/features/preferences/preferences-repository", () => ({
  preferencesRepository: {
    getPreferences: mocks.getPreferences,
  },
}));

import { TmdbMediaProvider } from "../tmdb-media-provider";

const basePreferences = (overrides: Partial<UserPreferences> = {}): UserPreferences =>
  ({
    language: "en",
    region: "US",
    ...overrides,
  }) as UserPreferences;

const emptyListResponse = { page: 1, total_pages: 0, total_results: 0, results: [] };

const movieDto = (overrides: Partial<TmdbMovieDto> = {}): TmdbMovieDto => ({
  id: 1,
  title: "A Movie",
  original_title: "A Movie",
  overview: "overview",
  poster_path: null,
  backdrop_path: null,
  release_date: "2020-01-01",
  vote_average: 7,
  ...overrides,
});

const tvDto = (overrides: Partial<TmdbTvDto> = {}): TmdbTvDto => ({
  id: 2,
  name: "A Series",
  original_name: "A Series",
  overview: "overview",
  poster_path: null,
  backdrop_path: null,
  first_air_date: "2020-01-01",
  vote_average: 8,
  ...overrides,
});

describe("TmdbMediaProvider", () => {
  let provider: TmdbMediaProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new TmdbMediaProvider();
    mocks.getPreferences.mockResolvedValue(basePreferences());
  });

  describe("context resolution", () => {
    it("prefers an explicit region override over preferences.region", async () => {
      mocks.getPreferences.mockResolvedValue(basePreferences({ region: "FR" }));
      mocks.tmdbFetch.mockResolvedValue({ results: [] });

      await provider.getWatchProviders("movie", "DE");

      expect(mocks.tmdbFetch).toHaveBeenCalledWith(
        "/watch/providers/movie",
        expect.objectContaining({ watch_region: "DE" })
      );
    });

    it("falls back to preferences.region when no override is given", async () => {
      mocks.getPreferences.mockResolvedValue(basePreferences({ region: "FR" }));
      mocks.tmdbFetch.mockResolvedValue({ results: [] });

      await provider.getWatchProviders("movie");

      expect(mocks.tmdbFetch).toHaveBeenCalledWith(
        "/watch/providers/movie",
        expect.objectContaining({ watch_region: "FR" })
      );
    });

    it("maps language 'fr' to 'fr-FR'", async () => {
      mocks.getPreferences.mockResolvedValue(basePreferences({ language: "fr" }));
      mocks.tmdbFetch.mockResolvedValue(emptyListResponse);

      await provider.getTrendingMovies();

      expect(mocks.tmdbFetch).toHaveBeenCalledWith(
        "/trending/movie/week",
        expect.objectContaining({ language: "fr-FR" })
      );
    });

    it("maps any other language (e.g. 'en') to 'en-US'", async () => {
      mocks.getPreferences.mockResolvedValue(basePreferences({ language: "en" }));
      mocks.tmdbFetch.mockResolvedValue(emptyListResponse);

      await provider.getTrendingMovies();

      expect(mocks.tmdbFetch).toHaveBeenCalledWith(
        "/trending/movie/week",
        expect.objectContaining({ language: "en-US" })
      );
    });
  });

  describe("getHomeFeed", () => {
    it("resolves context once and places each feed under the correct key", async () => {
      mocks.tmdbFetch.mockImplementation((path: string) => {
        if (path === "/trending/tv/week") return Promise.resolve({ ...emptyListResponse, results: [tvDto({ id: 1 })] });
        if (path === "/tv/top_rated") return Promise.resolve({ ...emptyListResponse, results: [tvDto({ id: 2 })] });
        if (path === "/tv/on_the_air") return Promise.resolve({ ...emptyListResponse, results: [tvDto({ id: 3 })] });
        if (path === "/trending/movie/week")
          return Promise.resolve({ ...emptyListResponse, results: [movieDto({ id: 4 })] });
        if (path === "/movie/top_rated")
          return Promise.resolve({ ...emptyListResponse, results: [movieDto({ id: 5 })] });
        if (path === "/movie/now_playing")
          return Promise.resolve({ ...emptyListResponse, results: [movieDto({ id: 6 })] });
        if (path === "/movie/upcoming")
          return Promise.resolve({ ...emptyListResponse, results: [movieDto({ id: 7 })] });
        throw new Error(`unexpected path ${path}`);
      });

      const feed = await provider.getHomeFeed();

      expect(mocks.getPreferences).toHaveBeenCalledTimes(1);
      expect(feed.trendingSeries.map((s) => s.id)).toEqual([1]);
      expect(feed.topRatedSeries.map((s) => s.id)).toEqual([2]);
      expect(feed.onTheAirSeries.map((s) => s.id)).toEqual([3]);
      expect(feed.trendingMovies.map((m) => m.id)).toEqual([4]);
      expect(feed.topRatedMovies.map((m) => m.id)).toEqual([5]);
      expect(feed.nowPlayingMovies.map((m) => m.id)).toEqual([6]);
      expect(feed.upcomingMovies.map((m) => m.id)).toEqual([7]);
    });
  });

  describe("discoverMovies / discoverSeries", () => {
    it("sets watch_region/with_watch_providers/monetization when a provider is given (movies)", async () => {
      mocks.getPreferences.mockResolvedValue(basePreferences({ region: "GB" }));
      mocks.tmdbFetch.mockResolvedValue(emptyListResponse);

      await provider.discoverMovies({ provider: 8 });

      const [, params] = mocks.tmdbFetch.mock.calls[0]!;
      expect(params).toMatchObject({
        watch_region: "GB",
        with_watch_providers: 8,
        with_watch_monetization_types: "flatrate",
      });
    });

    it("leaves watch_region/with_watch_providers/monetization undefined without a provider (movies)", async () => {
      mocks.tmdbFetch.mockResolvedValue(emptyListResponse);

      await provider.discoverMovies({});

      const [, params] = mocks.tmdbFetch.mock.calls[0]!;
      expect(params.watch_region).toBeUndefined();
      expect(params.with_watch_providers).toBeUndefined();
      expect(params.with_watch_monetization_types).toBeUndefined();
    });

    it("sets watch_region/with_watch_providers/monetization when a provider is given (series)", async () => {
      mocks.getPreferences.mockResolvedValue(basePreferences({ region: "GB" }));
      mocks.tmdbFetch.mockResolvedValue(emptyListResponse);

      await provider.discoverSeries({ provider: 9 });

      const [, params] = mocks.tmdbFetch.mock.calls[0]!;
      expect(params).toMatchObject({
        watch_region: "GB",
        with_watch_providers: 9,
        with_watch_monetization_types: "flatrate",
      });
    });

    it("leaves watch_region/with_watch_providers/monetization undefined without a provider (series)", async () => {
      mocks.tmdbFetch.mockResolvedValue(emptyListResponse);

      await provider.discoverSeries({});

      const [, params] = mocks.tmdbFetch.mock.calls[0]!;
      expect(params.watch_region).toBeUndefined();
      expect(params.with_watch_providers).toBeUndefined();
      expect(params.with_watch_monetization_types).toBeUndefined();
    });
  });

  describe("getWatchProviders", () => {
    it("filters providers missing the current region's display_priorities, keeps providers with none, and sorts ascending", async () => {
      mocks.getPreferences.mockResolvedValue(basePreferences({ region: "US" }));
      const withRegion: TmdbWatchProviderDto = {
        provider_id: 1,
        provider_name: "HasRegionLow",
        logo_path: null,
        display_priority: 99,
        display_priorities: { US: 2 },
      };
      const withOtherRegionOnly: TmdbWatchProviderDto = {
        provider_id: 2,
        provider_name: "MissingRegion",
        logo_path: null,
        display_priority: 1,
        display_priorities: { FR: 1 },
      };
      const noPriorities: TmdbWatchProviderDto = {
        provider_id: 3,
        provider_name: "NoPriorities",
        logo_path: null,
        display_priority: 0,
      };
      mocks.tmdbFetch.mockResolvedValue({ results: [withRegion, withOtherRegionOnly, noPriorities] });

      const result = await provider.getWatchProviders("movie");

      expect(result.map((p) => p.name)).toEqual(["NoPriorities", "HasRegionLow"]);
    });
  });

  describe("search", () => {
    it("short-circuits on an empty query without calling tmdbFetch (scope=all)", async () => {
      const result = await provider.search("   ");

      expect(mocks.tmdbFetch).not.toHaveBeenCalled();
      expect(result).toEqual({ page: 1, totalPages: 0, totalResults: 0, results: [] });
    });

    it("calls /search/movie for scope=movie", async () => {
      mocks.tmdbFetch.mockResolvedValue({ ...emptyListResponse, results: [movieDto()] });

      await provider.search("dune", "movie");

      expect(mocks.tmdbFetch).toHaveBeenCalledWith("/search/movie", expect.objectContaining({ query: "dune" }));
    });

    it("calls /search/tv for scope=series", async () => {
      mocks.tmdbFetch.mockResolvedValue({ ...emptyListResponse, results: [tvDto()] });

      await provider.search("severance", "series");

      expect(mocks.tmdbFetch).toHaveBeenCalledWith("/search/tv", expect.objectContaining({ query: "severance" }));
    });

    it("scope=all calls /search/multi and drops person results, mapping movie/tv correctly", async () => {
      const personResult: TmdbMultiSearchResultDto = { media_type: "person" };
      const movieResult: TmdbMultiSearchResultDto = { ...movieDto({ id: 10 }), media_type: "movie" };
      const tvResult: TmdbMultiSearchResultDto = { ...tvDto({ id: 20 }), media_type: "tv" };
      mocks.tmdbFetch.mockResolvedValue({
        ...emptyListResponse,
        results: [personResult, movieResult, tvResult],
      });

      const result = await provider.search("query");

      expect(mocks.tmdbFetch).toHaveBeenCalledWith("/search/multi", expect.objectContaining({ query: "query" }));
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toMatchObject({ id: 10, mediaType: "movie" });
      expect(result.results[1]).toMatchObject({ id: 20, mediaType: "series" });
    });
  });

  describe("getWatchAvailability", () => {
    it("falls back to an all-empty availability object when the region is missing, without throwing", async () => {
      mocks.getPreferences.mockResolvedValue(basePreferences({ region: "US" }));
      mocks.tmdbFetch.mockResolvedValue({ results: {} });

      const availability = await provider.getWatchAvailability("movie", 1);

      expect(availability).toEqual({
        region: "US",
        link: undefined,
        flatrate: [],
        rent: [],
        buy: [],
        free: [],
      });
    });

    it("maps flatrate/rent/buy/free when present, defaulting missing ones to []", async () => {
      mocks.getPreferences.mockResolvedValue(basePreferences({ region: "US" }));
      const p: TmdbWatchProviderDto = {
        provider_id: 5,
        provider_name: "Netflix",
        logo_path: null,
        display_priority: 0,
      };
      mocks.tmdbFetch.mockResolvedValue({
        results: {
          US: {
            link: "https://example.com",
            flatrate: [p],
            // rent/buy/free intentionally absent
          },
        },
      });

      const availability = await provider.getWatchAvailability("movie", 1);

      expect(availability.link).toBe("https://example.com");
      expect(availability.flatrate).toEqual([{ id: 5, name: "Netflix", logoPath: null, displayPriority: 0 }]);
      expect(availability.rent).toEqual([]);
      expect(availability.buy).toEqual([]);
      expect(availability.free).toEqual([]);
    });
  });

  describe("getRecommendations", () => {
    it("uses the movie endpoint and mapper for mediaType=movie", async () => {
      mocks.tmdbFetch.mockResolvedValue({ ...emptyListResponse, results: [movieDto({ id: 42 })] });

      const result = await provider.getRecommendations("movie", 1);

      expect(mocks.tmdbFetch).toHaveBeenCalledWith("/movie/1/recommendations", expect.anything());
      expect(result.results[0]).toMatchObject({ id: 42, mediaType: "movie" });
    });

    it("uses the tv endpoint and mapper for mediaType=series", async () => {
      mocks.tmdbFetch.mockResolvedValue({ ...emptyListResponse, results: [tvDto({ id: 43 })] });

      const result = await provider.getRecommendations("series", 1);

      expect(mocks.tmdbFetch).toHaveBeenCalledWith("/tv/1/recommendations", expect.anything());
      expect(result.results[0]).toMatchObject({ id: 43, mediaType: "series" });
    });
  });

  describe("getVideos", () => {
    it("filters out non-YouTube videos and sorts official videos before unofficial ones", async () => {
      const unofficialYoutube: TmdbVideoDto = {
        id: "1",
        key: "abc",
        name: "Unofficial Clip",
        site: "YouTube",
        type: "Clip",
        official: false,
      };
      const officialYoutube: TmdbVideoDto = {
        id: "2",
        key: "def",
        name: "Official Trailer",
        site: "YouTube",
        type: "Trailer",
        official: true,
      };
      const nonYoutube: TmdbVideoDto = {
        id: "3",
        key: "ghi",
        name: "Vimeo Clip",
        site: "Vimeo",
        type: "Clip",
        official: true,
      };
      mocks.tmdbFetch.mockResolvedValue({ results: [unofficialYoutube, officialYoutube, nonYoutube] });

      const videos = await provider.getVideos("movie", 1);

      expect(videos.map((v) => v.key)).toEqual(["def", "abc"]);
    });
  });

  describe("findSeriesByTvdbId", () => {
    it("maps the first tv_results match to a Series", async () => {
      mocks.tmdbFetch.mockResolvedValue({ tv_results: [tvDto({ id: 99 })] });

      const result = await provider.findSeriesByTvdbId(555);

      expect(result).toMatchObject({ id: 99, mediaType: "series" });
    });

    it("returns null when tv_results is empty", async () => {
      mocks.tmdbFetch.mockResolvedValue({ tv_results: [] });

      const result = await provider.findSeriesByTvdbId(555);

      expect(result).toBeNull();
    });
  });

  describe("searchPeople", () => {
    it("short-circuits on an empty query without calling tmdbFetch", async () => {
      const result = await provider.searchPeople("  ");

      expect(mocks.tmdbFetch).not.toHaveBeenCalled();
      expect(result).toEqual({ page: 1, totalPages: 0, totalResults: 0, results: [] });
    });

    it("calls /search/person for a non-empty query", async () => {
      mocks.tmdbFetch.mockResolvedValue({
        ...emptyListResponse,
        results: [{ id: 1, name: "Someone", profile_path: null }],
      });

      await provider.searchPeople("someone");

      expect(mocks.tmdbFetch).toHaveBeenCalledWith("/search/person", expect.objectContaining({ query: "someone" }));
    });
  });
});
