import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import { makeLibraryItem } from "@/shared/test-utils";
import { DEFAULT_SMART_LIST_RULES } from "@/features/smart-lists/smart-list-evaluation";
import type { AvailabilitySnapshot, LibraryItem, Movie, SmartListRules, TrackedSeriesItem } from "@/types/media";

const getPreferencesMock = vi.fn(
  async () => ({ activeProfileId: DEFAULT_PROFILE_ID, preferredProviderIds: [] as number[] }) as never
);
vi.mock("@/features/preferences/preferences-repository", () => ({
  preferencesRepository: { getPreferences: () => getPreferencesMock() },
}));

// The prefilter (idsMatchingFilters) and the full-row batch fetch
// (getItemsByKeys) both stand in for Rust's own filtering — which is
// tested directly against real SQL in src-tauri/src/library/repository.rs
// — by returning the whole fixture unconditionally, regardless of the
// filter params or keys actually passed. What these tests exercise is the
// hook's own client-side post-filter (matchesSmartListRules), unchanged
// and still real below.
let libraryItems: LibraryItem[] = [];
let libraryIsError = false;
vi.mock("@/features/library/library-repository", () => ({
  libraryRepository: {
    idsMatchingFilters: () =>
      libraryIsError
        ? Promise.reject(new Error("boom"))
        : Promise.resolve(libraryItems.map((item) => ({ mediaId: item.mediaId, mediaType: item.mediaType }))),
    getItemsByKeys: () => Promise.resolve(libraryItems),
  },
}));

