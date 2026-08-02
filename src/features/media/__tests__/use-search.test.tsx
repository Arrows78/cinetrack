import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import type { MediaSummary, PageResult } from "@/types/media";

function page(results: MediaSummary[], pageNumber = 1, totalPages = 1): PageResult<MediaSummary> {
  return { page: pageNumber, totalPages, totalResults: results.length, results };
}

function summary(id: number, title: string): MediaSummary {
  return {
    id,
    mediaType: "movie",
    title,
    overview: "",
    posterPath: null,
    backdropPath: null,
    year: 2024,
    rating: null,
    genres: [],
    cast: [],
  };
}

const searchMock = vi.fn(async (query: string) => page([summary(1, query)]));
const discoverMoviesMock = vi.fn(async () => page([summary(2, "Discovered Movie")]));
const discoverSeriesMock = vi.fn(async () => page([summary(3, "Discovered Series")]));

vi.mock("@/features/media/media-repository", () => ({
  mediaRepository: {
    search: searchMock,
    discoverMovies: discoverMoviesMock,
    discoverSeries: discoverSeriesMock,
  },
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  searchMock.mockClear();
  discoverMoviesMock.mockClear();
  discoverSeriesMock.mockClear();
});

describe("useSearch", () => {
  it("is disabled below the minimum query length and enabled at it", async () => {
    const { useSearch } = await import("../use-search");
    const wrapper = createWrapper();

    const { result: tooShort } = renderHook(() => useSearch("a", "all"), { wrapper });
    expect(tooShort.current.fetchStatus).toBe("idle");
    expect(searchMock).not.toHaveBeenCalled();

    const { result: longEnough } = renderHook(() => useSearch("batman", "movie"), { wrapper });
    await waitFor(() => expect(longEnough.current.isLoading).toBe(false));
    expect(searchMock).toHaveBeenCalledWith("batman", "movie", 1);
    expect(longEnough.current.items).toEqual([summary(1, "batman")]);
  });

  it("routes to discoverMovies when a movie genre filter is set", async () => {
    const { useSearch } = await import("../use-search");
    const { result } = renderHook(() => useSearch("", "movie", { genreMovie: "28" }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(discoverMoviesMock).toHaveBeenCalledWith(expect.objectContaining({ genre: 28, page: 1 }));
    expect(searchMock).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([summary(2, "Discovered Movie")]);
  });

  it("merges movie and series discovery results in 'all' scope", async () => {
    const { useSearch } = await import("../use-search");
    const { result } = renderHook(() => useSearch("", "all", { provider: "8" }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(discoverMoviesMock).toHaveBeenCalled();
    expect(discoverSeriesMock).toHaveBeenCalled();
    expect(result.current.items).toEqual([summary(2, "Discovered Movie"), summary(3, "Discovered Series")]);
  });

  it("returns an empty page when a series filter has neither genre nor provider", async () => {
    const { useSearch } = await import("../use-search");
    // hasFilters is true (genreMovie set) but scope is "series" with no genreSeries/provider.
    const { result } = renderHook(() => useSearch("", "series", { genreMovie: "28" }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(discoverSeriesMock).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
  });
});
