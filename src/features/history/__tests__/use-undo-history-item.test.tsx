import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import type { Movie, Series, ViewingHistoryItem } from "@/types/media";

const removeMock = vi.fn().mockResolvedValue(undefined);
const saveMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/features/library/library-repository", () => ({
  libraryRepository: {
    remove: (...args: unknown[]) => removeMock(...args),
    save: (...args: unknown[]) => saveMock(...args),
  },
}));

const getMovieDetailsMock = vi.fn();
const getSeriesDetailsMock = vi.fn();
vi.mock("@/features/media/media-repository", () => ({
  mediaRepository: {
    getMovieDetails: (...args: unknown[]) => getMovieDetailsMock(...args),
    getSeriesDetails: (...args: unknown[]) => getSeriesDetailsMock(...args),
  },
}));

const toggleMovieSeenMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/features/progress/progress-repository", () => ({
  progressRepository: {
    toggleMovieSeen: (...args: unknown[]) => toggleMovieSeenMock(...args),
  },
}));

function buildMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 42,
    mediaType: "movie",
    title: "Dune",
    overview: "",
    genres: [],
    cast: [],
    ...overrides,
  };
}

function buildSeries(overrides: Partial<Series> = {}): Series {
  return {
    id: 7,
    mediaType: "series",
    title: "Severance",
    overview: "",
    genres: [],
    cast: [],
    seasons: [],
    numberOfSeasons: 1,
    ...overrides,
  };
}

function makeHistoryItem(overrides: Partial<ViewingHistoryItem>): ViewingHistoryItem {
  return {
    id: "h1",
    mediaId: 42,
    mediaType: "movie",
    title: "Dune",
    action: "movie:watched",
    timestamp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("isHistoryItemUndoable", () => {
  it("is true only for movie watched/unwatched and watchlist add/remove", async () => {
    const { isHistoryItemUndoable } = await import("../use-undo-history-item");

    expect(isHistoryItemUndoable(makeHistoryItem({ action: "movie:watched" }))).toBe(true);
    expect(isHistoryItemUndoable(makeHistoryItem({ action: "movie:unwatched" }))).toBe(true);
    expect(isHistoryItemUndoable(makeHistoryItem({ action: "watchlist:add" }))).toBe(true);
    expect(isHistoryItemUndoable(makeHistoryItem({ action: "watchlist:remove" }))).toBe(true);
    expect(isHistoryItemUndoable(makeHistoryItem({ action: "episode:watched" }))).toBe(false);
    expect(isHistoryItemUndoable(makeHistoryItem({ action: "season:watched" }))).toBe(false);
    expect(isHistoryItemUndoable(makeHistoryItem({ action: "series:watched" }))).toBe(false);
    expect(isHistoryItemUndoable(makeHistoryItem({ action: "library:update" }))).toBe(false);
    expect(isHistoryItemUndoable(makeHistoryItem({ action: "list:add" }))).toBe(false);
    expect(isHistoryItemUndoable(makeHistoryItem({ action: "list:remove" }))).toBe(false);
  });
});

describe("useUndoHistoryItem", () => {
  beforeEach(() => {
    removeMock.mockClear();
    saveMock.mockClear();
    getMovieDetailsMock.mockReset().mockResolvedValue(buildMovie());
    getSeriesDetailsMock.mockReset().mockResolvedValue(buildSeries());
    toggleMovieSeenMock.mockClear();
  });

  it("undoing a movie:watched entry fetches the real movie and marks it unwatched", async () => {
    const { useUndoHistoryItem } = await import("../use-undo-history-item");
    const { result } = renderHook(() => useUndoHistoryItem(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync(makeHistoryItem({ mediaId: 42, action: "movie:watched" }));
    });

    expect(getMovieDetailsMock).toHaveBeenCalledWith(42);
    expect(toggleMovieSeenMock).toHaveBeenCalledWith(buildMovie(), false);
  });

  it("undoing a movie:unwatched entry marks the real movie watched again", async () => {
    const { useUndoHistoryItem } = await import("../use-undo-history-item");
    const { result } = renderHook(() => useUndoHistoryItem(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync(makeHistoryItem({ mediaId: 42, action: "movie:unwatched" }));
    });

    expect(toggleMovieSeenMock).toHaveBeenCalledWith(buildMovie(), true);
  });

  it("undoing a watchlist:add entry removes the title from the library, with no catalogue fetch", async () => {
    const { useUndoHistoryItem } = await import("../use-undo-history-item");
    const { result } = renderHook(() => useUndoHistoryItem(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync(makeHistoryItem({ mediaId: 42, mediaType: "movie", action: "watchlist:add" }));
    });

    expect(removeMock).toHaveBeenCalledWith(42, "movie");
    expect(getMovieDetailsMock).not.toHaveBeenCalled();
  });

  it("undoing a watchlist:remove entry re-fetches the real title before re-adding it, for a movie", async () => {
    const { useUndoHistoryItem } = await import("../use-undo-history-item");
    const { result } = renderHook(() => useUndoHistoryItem(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync(
        makeHistoryItem({ mediaId: 42, mediaType: "movie", action: "watchlist:remove" })
      );
    });

    expect(getMovieDetailsMock).toHaveBeenCalledWith(42);
    expect(saveMock).toHaveBeenCalledWith(buildMovie());
  });

  it("undoing a watchlist:remove entry re-fetches the real title before re-adding it, for a series", async () => {
    const { useUndoHistoryItem } = await import("../use-undo-history-item");
    const { result } = renderHook(() => useUndoHistoryItem(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync(
        makeHistoryItem({ mediaId: 7, mediaType: "series", action: "watchlist:remove" })
      );
    });

    expect(getSeriesDetailsMock).toHaveBeenCalledWith(7);
    expect(saveMock).toHaveBeenCalledWith(buildSeries());
  });

  it("rejects an action with no defined reversal instead of silently doing nothing", async () => {
    const { useUndoHistoryItem } = await import("../use-undo-history-item");
    const { result } = renderHook(() => useUndoHistoryItem(), { wrapper: createWrapper() });

    await expect(result.current.mutateAsync(makeHistoryItem({ action: "episode:watched" }))).rejects.toThrow(
      /cannot be undone/
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