let trackedSeriesData: TrackedSeriesItem[] = [];
vi.mock("@/features/progress/use-progress", () => ({
  useTrackedSeries: () => ({
    data: trackedSeriesData,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// Stands in for Watch Next's per-series resolution (tested on its own in
// use-watch-next*.test.tsx): the series ids it "finds" a next aired episode
// for, and the ids it was asked to resolve.
let seriesWithNextEpisode = new Set<number>();
let failingSeriesIds = new Set<number>();
const resolvedRequests: number[][] = [];
vi.mock("@/features/progress/use-watch-next", () => ({
  useNextEpisodes: (seriesList: TrackedSeriesItem[]) => {
    resolvedRequests.push(seriesList.map((series) => series.seriesId));
    const results = seriesList.map((series) => ({
      series,
      nextEpisode: seriesWithNextEpisode.has(series.seriesId) ? { id: series.seriesId * 10 } : null,
      remaining: 0,
      isLoading: false,
      isError: failingSeriesIds.has(series.seriesId),
    }));
    return { entries: [], results, isLoading: false };
  },
}));

let snapshotsData: AvailabilitySnapshot[] = [];
vi.mock("@/features/availability/use-availability-alerts", () => ({
  useAvailabilitySnapshots: () => ({
    data: snapshotsData,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

const getMovieDetailsMock = vi.fn<(id: number) => Promise<Movie>>();
vi.mock("@/features/media/media-repository", () => ({
  mediaRepository: { getMovieDetails: (id: number) => getMovieDetailsMock(id) },
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  getPreferencesMock.mockClear();
  getMovieDetailsMock.mockReset();
  libraryItems = [];
  libraryIsError = false;
  trackedSeriesData = [];
  snapshotsData = [];
  seriesWithNextEpisode = new Set();
  failingSeriesIds = new Set();
  resolvedRequests.length = 0;
});

describe("useSmartListMatches", () => {
  it("returns no items when no rules are given", async () => {
    libraryItems = [makeLibraryItem()];
    const { useSmartListMatches } = await import("../use-smart-list-matches");
    const { result } = renderHook(() => useSmartListMatches(undefined), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([]);
  });

  it("filters the library by the given rules", async () => {
    libraryItems = [
      makeLibraryItem({ mediaId: 1, status: "planned", title: "Waiting to watch" }),
      makeLibraryItem({ mediaId: 2, status: "completed", title: "Already watched" }),
    ];
    const { useSmartListMatches } = await import("../use-smart-list-matches");
    const activeRules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, status: "planned" };
    const { result } = renderHook(() => useSmartListMatches(activeRules), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.map((item) => item.id)).toEqual([1]);
  });

  it("propagates a library load error", async () => {
    libraryIsError = true;
    const { useSmartListMatches } = await import("../use-smart-list-matches");
    const { result } = renderHook(() => useSmartListMatches(DEFAULT_SMART_LIST_RULES), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("does not fetch movie runtime when no maxRuntimeMinutes rule is set", async () => {
    libraryItems = [makeLibraryItem({ mediaType: "movie" })];
    const { useSmartListMatches } = await import("../use-smart-list-matches");
    const { result } = renderHook(() => useSmartListMatches(DEFAULT_SMART_LIST_RULES), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getMovieDetailsMock).not.toHaveBeenCalled();
  });

  it("resolves each movie's runtime and applies the maxRuntimeMinutes rule once it loads", async () => {
    libraryItems = [
      makeLibraryItem({ mediaId: 1, mediaType: "movie", title: "Short film" }),
      makeLibraryItem({ mediaId: 2, mediaType: "movie", title: "Long film" }),
    ];
    getMovieDetailsMock.mockImplementation(async (id) => ({ id, runtime: id === 1 ? 90 : 160 }) as unknown as Movie);

    const activeRules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, maxRuntimeMinutes: 100 };
    const { useSmartListMatches } = await import("../use-smart-list-matches");
    const { result } = renderHook(() => useSmartListMatches(activeRules), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.map((item) => item.id)).toEqual([1]);
    expect(getMovieDetailsMock).toHaveBeenCalledWith(1);
    expect(getMovieDetailsMock).toHaveBeenCalledWith(2);
  });
  describe("the episode-waiting rule", () => {
    const tracked = (seriesId: number, watchedEpisodes: number, totalEpisodes: number): TrackedSeriesItem => ({
      id: String(seriesId),
      profileId: null,
      seriesId,
      title: "Show " + seriesId,
      posterPath: null,
      backdropPath: null,
      totalEpisodes,
      watchedEpisodes,
      status: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, mediaType: "series", hasEpisodeWaiting: true };

    it("follows the resolved next episode, not the approximate tracked totals", async () => {
      libraryItems = [
        makeLibraryItem({ mediaId: 1, mediaType: "series", title: "Stale cache says caught up" }),
        makeLibraryItem({ mediaId: 2, mediaType: "series", title: "Stale cache says behind" }),
      ];
      // Series 1: cache is at 3/3 but a new episode aired. Series 2: cache
      // says 1/10 but every aired episode is watched.
      trackedSeriesData = [tracked(1, 3, 3), tracked(2, 1, 10)];
      seriesWithNextEpisode = new Set([1]);
      const { useSmartListMatches } = await import("../use-smart-list-matches");
      const { result } = renderHook(() => useSmartListMatches(rules), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.items.map((item) => item.id)).toEqual([1]);
    });

    it("only resolves started series of the library, and only when the rule is set", async () => {
      libraryItems = [
        makeLibraryItem({ mediaId: 1, mediaType: "series" }),
        makeLibraryItem({ mediaId: 2, mediaType: "series" }),
      ];
      trackedSeriesData = [tracked(1, 2, 5), tracked(2, 0, 5), tracked(3, 4, 5)];
      const { useSmartListMatches } = await import("../use-smart-list-matches");

      const { result } = renderHook(() => useSmartListMatches(rules), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(resolvedRequests[resolvedRequests.length - 1]).toEqual([1]);

      resolvedRequests.length = 0;
      const withoutRule = renderHook(() => useSmartListMatches(DEFAULT_SMART_LIST_RULES), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(withoutRule.result.current.isLoading).toBe(false));
      expect(resolvedRequests.every((ids) => ids.length === 0)).toBe(true);
    });

    it("reports an error rather than a silently shorter list when a series cannot be resolved", async () => {
      libraryItems = [makeLibraryItem({ mediaId: 1, mediaType: "series" })];
      trackedSeriesData = [tracked(1, 2, 5)];
      failingSeriesIds = new Set([1]);
      const { useSmartListMatches } = await import("../use-smart-list-matches");
      const { result } = renderHook(() => useSmartListMatches(rules), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  it("does not list a movie whose TMDB runtime is 0 (unknown) under a max-runtime rule", async () => {
    libraryItems = [
      makeLibraryItem({ mediaId: 1, mediaType: "movie", title: "Known" }),
      makeLibraryItem({ mediaId: 2, mediaType: "movie", title: "Unknown runtime" }),
    ];
    getMovieDetailsMock.mockImplementation(async (id) => ({ id, runtime: id === 1 ? 90 : 0 }) as unknown as Movie);

    const activeRules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, maxRuntimeMinutes: 100 };
    const { useSmartListMatches } = await import("../use-smart-list-matches");
    const { result } = renderHook(() => useSmartListMatches(activeRules), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.map((item) => item.id)).toEqual([1]);
  });

  it("reports an error instead of an empty list when the runtimes cannot be loaded (TMDB unavailable)", async () => {
    libraryItems = [makeLibraryItem({ mediaId: 1, mediaType: "movie" })];
    getMovieDetailsMock.mockRejectedValue(new Error("network down"));

    const activeRules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, maxRuntimeMinutes: 100 };
    const { useSmartListMatches } = await import("../use-smart-list-matches");
    const { result } = renderHook(() => useSmartListMatches(activeRules), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isLoading).toBe(false);
  });

  it("keeps a smart list without a runtime rule working when TMDB is unavailable", async () => {
    libraryItems = [makeLibraryItem({ mediaId: 1, mediaType: "movie" })];
    getMovieDetailsMock.mockRejectedValue(new Error("network down"));

    const { useSmartListMatches } = await import("../use-smart-list-matches");
    const { result } = renderHook(() => useSmartListMatches(DEFAULT_SMART_LIST_RULES), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.items.map((item) => item.id)).toEqual([1]);
  });
});
