import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFavouriteGenreRail } from "../use-favourite-genre-rail";
import type { LibraryMediaKey, MediaSummary } from "@/types/media";

const statsDataMock = vi.fn<() => { favouriteGenres: { name: string; count: number }[] } | undefined>();
const mediaKeysMock = vi.fn<() => LibraryMediaKey[] | undefined>();
const mergedGenresMock = vi.fn();
const searchQueryMock = vi.fn<() => { items: MediaSummary[]; isLoading: boolean }>();

vi.mock("@/features/stats/use-stats", () => ({
  useStats: () => ({ data: statsDataMock() }),
}));
vi.mock("@/features/library/use-library", () => ({
  useLibraryMediaKeys: () => ({ data: mediaKeysMock() }),
}));
vi.mock("@/features/media/use-merged-genres", () => ({
  useMergedGenres: () => mergedGenresMock(),
}));
vi.mock("@/features/media/use-search", () => ({
  useSearch: () => searchQueryMock(),
}));

const genre = {
  id: 18,
  label: "Drama",
  labelKey: "genres.drama",
  icon: "🎭",
  movieId: 18,
  seriesId: 18,
};

const media = (overrides: Partial<MediaSummary> = {}): MediaSummary => ({
  id: 1,
  mediaType: "movie",
  title: "Dune",
  overview: "",
  posterPath: null,
  backdropPath: null,
  year: 2021,
  rating: 8,
  genres: [],
  cast: [],
  ...overrides,
});

describe("useFavouriteGenreRail", () => {
  it("has no genre, empty items, and is not loading when there are no favourite genres yet", () => {
    statsDataMock.mockReturnValue({ favouriteGenres: [] });
    mediaKeysMock.mockReturnValue([]);
    mergedGenresMock.mockReturnValue([genre]);
    searchQueryMock.mockReturnValue({ items: [], isLoading: true });

    const { result } = renderHook(() => useFavouriteGenreRail());

    expect(result.current.genre).toBeNull();
    expect(result.current.items).toEqual([]);
    // isLoading is gated behind Boolean(genre) — a slow search for a
    // not-yet-resolved genre must not show a loading rail with nothing to load.
    expect(result.current.isLoading).toBe(false);
  });

  it("resolves a top genre but keeps items empty while the search has no results yet", () => {
    statsDataMock.mockReturnValue({ favouriteGenres: [{ name: "Drama", count: 5 }] });
    mediaKeysMock.mockReturnValue([]);
    mergedGenresMock.mockReturnValue([genre]);
    searchQueryMock.mockReturnValue({ items: [], isLoading: false });

    const { result } = renderHook(() => useFavouriteGenreRail());

    expect(result.current.genre?.label).toBe("Drama");
    expect(result.current.items).toEqual([]);
  });

  it("filters out items already in the library once a genre and search results exist", () => {
    statsDataMock.mockReturnValue({ favouriteGenres: [{ name: "Drama", count: 5 }] });
    mediaKeysMock.mockReturnValue([{ mediaId: 1, mediaType: "movie" }]);
    mergedGenresMock.mockReturnValue([genre]);
    searchQueryMock.mockReturnValue({
      items: [media({ id: 1, mediaType: "movie" }), media({ id: 2, mediaType: "movie", title: "Arrival" })],
      isLoading: false,
    });

    const { result } = renderHook(() => useFavouriteGenreRail());

    expect(result.current.items.map((item) => item.id)).toEqual([2]);
  });

  it("is loading only once a genre is resolved AND the search is loading", () => {
    statsDataMock.mockReturnValue({ favouriteGenres: [{ name: "Drama", count: 5 }] });
    mediaKeysMock.mockReturnValue([]);
    mergedGenresMock.mockReturnValue([genre]);
    searchQueryMock.mockReturnValue({ items: [], isLoading: true });

    const { result } = renderHook(() => useFavouriteGenreRail());

    expect(result.current.genre).not.toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it("falls back to safe defaults while stats and library-keys data are still undefined (initial load)", () => {
    statsDataMock.mockReturnValue(undefined);
    mediaKeysMock.mockReturnValue(undefined);
    mergedGenresMock.mockReturnValue([genre]);
    searchQueryMock.mockReturnValue({ items: [], isLoading: false });

    const { result } = renderHook(() => useFavouriteGenreRail());

    // statsQuery.data?.favouriteGenres ?? [] and mediaKeysQuery.data ?? []
    // both take their fallback branch here, before either query has resolved.
    expect(result.current.genre).toBeNull();
    expect(result.current.items).toEqual([]);
  });
});
