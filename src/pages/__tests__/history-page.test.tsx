import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

import i18n from "@/i18n";
import { HistoryPage } from "../history-page";
import { useHistory } from "@/features/history/use-history";
import { useTrackedSeries } from "@/features/progress/use-progress";
import type { TrackedSeriesItem, ViewingHistoryItem } from "@/types/media";

vi.mock("@/features/history/use-history", () => ({
  useHistory: vi.fn(),
}));

vi.mock("@/features/progress/use-progress", () => ({
  useTrackedSeries: vi.fn(),
}));

// Tracked-series tiles render a full-card <Link>. No RouterProvider exists in
// this render, same as design-system-page.test.tsx's own mock.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, ...rest }: PropsWithChildren<{ to: string; params?: Record<string, string> }>) => (
    <a href={params ? to.replace(/\$(\w+)/g, (_, key: string) => params[key] ?? "") : to} {...rest}>
      {children}
    </a>
  ),
}));

const mockUseHistory = useHistory as unknown as ReturnType<typeof vi.fn>;
const mockUseTrackedSeries = useTrackedSeries as unknown as ReturnType<typeof vi.fn>;

function historyQueryResult(overrides: Partial<ReturnType<typeof baseHistoryQuery>> = {}) {
  return { ...baseHistoryQuery(), ...overrides };
}

function baseHistoryQuery() {
  return {
    data: { pages: [] as ViewingHistoryItem[][] },
    isLoading: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  };
}

function trackedSeriesQueryResult(overrides: Partial<ReturnType<typeof baseTrackedSeriesQuery>> = {}) {
  return { ...baseTrackedSeriesQuery(), ...overrides };
}

function baseTrackedSeriesQuery() {
  return {
    data: [] as TrackedSeriesItem[],
    isLoading: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
  };
}

