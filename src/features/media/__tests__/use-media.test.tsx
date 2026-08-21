import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import type { MediaSummary, PageResult } from "@/types/media";

function page(pageNumber: number, totalPages: number, count = 1): PageResult<MediaSummary> {
  return {
    page: pageNumber,
    totalPages,
    totalResults: totalPages * count,
    results: Array.from({ length: count }, (_, i) => ({
      id: pageNumber * 100 + i,
      mediaType: "movie",
      title: `Movie ${pageNumber}-${i}`,
      overview: "",
      posterPath: null,
      backdropPath: null,
      year: 2024,
      rating: null,
      genres: [],
      cast: [],
    })),
  };
}

const getHomeFeedMock = vi.fn(async () => ({ trendingMovies: [], trendingSeries: [] }) as never);
const getTrendingMoviesMock = vi.fn(async (pageParam: number) => page(pageParam, 2));
const getTrendingSeriesMock = vi.fn(async (pageParam: number) => page(pageParam, 1));
const getWatchProvidersMock = vi.fn(async () => [] as never);
const getMovieDetailsMock = vi.fn(async () => ({ id: 1 }) as never);
const getSeriesDetailsMock = vi.fn(async () => ({ id: 1 }) as never);
const getSeasonDetailsMock = vi.fn(
  async (seriesId: number, seasonNumber: number) => ({ seriesId, seasonNumber }) as never
);

vi.mock("@/features/media/media-repository", () => ({
  mediaRepository: {
    getHomeFeed: getHomeFeedMock,
    getTrendingMovies: getTrendingMoviesMock,
    getTrendingSeries: getTrendingSeriesMock,
    getWatchProviders: getWatchProvidersMock,
    getMovieDetails: getMovieDetailsMock,
    getSeriesDetails: getSeriesDetailsMock,
    getSeasonDetails: getSeasonDetailsMock,
  },
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  getHomeFeedMock.mockClear();
  getTrendingMoviesMock.mockClear();
  getTrendingSeriesMock.mockClear();
  getWatchProvidersMock.mockClear();
  getMovieDetailsMock.mockClear();
  getSeriesDetailsMock.mockClear();
  getSeasonDetailsMock.mockClear();
});

describe("useHomeFeed", () => {
  it("loads the home feed", async () => {
    const { useHomeFeed } = await import("../use-media");
    const { result } = renderHook(() => useHomeFeed(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getHomeFeedMock).toHaveBeenCalled();
  });
});

describe("useMovies", () => {
  it("exposes flattened items across pages and can fetch the next one", async () => {
    const { useMovies } = await import("../use-media");
    const { result } = renderHook(() => useMovies(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.hasNextPage).toBe(true);

    await result.current.fetchNextPage();

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(getTrendingMoviesMock).toHaveBeenCalledWith(2);
  });
});

describe("useSeries", () => {
  it("has no next page once totalPages is reached", async () => {
    const { useSeries } = await import("../use-media");
    const { result } = renderHook(() => useSeries(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.hasNextPage).toBe(false);
  });
});

describe("useMovieDetails / useSeriesDetails / useSeasonDetails", () => {
  it("is disabled for a non-finite id", async () => {
    const { useMovieDetails } = await import("../use-media");
    const { result } = renderHook(() => useMovieDetails(Number.NaN), { wrapper: createWrapper() });

    expect(result.current.fetchStatus).toBe("idle");
    expect(getMovieDetailsMock).not.toHaveBeenCalled();
  });

  it("fetches details for a finite series id", async () => {
    const { useSeriesDetails } = await import("../use-media");
    const { result } = renderHook(() => useSeriesDetails(10), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getSeriesDetailsMock).toHaveBeenCalledWith(10);
  });

  it("is disabled when either series or season id is not finite", async () => {
    const { useSeasonDetails } = await import("../use-media");
    const { result } = renderHook(() => useSeasonDetails(10, Number.NaN), { wrapper: createWrapper() });

    expect(result.current.fetchStatus).toBe("idle");
    expect(getSeasonDetailsMock).not.toHaveBeenCalled();
  });
});

describe("useSeriesSeasons", () => {
  it("fetches details for every requested season", async () => {
    const { useSeriesSeasons } = await import("../use-media");
    const { result } = renderHook(() => useSeriesSeasons(10, [1, 2]), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.every((query) => !query.isLoading)).toBe(true));
    expect(getSeasonDetailsMock).toHaveBeenCalledWith(10, 1);
    expect(getSeasonDetailsMock).toHaveBeenCalledWith(10, 2);
  });
});
