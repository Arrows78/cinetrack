import { useEffect, useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

// Same fake router as search-page.test.tsx: `mockNavigate` mutates a shared
// "current URL search string" and `useSearch` polls it, so HistoryPage's own
// URL-sync behavior (SavedFiltersBar apply, chip removal, FilterBar clicks)
// is exercised faithfully instead of against a stubbed-out no-op.
const { getRouterSearch, setRouterSearch, mockNavigate } = vi.hoisted(() => {
  let search = "";
  const getRouterSearch = () => search;
  const setRouterSearch = (next: string) => {
    search = next;
  };
  const mockNavigate = vi.fn(
    (opts: { search: (prev: Record<string, string | undefined>) => Record<string, string | undefined> }) => {
      const prevParams = new URLSearchParams(search);
      const prevObj: Record<string, string | undefined> = {};
      prevParams.forEach((value, key) => {
        prevObj[key] = value;
      });
      const nextObj = opts.search(prevObj);
      const nextParams = new URLSearchParams();
      Object.entries(nextObj).forEach(([key, value]) => {
        if (value !== undefined && value !== "") nextParams.set(key, value);
      });
      const nextSearch = nextParams.toString();
      setRouterSearch(nextSearch ? `?${nextSearch}` : "");
    }
  );
  return { getRouterSearch, setRouterSearch, mockNavigate };
});

// Tracked-series tiles render a full-card <Link>. No RouterProvider exists in
// this render, same as design-system-page.test.tsx's own mock.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, ...rest }: PropsWithChildren<{ to: string; params?: Record<string, string> }>) => (
    <a href={params ? to.replace(/\$(\w+)/g, (_, key: string) => params[key] ?? "") : to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
  useSearch: () => {
    const [, forceRender] = useState(0);
    useEffect(() => {
      let search = getRouterSearch();
      const interval = window.setInterval(() => {
        const current = getRouterSearch();
        if (current !== search) {
          search = current;
          forceRender((tick) => tick + 1);
        }
      }, 10);
      return () => window.clearInterval(interval);
    }, []);
    const params = new URLSearchParams(getRouterSearch());
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  },
}));

