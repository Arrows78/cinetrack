import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
};

const watchlistItem: RetryableUnmatched = {
  kind: "watchlist",
  label: "Unknown Title",
  searchTitle: "Unknown Title",
  searchYear: null,
  entry: { title: "Unknown Title", mediaType: "series", year: null },
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
    resolveRetryableSeriesMock.mockReset().mockResolvedValue({ episodesImported: 1 });
    resolveRetryableMovieMock.mockReset().mockResolvedValue(true);
    resolveRetryableWatchlistMock.mockReset().mockResolvedValue(undefined);
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
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(movieItem));
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
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(seriesItem));
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
