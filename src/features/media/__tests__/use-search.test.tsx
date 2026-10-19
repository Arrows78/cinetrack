import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import type { MediaSummary, Movie, PageResult } from "@/types/media";

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
const getMovieDetailsMock = vi.fn();
const getWatchAvailabilityMock = vi.fn();

vi.mock("@/features/media/media-repository", () => ({
  mediaRepository: {
    search: searchMock,
    discoverMovies: discoverMoviesMock,
    discoverSeries: discoverSeriesMock,
    getMovieDetails: getMovieDetailsMock,
    getWatchAvailability: getWatchAvailabilityMock,
  },
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  searchMock.mockReset().mockImplementation(async (query: string) => page([summary(1, query)]));
  discoverMoviesMock.mockReset().mockImplementation(async () => page([summary(2, "Discovered Movie")]));
  discoverSeriesMock.mockReset().mockImplementation(async () => page([summary(3, "Discovered Series")]));
  getMovieDetailsMock.mockReset();
  getWatchAvailabilityMock.mockReset();
});

describe("useSearch", () => {
  it("combines the typed title with its genre and refetches when the title changes", async () => {
    searchMock.mockResolvedValueOnce(
      page([
        { ...summary(1, "Batman"), genreIds: [28] },
        { ...summary(2, "Batman documentary"), genreIds: [99] },
      ])
    );
    searchMock.mockResolvedValueOnce(page([{ ...summary(3, "Superman"), genreIds: [28] }]));
    const { useSearch } = await import("../use-search");
    const { result, rerender } = renderHook(({ query }) => useSearch(query, "movie", { genreMovie: "28" }), {
      wrapper: createWrapper(),
      initialProps: { query: "batman" },
    });
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual([1]));
    expect(searchMock).toHaveBeenCalledWith("batman", "movie", 1);
    expect(discoverMoviesMock).not.toHaveBeenCalled();
    rerender({ query: "superman" });
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual([3]));
  });

  it("combines studio and subscription filters in the selected country, preserving relevance order", async () => {
    searchMock.mockResolvedValueOnce(
      page([summary(1, "Spider-Man"), summary(2, "Spider-Man 2"), summary(3, "Spider-Man 3")])
    );
    getMovieDetailsMock.mockImplementation(
      async (id: number) => ({ ...summary(id, "Spider-Man"), productionCompanyIds: id === 3 ? [99] : [420] }) as Movie
    );
    getWatchAvailabilityMock.mockImplementation(async (_type: string, id: number) => ({
      flatrate: id === 2 ? [] : [{ id: 8 }],
      free: [],
      rent: [{ id: 8 }],
      buy: [],
    }));
    const { useSearch } = await import("../use-search");
    const { result } = renderHook(() => useSearch("spider", "movie", { company: "420", provider: "8", region: "FR" }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.map((item) => item.id)).toEqual([1]);
    expect(getWatchAvailabilityMock).toHaveBeenCalledWith("movie", 1, "FR");
    expect(getWatchAvailabilityMock).not.toHaveBeenCalledWith("movie", 3, "FR");
  });

  it("keeps pagination available when a filtered page is empty", async () => {
    searchMock.mockResolvedValueOnce(page([{ ...summary(1, "Batman documentary"), genreIds: [99] }], 1, 2));
    searchMock.mockResolvedValueOnce(page([{ ...summary(2, "Batman"), genreIds: [28] }], 2, 2));
    const { useSearch } = await import("../use-search");
    const { result } = renderHook(() => useSearch("batman", "movie", { genreMovie: "28" }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual([2]));
    expect(result.current.hasNextPage).toBe(false);
  });

  it("reports an unavailable provider lookup instead of claiming there are no matching titles", async () => {
    searchMock.mockResolvedValueOnce(page([summary(1, "Batman")]));
    getWatchAvailabilityMock.mockRejectedValue(new Error("Provider lookup unavailable"));
    const { useSearch } = await import("../use-search");
    const { result } = renderHook(() => useSearch("batman", "movie", { provider: "8", region: "FR" }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Provider lookup unavailable");
  });

  it("does not query movie discovery for the people scope even when media filters remain in the URL", async () => {
    const { useSearch } = await import("../use-search");
    const { result } = renderHook(() => useSearch("", "person", { company: "420" }), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(discoverMoviesMock).not.toHaveBeenCalled();
  });

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

  it("interleaves movie and series results round-robin rather than blocking one type after the other", async () => {
    discoverMoviesMock.mockResolvedValueOnce(page([summary(10, "Movie A"), summary(11, "Movie B")]));
    discoverSeriesMock.mockResolvedValueOnce(
      page([summary(20, "Series A"), summary(21, "Series B"), summary(22, "Series C")])
    );
    const { useSearch } = await import("../use-search");
    const { result } = renderHook(() => useSearch("", "all", { provider: "8" }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.map((item) => item.title)).toEqual([
      "Movie A",
      "Series A",
      "Movie B",
      "Series B",
      "Series C",
    ]);
  });

  it("returns an empty page when a series filter has neither genre nor provider", async () => {
    const { useSearch } = await import("../use-search");
    // hasFilters is true (genreMovie set) but scope is "series" with no genreSeries/provider.
    const { result } = renderHook(() => useSearch("", "series", { genreMovie: "28" }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(discoverSeriesMock).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
  });

  it("returns an empty page when a movie filter has neither genre nor provider", async () => {
    const { useSearch } = await import("../use-search");
    // hasFilters is true (genreSeries set) but scope is "movie" with no genreMovie/provider.
    const { result } = renderHook(() => useSearch("", "movie", { genreSeries: "18" }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(discoverMoviesMock).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
  });

  it("routes to discoverSeries when a series genre filter is set", async () => {
    const { useSearch } = await import("../use-search");
    const { result } = renderHook(() => useSearch("", "series", { genreSeries: "18" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(discoverSeriesMock).toHaveBeenCalledWith(expect.objectContaining({ genre: 18, page: 1 }));
    expect(discoverMoviesMock).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([summary(3, "Discovered Series")]);
  });

  it("issues only the movie discover request in 'all' scope when only a movie genre filter is set", async () => {
    const { useSearch } = await import("../use-search");
    const { result } = renderHook(() => useSearch("", "all", { genreMovie: "28" }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(discoverMoviesMock).toHaveBeenCalledTimes(1);
    expect(discoverSeriesMock).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([summary(2, "Discovered Movie")]);
  });

  it("issues only the series discover request in 'all' scope when only a series genre filter is set", async () => {
    const { useSearch } = await import("../use-search");
    const { result } = renderHook(() => useSearch("", "all", { genreSeries: "18" }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(discoverSeriesMock).toHaveBeenCalledTimes(1);
    expect(discoverMoviesMock).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([summary(3, "Discovered Series")]);
  });

  it("routes to discoverMovies (only) when a company filter is set, even in 'all' scope", async () => {
    const { useSearch } = await import("../use-search");
    const { result } = renderHook(() => useSearch("", "all", { company: "420" }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(discoverMoviesMock).toHaveBeenCalledWith(expect.objectContaining({ company: 420 }));
    expect(discoverSeriesMock).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([summary(2, "Discovered Movie")]);
  });

  it("returns an empty page for a company filter in 'series' scope (company isn't wired into discoverSeries)", async () => {
    const { useSearch } = await import("../use-search");
    const { result } = renderHook(() => useSearch("", "series", { company: "420" }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(discoverSeriesMock).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
  });
  it("lists a title once when the next page repeats it (TMDB's pages overlap while popularity moves)", async () => {
    searchMock.mockResolvedValueOnce(page([summary(1, "A"), summary(2, "B")], 1, 2));
    searchMock.mockResolvedValueOnce(page([summary(2, "B"), summary(3, "C")], 2, 2));
    const { useSearch } = await import("../use-search");
    const { result } = renderHook(() => useSearch("batman", "movie"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual([1, 2, 3]));
  });

  it("keeps a movie and a series that share a TMDB id as two results", async () => {
    searchMock.mockResolvedValueOnce(page([summary(7, "Movie 7"), { ...summary(7, "Series 7"), mediaType: "series" }]));
    const { useSearch } = await import("../use-search");
    const { result } = renderHook(() => useSearch("seven", "all"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.items).toHaveLength(2));
  });

  it("shows the answer to the latest query even when an older, slower request settles after it", async () => {
    let releaseSlow: (value: PageResult<MediaSummary>) => void = () => {};
    searchMock.mockImplementationOnce(() => new Promise((resolve) => (releaseSlow = resolve)));
    searchMock.mockImplementationOnce(async () => page([summary(2, "fast result")]));
    const { useSearch } = await import("../use-search");
    const { result, rerender } = renderHook(({ query }) => useSearch(query, "movie"), {
      wrapper: createWrapper(),
      initialProps: { query: "ba" },
    });

    rerender({ query: "bat" });
    await waitFor(() => expect(result.current.items.map((item) => item.title)).toEqual(["fast result"]));
    await act(async () => releaseSlow(page([summary(1, "stale result")])));

    expect(result.current.items.map((item) => item.title)).toEqual(["fast result"]);
  });
});