// Rendered for real (its own save/apply/delete behavior is covered by
// saved-filters-bar.test.tsx) but stubbed to a fixed, empty list here so this
// suite's own filter/URL assertions don't also need a real invoke() round-trip.
const savedFiltersState = {
  data: [] as Array<{ id: string; name: string }>,
  isLoading: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  isSaving: false,
};
vi.mock("@/features/saved-filters/use-saved-filters", () => ({
  useSavedFilters: () => savedFiltersState,
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

function renderPage(initialSearch = "") {
  setRouterSearch(initialSearch);
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
    setRouterSearch("");
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

    it("shows the new status rather than a generic label for a library:update status change", () => {
      mockUseHistory.mockReturnValue(
        historyQueryResult({
          data: {
            pages: [
              [
                makeHistoryItem({
                  action: "library:update",
                  title: "Dune",
                  metadata: { changedFields: ["status"], status: "watching" },
                }),
              ],
            ],
          },
        })
      );
      renderPage();

      expect(screen.getByText("Status changed to Watching")).toBeInTheDocument();
      expect(screen.queryByText("Library updated")).not.toBeInTheDocument();
    });

    it("lists every changed field for a library:update entry touching more than one", () => {
      mockUseHistory.mockReturnValue(
        historyQueryResult({
          data: {
            pages: [
              [
                makeHistoryItem({
                  action: "library:update",
                  title: "Dune",
                  metadata: { changedFields: ["notes", "tags"] },
                }),
              ],
            ],
          },
        })
      );
      renderPage();

      expect(screen.getByText("Updated: notes, tags")).toBeInTheDocument();
    });

    it("falls back to the generic label for a legacy library:update entry with no metadata", () => {
      mockUseHistory.mockReturnValue(
        historyQueryResult({
          data: { pages: [[makeHistoryItem({ action: "library:update", title: "Dune" })]] },
        })
      );
      renderPage();

      expect(screen.getByText("Library updated")).toBeInTheDocument();
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

    it("pushes the type filter into the URL instead of only local state", async () => {
      mockedMixedHistory();
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Movies" }));

      await waitFor(() => expect(getRouterSearch()).toContain("type=movie"));
    });

    it("restores the type filter from the URL on a deep link, with a removable chip", async () => {
      mockedMixedHistory();
      renderPage("?type=series");

      await waitFor(() => expect(screen.queryByText("A Movie")).not.toBeInTheDocument());
      expect(screen.getByText("A Series")).toBeInTheDocument();

      // Only asserts on the URL, not the list re-settling — Virtuoso's own
      // re-render (see the "chaining successive filter clicks" comment above)
      // isn't reliable across a second interaction within the same render.
      const chipLabel = i18n.t("filters.chips.type", { value: "Series" });
      const chip = screen.getByRole("button", { name: i18n.t("filters.removeFilter", { filter: chipLabel }) });
      fireEvent.click(chip);

      await waitFor(() => expect(getRouterSearch()).not.toContain("type"));
    });

    it("debounces the search input, pushes it into the URL, and calls useHistory with it", async () => {
      renderPage();

      fireEvent.change(screen.getByPlaceholderText("Search your activity"), { target: { value: "Dune" } });

      await waitFor(() => expect(getRouterSearch()).toContain("q=Dune"));
      const lastCall = mockUseHistory.mock.calls[mockUseHistory.mock.calls.length - 1] as [{ search?: string }];
      expect(lastCall[0].search).toBe("Dune");
    });

    it("restores the search query from the URL on a deep link", () => {
      renderPage("?q=Dune");

      expect(screen.getByPlaceholderText("Search your activity")).toHaveValue("Dune");
      const lastCall = mockUseHistory.mock.calls[mockUseHistory.mock.calls.length - 1] as [{ search?: string }];
      expect(lastCall[0].search).toBe("Dune");
    });

    it("pushes a chosen date range into the URL as inclusive ISO bounds, with a removable chip", async () => {
      renderPage();

      fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-01-01" } });
      fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-01-31" } });

      await waitFor(() => expect(getRouterSearch()).toContain("from=2026-01-01"));
      expect(getRouterSearch()).toContain("to=2026-01-31");
      await waitFor(() => {
        const lastCall = mockUseHistory.mock.calls[mockUseHistory.mock.calls.length - 1] as [
          { from?: string; to?: string },
        ];
        expect(lastCall[0].from).toBe("2026-01-01T00:00:00.000Z");
        expect(lastCall[0].to).toBe("2026-01-31T23:59:59.999Z");
      });

      const chipLabel = i18n.t("filters.chips.dateRange", { from: "2026-01-01", to: "2026-01-31" });
      fireEvent.click(screen.getByRole("button", { name: i18n.t("filters.removeFilter", { filter: chipLabel }) }));

      await waitFor(() => expect(getRouterSearch()).not.toContain("from"));
      expect(getRouterSearch()).not.toContain("to");
    });

    it("links a movie row to the movie detail page", () => {
      mockUseHistory.mockReturnValue(
        historyQueryResult({
          data: { pages: [[makeHistoryItem({ id: "1", title: "Dune", mediaType: "movie", mediaId: 438631 })]] },
        })
      );
      renderPage();

      expect(screen.getByRole("link", { name: "Dune" })).toHaveAttribute("href", "/movies/438631");
    });

    it("links a series row with no season/episode to the series detail page", () => {
      mockUseHistory.mockReturnValue(
        historyQueryResult({
          data: {
            pages: [
              [
                makeHistoryItem({
                  id: "1",
                  title: "Severance",
                  mediaType: "series",
                  mediaId: 95396,
                  action: "series:watched",
                }),
              ],
            ],
          },
        })
      );
      renderPage();

      expect(screen.getByRole("link", { name: "Severance" })).toHaveAttribute("href", "/series/95396");
    });

    it("links a season-level row to the season page", () => {
      mockUseHistory.mockReturnValue(
        historyQueryResult({
          data: {
            pages: [
              [
                makeHistoryItem({
                  id: "1",
                  title: "Severance",
                  mediaType: "series",
                  mediaId: 95396,
                  action: "season:watched",
                  seasonNumber: 2,
                }),
              ],
            ],
          },
        })
      );
      renderPage();

      expect(screen.getByRole("link", { name: "Severance" })).toHaveAttribute("href", "/series/95396/season/2");
    });

    it("links an episode row to the episode detail page", () => {
      mockUseHistory.mockReturnValue(
        historyQueryResult({
          data: {
            pages: [
              [
                makeHistoryItem({
                  id: "1",
                  title: "Breaking Bad",
                  mediaType: "series",
                  mediaId: 1396,
                  action: "episode:watched",
                  seasonNumber: 2,
                  episodeNumber: 5,
                  episodeTitle: "Breakage",
                }),
              ],
            ],
          },
        })
      );
      renderPage();

      expect(screen.getByRole("link", { name: "Breaking Bad" })).toHaveAttribute(
        "href",
        "/series/1396/season/2/episode/5"
      );
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

    it("shows each tracked series' own last-activity date, distinct from the episode count", () => {
      mockUseTrackedSeries.mockReturnValue(
        trackedSeriesQueryResult({
          data: [makeTrackedSeries({ seriesId: 77, title: "The Wire", updatedAt: new Date().toISOString() })],
        })
      );
      renderPage();

      expect(screen.getByText(/^Last activity: /)).toBeInTheDocument();
    });

    it("defaults to sorting by most recent activity", () => {
      mockUseTrackedSeries.mockReturnValue(
        trackedSeriesQueryResult({
          data: [
            makeTrackedSeries({ seriesId: 1, title: "Older", updatedAt: "2026-01-01T00:00:00.000Z" }),
            makeTrackedSeries({ seriesId: 2, title: "Newer", updatedAt: "2026-02-01T00:00:00.000Z" }),
          ],
        })
      );
      renderPage();

      const titles = screen.getAllByText(/^Older$|^Newer$/).map((el) => el.textContent);
      expect(titles).toEqual(["Newer", "Older"]);
    });

    it("sorts tracked series by title", () => {
      mockUseTrackedSeries.mockReturnValue(
        trackedSeriesQueryResult({
          data: [makeTrackedSeries({ seriesId: 1, title: "Zeta" }), makeTrackedSeries({ seriesId: 2, title: "Alpha" })],
        })
      );
      renderPage();

      fireEvent.click(
        within(screen.getByRole("group", { name: "Sort series by" })).getByRole("button", { name: "Title" })
      );

      const titles = screen.getAllByText(/^Zeta$|^Alpha$/).map((el) => el.textContent);
      expect(titles).toEqual(["Alpha", "Zeta"]);
    });

    it("sorts tracked series by progress, highest first", () => {
      mockUseTrackedSeries.mockReturnValue(
        trackedSeriesQueryResult({
          data: [
            makeTrackedSeries({ seriesId: 1, title: "LowProgress", totalEpisodes: 10, watchedEpisodes: 1 }),
            makeTrackedSeries({ seriesId: 2, title: "HighProgress", totalEpisodes: 10, watchedEpisodes: 9 }),
          ],
        })
      );
      renderPage();

      fireEvent.click(
        within(screen.getByRole("group", { name: "Sort series by" })).getByRole("button", { name: "Progress" })
      );

      const titles = screen.getAllByText(/^LowProgress$|^HighProgress$/).map((el) => el.textContent);
      expect(titles).toEqual(["HighProgress", "LowProgress"]);
    });

    it("filters tracked series by status", () => {
      mockUseTrackedSeries.mockReturnValue(
        trackedSeriesQueryResult({
          data: [
            makeTrackedSeries({ seriesId: 1, title: "Airing", status: "Returning Series" }),
            makeTrackedSeries({ seriesId: 2, title: "Finished", status: "Ended" }),
          ],
        })
      );
      renderPage();

      fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "Ended" } });
      expect(screen.queryByText("Airing")).not.toBeInTheDocument();
      expect(screen.getByText("Finished")).toBeInTheDocument();
    });

    it("shows a distinct empty state, with a way back to 'all', when the selected status no longer matches anything", () => {
      mockUseTrackedSeries.mockReturnValue(
        trackedSeriesQueryResult({
          data: [
            makeTrackedSeries({ seriesId: 1, title: "Airing", status: "Returning Series" }),
            makeTrackedSeries({ seriesId: 2, title: "Finished", status: "Ended" }),
          ],
        })
      );
      const { rerender } = renderPage();

      fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "Ended" } });
      expect(screen.getByText("Finished")).toBeInTheDocument();

      // The "Ended" series is no longer tracked at all — the filter, still
      // set to "Ended" from before, now matches nothing.
      mockUseTrackedSeries.mockReturnValue(
        trackedSeriesQueryResult({
          data: [makeTrackedSeries({ seriesId: 1, title: "Airing", status: "Returning Series" })],
        })
      );
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      rerender(
        <QueryClientProvider client={client}>
          <HistoryPage />
        </QueryClientProvider>
      );

      expect(screen.getByText("No series match this filter")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
      expect(screen.getByText("Airing")).toBeInTheDocument();
    });

    it("hides the status filter when every tracked series shares the same status", () => {
      mockUseTrackedSeries.mockReturnValue(
        trackedSeriesQueryResult({
          data: [
            makeTrackedSeries({ seriesId: 1, title: "A", status: "Ended" }),
            makeTrackedSeries({ seriesId: 2, title: "B", status: "Ended" }),
          ],
        })
      );
      renderPage();

      expect(screen.queryByLabelText("Filter by status")).not.toBeInTheDocument();
    });
  });

  describe("day grouping", () => {
    it("groups today's entries under a 'Today' header", () => {
      mockUseHistory.mockReturnValue(
        historyQueryResult({ data: { pages: [[makeHistoryItem({ id: "1", timestamp: new Date().toISOString() })]] } })
      );
      renderPage();

      expect(screen.getByText("Today")).toBeInTheDocument();
    });

    it("labels an older entry with its full date instead of 'Today'/'Yesterday'", () => {
      mockUseHistory.mockReturnValue(
        historyQueryResult({
          data: { pages: [[makeHistoryItem({ id: "1", timestamp: "2020-03-12T10:00:00.000Z" })]] },
        })
      );
      renderPage();

      expect(screen.getByText("12 March 2020")).toBeInTheDocument();
      expect(screen.queryByText("Today")).not.toBeInTheDocument();
      expect(screen.queryByText("Yesterday")).not.toBeInTheDocument();
    });

    it("shows one header per distinct day, in the feed's own newest-first order", () => {
      mockUseHistory.mockReturnValue(
        historyQueryResult({
          data: {
            pages: [
              [
                makeHistoryItem({ id: "1", title: "Newest", timestamp: "2026-01-03T00:00:00.000Z" }),
                makeHistoryItem({ id: "2", title: "MiddleA", timestamp: "2026-01-02T12:00:00.000Z" }),
                makeHistoryItem({ id: "3", title: "MiddleB", timestamp: "2026-01-02T08:00:00.000Z" }),
                makeHistoryItem({ id: "4", title: "Oldest", timestamp: "2026-01-01T00:00:00.000Z" }),
              ],
            ],
          },
        })
      );
      renderPage();

      expect(screen.getByText("3 January 2026")).toBeInTheDocument();
      expect(screen.getByText("2 January 2026")).toBeInTheDocument();
      expect(screen.getByText("1 January 2026")).toBeInTheDocument();
      // Only one header for the two same-day ("MiddleA"/"MiddleB") entries.
      expect(screen.getAllByText("2 January 2026")).toHaveLength(1);
    });
  });
});