function makeHistoryItem(overrides: Partial<ViewingHistoryItem>): ViewingHistoryItem {
  return {
    id: "hist-1",
    mediaId: 1,
    mediaType: "movie",
    title: "Some Movie",
    action: "movie:watched",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeTrackedSeries(overrides: Partial<TrackedSeriesItem>): TrackedSeriesItem {
  return {
    id: "tracked-1",
    profileId: null,
    seriesId: 42,
    title: "Some Series",
    posterPath: null,
    backdropPath: null,
    totalEpisodes: 10,
    watchedEpisodes: 4,
    status: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HistoryPage />
    </QueryClientProvider>
  );
}

describe("HistoryPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseHistory.mockReturnValue(historyQueryResult());
    mockUseTrackedSeries.mockReturnValue(trackedSeriesQueryResult());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("activity timeline", () => {
    it("shows the loading state while history is loading", () => {
      mockUseHistory.mockReturnValue(historyQueryResult({ isLoading: true }));
      renderPage();
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("shows a remote error state and retries via historyQuery.refetch", () => {
      const refetch = vi.fn();
      mockUseHistory.mockReturnValue(historyQueryResult({ isError: true, error: new Error("boom"), refetch }));
      renderPage();

      expect(screen.getByText("Unable to load the catalogue")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it("shows the empty state when there is no activity", () => {
      renderPage();
      expect(screen.getByText("No activity yet")).toBeInTheDocument();
    });

    it("renders a mix of actions with their translated labels and episode subtitle", () => {
      mockUseHistory.mockReturnValue(
        historyQueryResult({
          data: {
            pages: [
              [
                makeHistoryItem({ id: "1", action: "movie:watched", title: "The Matrix", mediaType: "movie" }),
                makeHistoryItem({
                  id: "2",
                  action: "episode:watched",
                  title: "Breaking Bad",
                  mediaType: "series",
                  seasonNumber: 2,
                  episodeNumber: 5,
                  episodeTitle: "Breakage",
                }),
                makeHistoryItem({
                  id: "3",
                  action: "watchlist:add",
                  title: "Dune",
                  mediaType: "movie",
                }),
              ],
            ],
          },
        })
      );
      renderPage();

      expect(screen.getByText("Movie watched")).toBeInTheDocument();
      expect(screen.getByText("Episode watched")).toBeInTheDocument();
      expect(screen.getByText("Added to library")).toBeInTheDocument();

      // Episode-specific subtitle only appears for the episode entry.
      expect(screen.getByText("S2E5 • Breakage")).toBeInTheDocument();
      expect(screen.getAllByText(/•/)).toHaveLength(1);
    });

    function mockedMixedHistory() {
      mockUseHistory.mockReturnValue(
        historyQueryResult({
          data: {
            pages: [
              [makeHistoryItem({ id: "1", title: "A Movie", mediaType: "movie" })],
              [makeHistoryItem({ id: "2", title: "A Series", mediaType: "series" })],
            ],
          },
        })
      );
    }

    it("shows every item by default, regardless of media type", () => {
      mockedMixedHistory();
      renderPage();

      expect(screen.getByText("A Movie")).toBeInTheDocument();
      expect(screen.getByText("A Series")).toBeInTheDocument();
    });

    // Each filter is exercised as the first (and only) interaction against a
    // fresh render — Virtuoso reconciles its virtualized rows in an effect
    // gated by ResizeObserver/IntersectionObserver callbacks jsdom never
    // fires past the initial mount, so chaining several successive filter
    // clicks within one render doesn't reliably re-settle in this test
    // environment the way it does in a real browser.
    it("filters to movies only", async () => {
      mockedMixedHistory();
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Movies" }));

      await waitFor(() => expect(screen.queryByText("A Series")).not.toBeInTheDocument());
      expect(screen.getByText("A Movie")).toBeInTheDocument();
    });

    it("filters to series only", async () => {
      mockedMixedHistory();
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Series" }));

      await waitFor(() => expect(screen.queryByText("A Movie")).not.toBeInTheDocument());
      expect(screen.getByText("A Series")).toBeInTheDocument();
    });

    it("wires the load-more button to hasNextPage/isFetchingNextPage and fetchNextPage", () => {
      const fetchNextPage = vi.fn();
      mockUseHistory.mockReturnValue(
        historyQueryResult({
          data: { pages: [[makeHistoryItem({ id: "1" })]] },
          hasNextPage: true,
          isFetchingNextPage: false,
          fetchNextPage,
        })
      );
      renderPage();

      const button = screen.getByRole("button", { name: "Load more" });
      expect(button).toBeInTheDocument();
      fireEvent.click(button);
      expect(fetchNextPage).toHaveBeenCalledTimes(1);
    });

    it("does not render a load-more button when there is no next page", () => {
      mockUseHistory.mockReturnValue(
        historyQueryResult({ data: { pages: [[makeHistoryItem({ id: "1" })]] }, hasNextPage: false })
      );
      renderPage();
      expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
    });
  });

  describe("tracked series", () => {
    it("shows its own loading state independent of the timeline", () => {
      mockUseTrackedSeries.mockReturnValue(trackedSeriesQueryResult({ isLoading: true }));
      renderPage();

      // Both the timeline's empty state and the tracked-series loading state
      // can be present at once — just assert the loading indicator shows.
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("shows its own remote error state and retries via trackedSeriesQuery.refetch", () => {
      const refetch = vi.fn();
      mockUseTrackedSeries.mockReturnValue(
        trackedSeriesQueryResult({ isError: true, error: new Error("boom"), refetch })
      );
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it("shows the empty state when no series are tracked", () => {
      renderPage();
      expect(screen.getByText("No tracked series")).toBeInTheDocument();
    });

    it("renders each tracked series with title, episode count, progress percent, and a working link", () => {
      mockUseTrackedSeries.mockReturnValue(
        trackedSeriesQueryResult({
          data: [makeTrackedSeries({ seriesId: 77, title: "The Wire", totalEpisodes: 8, watchedEpisodes: 2 })],
        })
      );
      renderPage();

      expect(screen.getByText("The Wire")).toBeInTheDocument();
      expect(screen.getByText("2/8 episodes watched")).toBeInTheDocument();
      expect(screen.getByText("25")).toBeInTheDocument();

      const link = screen.getByRole("link", { name: "The Wire" });
      expect(link).toHaveAttribute("href", "/series/77");
    });
  });
});
