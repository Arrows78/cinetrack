import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import type { MediaSummary, PageResult } from "@/types/media";
import type { RetryableUnmatched } from "@/features/tvtime/tvtime-import-service";
import { TvTimeUnmatchedResolver } from "../tvtime-unmatched-resolver";

function page(results: MediaSummary[]): PageResult<MediaSummary> {
  return { page: 1, totalPages: 1, totalResults: results.length, results };
}

function summary(overrides: Partial<MediaSummary> = {}): MediaSummary {
  return {
    id: 1,
    mediaType: "movie",
    title: "Result Title",
    overview: "",
    posterPath: null,
    backdropPath: null,
    year: 2020,
    rating: null,
    genres: [],
    cast: [],
    ...overrides,
  };
}

const searchMock = vi.fn();
const getSeriesDetailsMock = vi.fn();
vi.mock("@/features/media/media-repository", () => ({
  mediaRepository: {
    search: (...args: unknown[]) => searchMock(...args),
    getSeriesDetails: (...args: unknown[]) => getSeriesDetailsMock(...args),
  },
}));

const resolveRetryableSeriesMock = vi.fn();
const resolveRetryableMovieMock = vi.fn();
const resolveRetryableWatchlistMock = vi.fn();
const invalidateTvTimeImportQueriesMock = vi.fn();
vi.mock("@/features/tvtime/tvtime-import-service", () => ({
  resolveRetryableSeries: (...args: unknown[]) => resolveRetryableSeriesMock(...args),
  resolveRetryableMovie: (...args: unknown[]) => resolveRetryableMovieMock(...args),
  resolveRetryableWatchlist: (...args: unknown[]) => resolveRetryableWatchlistMock(...args),
  invalidateTvTimeImportQueries: (...args: unknown[]) => invalidateTvTimeImportQueriesMock(...args),
}));

const seriesItem: RetryableUnmatched = {
  kind: "series",
  label: "Bodyguard (2018)",
  searchTitle: "Bodyguard",
  searchYear: 2018,
  episodes: [
    {
      seriesName: "Bodyguard (2018)",
      seasonNumber: 1,
      episodeNumber: 1,
      watchedAt: "2026-01-01",
      runtimeMinutes: null,
    },
  ],
};

const movieItem: RetryableUnmatched = {
  kind: "movie",
  label: "Unknown Movie",
  searchTitle: "Unknown Movie",
  searchYear: 1999,
  movie: { title: "Unknown Movie", year: 1999, watchedAt: "2026-01-01", runtimeMinutes: null },
  initialCandidates: [],
};

const watchlistItem: RetryableUnmatched = {
  kind: "watchlist",
  label: "Unknown Title",
  searchTitle: "Unknown Title",
  searchYear: null,
  entry: { title: "Unknown Title", mediaType: "series", year: null },
  initialCandidates: [],
};

function renderResolver(items: RetryableUnmatched[], onResolved = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<TvTimeUnmatchedResolver items={items} onResolved={onResolved} />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("TvTimeUnmatchedResolver", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    searchMock.mockReset().mockResolvedValue(page([]));
    getSeriesDetailsMock.mockReset();
    resolveRetryableSeriesMock.mockReset().mockResolvedValue({
      episodesImported: 1,
      undo: { series: { id: 7 }, episodes: [{ id: 100, seasonNumber: 1, episodeNumber: 1 }] },
    });
    resolveRetryableMovieMock.mockReset().mockResolvedValue(true);
    resolveRetryableWatchlistMock.mockReset().mockResolvedValue(true);
  });

  it("renders nothing when there are no retryable items", () => {
    const { container } = renderResolver([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("lets the user search and pick a match for an unmatched movie", async () => {
    searchMock.mockResolvedValue(page([summary({ id: 42, title: "The Real Movie", year: 1999 })]));
    const onResolved = vi.fn();
    renderResolver([movieItem], onResolved);

    screen.getByRole("button", { name: "Unknown Movie" }).click();
    const result = await screen.findByText("The Real Movie", {}, { timeout: 2000 });
    result.closest("div")!.querySelector("button")!.click();

    await waitFor(() =>
      expect(resolveRetryableMovieMock).toHaveBeenCalledWith(movieItem, expect.objectContaining({ id: 42 }))
    );
    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith(movieItem, {
        movies: [expect.objectContaining({ id: 42 })],
        series: [],
        planned: [],
      })
    );
  });

  it("shows initial candidates immediately, with no wait on a fresh search", async () => {
    // Deliberately never resolves — proves the row doesn't wait on this at all.
    searchMock.mockReturnValue(new Promise(() => {}));
    const itemWithCandidates: RetryableUnmatched = {
      ...movieItem,
      initialCandidates: [summary({ id: 55, title: "Already Found Movie", year: 1999 })],
    };
    const onResolved = vi.fn();
    renderResolver([itemWithCandidates], onResolved);

    screen.getByRole("button", { name: "Unknown Movie" }).click();

    expect(await screen.findByText("Already Found Movie")).toBeInTheDocument();

    screen.getByRole("button", { name: "Choose" }).click();
    await waitFor(() =>
      expect(resolveRetryableMovieMock).toHaveBeenCalledWith(itemWithCandidates, expect.objectContaining({ id: 55 }))
    );
  });

  it("falls back to a live search once the query is edited away from the original title", async () => {
    searchMock.mockResolvedValue(page([summary({ id: 42, title: "The Real Movie", year: 1999 })]));
    const itemWithCandidates: RetryableUnmatched = {
      ...movieItem,
      initialCandidates: [summary({ id: 55, title: "Already Found Movie", year: 1999 })],
    };
    renderResolver([itemWithCandidates]);

    screen.getByRole("button", { name: "Unknown Movie" }).click();
    expect(await screen.findByText("Already Found Movie")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search title"), { target: { value: "Something else" } });

    expect(await screen.findByText("The Real Movie", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByText("Already Found Movie")).not.toBeInTheDocument();
  });

  it("fetches full series details before resolving a series match", async () => {
    searchMock.mockResolvedValue(page([summary({ id: 7, mediaType: "series", title: "Bodyguard", year: 2018 })]));
    getSeriesDetailsMock.mockResolvedValue({ id: 7, numberOfSeasons: 1, seasons: [] });
    const onResolved = vi.fn();
    renderResolver([seriesItem], onResolved);

    screen.getByRole("button", { name: /Bodyguard \(2018\)/ }).click();
    const result = await screen.findByText("Bodyguard", {}, { timeout: 2000 });
    result.closest("div")!.querySelector("button")!.click();

    await waitFor(() => expect(getSeriesDetailsMock).toHaveBeenCalledWith(7));
    await waitFor(() =>
      expect(resolveRetryableSeriesMock).toHaveBeenCalledWith(seriesItem, expect.objectContaining({ id: 7 }))
    );
    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith(seriesItem, {
        movies: [],
        series: [{ series: { id: 7 }, episodes: [{ id: 100, seasonNumber: 1, episodeNumber: 1 }] }],
        planned: [],
      })
    );
  });

  it("does not report anything undoable when the series resolution found nothing new to insert", async () => {
    searchMock.mockResolvedValue(page([summary({ id: 7, mediaType: "series", title: "Bodyguard", year: 2018 })]));
    getSeriesDetailsMock.mockResolvedValue({ id: 7, numberOfSeasons: 1, seasons: [] });
    resolveRetryableSeriesMock.mockResolvedValue({ episodesImported: 0, undo: null });
    const onResolved = vi.fn();
    renderResolver([seriesItem], onResolved);

    screen.getByRole("button", { name: /Bodyguard \(2018\)/ }).click();
    const result = await screen.findByText("Bodyguard", {}, { timeout: 2000 });
    result.closest("div")!.querySelector("button")!.click();

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(seriesItem, { movies: [], series: [], planned: [] }));
  });

  it("resolves an unmatched watchlist entry", async () => {
    searchMock.mockResolvedValue(page([summary({ id: 9, mediaType: "series", title: "The Real Show" })]));
    const onResolved = vi.fn();
    renderResolver([watchlistItem], onResolved);

    screen.getByRole("button", { name: "Unknown Title" }).click();
    const result = await screen.findByText("The Real Show", {}, { timeout: 2000 });
    result.closest("div")!.querySelector("button")!.click();

    await waitFor(() =>
      expect(resolveRetryableWatchlistMock).toHaveBeenCalledWith(watchlistItem, expect.objectContaining({ id: 9 }))
    );
    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith(watchlistItem, {
        movies: [],
        series: [],
        planned: [{ mediaId: 9, mediaType: "series" }],
      })
    );
  });

  it("does not report anything undoable when the watchlist match was already in the library", async () => {
    searchMock.mockResolvedValue(page([summary({ id: 9, mediaType: "series", title: "The Real Show" })]));
    resolveRetryableWatchlistMock.mockResolvedValue(false);
    const onResolved = vi.fn();
    renderResolver([watchlistItem], onResolved);

    screen.getByRole("button", { name: "Unknown Title" }).click();
    const result = await screen.findByText("The Real Show", {}, { timeout: 2000 });
    result.closest("div")!.querySelector("button")!.click();

    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith(watchlistItem, { movies: [], series: [], planned: [] })
    );
  });

  it("shows an error and keeps the item when resolving fails", async () => {
    searchMock.mockResolvedValue(page([summary({ id: 42, title: "The Real Movie" })]));
    resolveRetryableMovieMock.mockRejectedValue(new Error("network down"));
    const onResolved = vi.fn();
    renderResolver([movieItem], onResolved);

    screen.getByRole("button", { name: "Unknown Movie" }).click();
    const result = await screen.findByText("The Real Movie", {}, { timeout: 2000 });
    result.closest("div")!.querySelector("button")!.click();

    expect(await screen.findByText("Couldn't add this title. Try again.")).toBeInTheDocument();
    expect(onResolved).not.toHaveBeenCalled();
  });
});
