import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import type { LibraryStats } from "@/types/media";
import type { WatchForecast, YearlyActivityBucket } from "@/features/stats/stats-repository";
import { StatsPage } from "../stats-page";

// ActivityBarChart/ViewingHeatmap are chart-rendering components (not this
// page's own logic) that may not play well with jsdom — shallow-stub them,
// same pattern as library-page.test.tsx stubbing media-grid/media-list.
vi.mock("@/components/media/activity/activity-bar-chart", () => ({
  ActivityBarChart: ({ data }: { data: Array<{ label: string; value: number }> }) => (
    <div data-testid="activity-bar-chart">{data.map((d) => `${d.label}:${d.value}`).join(",")}</div>
  ),
}));
vi.mock("@/components/media/activity/viewing-heatmap", () => ({
  ViewingHeatmap: () => <div data-testid="viewing-heatmap" />,
}));

const statsState = {
  data: undefined as LibraryStats | undefined,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
};
const wrappedMock = vi.fn();
const forecastState = {
  data: undefined as WatchForecast | undefined,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
};
const yearlyActivityState = {
  data: undefined as YearlyActivityBucket[] | undefined,
};
// The four insights sections below (monthly recap, rewatch analytics,
// rating distribution, milestones) each render null while their own query
// has no data, so a bare "no data yet" stub keeps this page-level test suite
// focused on the page's own logic — see each section's own component test
// (src/components/stats/__tests__/) for its actual rendering behaviour.
const noDataYet = { data: undefined, isError: false, error: null as unknown };

vi.mock("@/features/stats/use-stats", () => ({
  useStats: () => statsState,
  useWrapped: (year: number) => wrappedMock(year),
  useWatchForecast: () => forecastState,
  useYearlyActivity: () => yearlyActivityState,
  useMonthlyRecap: () => noDataYet,
  useRewatchStats: () => noDataYet,
  useRatingDistribution: () => noDataYet,
  useWatchMilestones: () => noDataYet,
}));

const renderWrappedCardMock = vi.fn();
const downloadWrappedCardMock = vi.fn();
vi.mock("@/features/stats/wrapped-export", () => ({
  renderWrappedCard: (...args: unknown[]) => renderWrappedCardMock(...args),
  downloadWrappedCard: (...args: unknown[]) => downloadWrappedCardMock(...args),
  ShareCancelledError: class ShareCancelledError extends Error {},
}));

const toastMock = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

const loggerWarnMock = vi.fn();
vi.mock("@/shared/lib/logger", () => ({
  logger: { warn: (...args: unknown[]) => loggerWarnMock(...args), error: vi.fn(), info: vi.fn() },
}));

const CURRENT_YEAR = new Date().getFullYear();

function makeStats(overrides: Partial<LibraryStats> = {}): LibraryStats {
  return {
    moviesWatched: 42,
    episodesWatched: 310,
    minutesWatched: 12000,
    movieMinutesWatched: 6000,
    episodeMinutesWatched: 6000,
    completedSeries: 5,
    averageUserRating: 7.5,
    favouriteGenres: [{ name: "Drama", count: 10 }],
    favouriteGenreByRating: "Sci-Fi",
    mostRewatchedTitle: { title: "The Office", count: 4 },
    monthlyActivity: [],
    currentStreakDays: 3,
    longestStreakDays: 12,
    biggestBingeDay: { day: "2026-01-05", count: 6 },
    libraryCompletionPercent: 67,
    heatmap: [],
    ...overrides,
  };
}

function makeWrapped(year: number) {
  return {
    year,
    movies: 10,
    episodes: 100,
    minutes: 6000,
    topTitles: [{ title: "Dune", count: 2 }],
    favouriteGenre: "Drama",
    activeDays: 50,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<StatsPage />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("StatsPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    statsState.data = makeStats();
    statsState.isError = false;
    statsState.error = null;
    statsState.refetch.mockReset();

    wrappedMock.mockReset().mockImplementation((year: number) => ({
      data: makeWrapped(year),
      isError: false,
      error: null,
      refetch: vi.fn(),
    }));

    forecastState.data = { backlogEpisodes: 0, backlogMinutes: 0, episodesPerWeek: 0, catchUpDate: null };
    forecastState.isError = false;
    forecastState.error = null;
    forecastState.refetch.mockReset();

    yearlyActivityState.data = [];

    renderWrappedCardMock.mockReset().mockResolvedValue(new Blob(["fake"], { type: "image/png" }));
    downloadWrappedCardMock.mockReset();
    toastMock.mockReset();
    loggerWarnMock.mockReset();
  });

  it("shows a remote error state when stats or wrapped fail, and retry refetches both", async () => {
    statsState.isError = true;
    statsState.error = new Error("boom");
    const wrappedRefetch = vi.fn();
    wrappedMock.mockReturnValue({ data: undefined, isError: false, error: null, refetch: wrappedRefetch });

    renderPage();

    const retryButton = await screen.findByRole("button", { name: "Try again" });
    retryButton.click();

    expect(statsState.refetch).toHaveBeenCalledTimes(1);
    expect(wrappedRefetch).toHaveBeenCalledTimes(1);
  });

  it("shows the skeleton while stats or wrapped data is not yet loaded", () => {
    statsState.data = undefined;
    renderPage();

    expect(screen.queryByText("Stats")).not.toBeInTheDocument();
  });

  it("renders the six top stat cards from stats data, including fallbacks", async () => {
    statsState.data = makeStats({ averageUserRating: null });
    renderPage();

    await screen.findByText("Stats");

    expect(screen.getByText("42")).toBeInTheDocument(); // moviesWatched
    expect(screen.getByText("310")).toBeInTheDocument(); // episodesWatched
    expect(screen.getByText("8 days 8h")).toBeInTheDocument(); // 12000 minutes
    expect(screen.getByText("3 days")).toBeInTheDocument(); // currentStreakDays
    expect(screen.getByText("—")).toBeInTheDocument(); // averageUserRating fallback (may match others too, checked below)
    expect(screen.getByText("67%")).toBeInTheDocument(); // libraryCompletionPercent
  });

  it("renders a formatted average rating when present", async () => {
    statsState.data = makeStats({ averageUserRating: 8.25 });
    renderPage();

    await screen.findByText("Stats");
    expect(screen.getByText("8.3")).toBeInTheDocument();
  });

  it("shows a this-month delta section with an up badge when month-over-month activity increased", async () => {
    statsState.data = makeStats({
      monthlyActivity: [
        { month: "2026-06", count: 5, minutes: 300 },
        { month: "2026-07", count: 8, minutes: 250 },
      ],
    });
    renderPage();

    const section = (await screen.findByText("This month")).closest("section");
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText("8")).toBeInTheDocument();
    expect(within(section as HTMLElement).getByText("+3 vs last month")).toBeInTheDocument();
    expect(within(section as HTMLElement).getByText("-0h 50min vs last month")).toBeInTheDocument();
  });

  it("shows a flat delta badge when the count and minutes are unchanged", async () => {
    statsState.data = makeStats({
      monthlyActivity: [
        { month: "2026-06", count: 4, minutes: 200 },
        { month: "2026-07", count: 4, minutes: 200 },
      ],
    });
    renderPage();

    await screen.findByText("This month");
    expect(screen.getAllByText("same as last month")).toHaveLength(2);
  });

  it("omits the this-month section entirely when there is not yet two months of activity", async () => {
    statsState.data = makeStats({ monthlyActivity: [] });
    renderPage();

    await screen.findByText("Stats");
    expect(screen.queryByText("This month")).not.toBeInTheDocument();
  });

  it("only renders the forecast section when there is a backlog", async () => {
    forecastState.data = { backlogEpisodes: 0, backlogMinutes: 0, episodesPerWeek: 0, catchUpDate: null };
    renderPage();
    await screen.findByText("Stats");
    expect(screen.queryByText("Forecast")).not.toBeInTheDocument();
  });

  it("renders the forecast section when there is a backlog", async () => {
    forecastState.data = {
      backlogEpisodes: 12,
      backlogMinutes: 480,
      episodesPerWeek: 3.5,
      catchUpDate: "2026-09-15T00:00:00.000Z",
    };
    renderPage();

    await screen.findByText("Forecast");
    expect(screen.getByText("12 episodes left")).toBeInTheDocument();
    expect(screen.getByText("3.5")).toBeInTheDocument();
  });

  it("calls useWrapped with the incremented/decremented year on next/previous-year clicks, disabling at the bounds", async () => {
    yearlyActivityState.data = [{ year: CURRENT_YEAR - 2, moviesWatched: 1, episodesWatched: 1, minutesWatched: 10 }];
    renderPage();

    await screen.findByText("Stats");
    expect(wrappedMock).toHaveBeenCalledWith(CURRENT_YEAR);

    const nextButton = screen.getByRole("button", { name: "Next year" });
    const prevButton = screen.getByRole("button", { name: "Previous year" });

    // Upper bound: at currentYear, "next" is disabled.
    expect(nextButton).toBeDisabled();
    expect(prevButton).not.toBeDisabled();

    fireEvent.click(prevButton);
    await waitFor(() => expect(wrappedMock).toHaveBeenCalledWith(CURRENT_YEAR - 1));

    fireEvent.click(prevButton);
    await waitFor(() => expect(wrappedMock).toHaveBeenCalledWith(CURRENT_YEAR - 2));

    // Lower bound reached: minYear is CURRENT_YEAR - 2, previous now disabled.
    await waitFor(() => expect(screen.getByRole("button", { name: "Previous year" })).toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: "Next year" }));
    await waitFor(() => expect(wrappedMock).toHaveBeenCalledWith(CURRENT_YEAR - 1));
  });

  it("exports the wrapped card: renders, downloads, then shows a success toast", async () => {
    renderPage();
    await screen.findByText("Stats");

    fireEvent.click(screen.getByRole("button", { name: "Export as image" }));

    await waitFor(() => expect(downloadWrappedCardMock).toHaveBeenCalledTimes(1));

    expect(renderWrappedCardMock).toHaveBeenCalledTimes(1);
    const [data] = renderWrappedCardMock.mock.calls[0] as [{ year: number }];
    expect(data.year).toBe(CURRENT_YEAR);

    const [blob, year] = downloadWrappedCardMock.mock.calls[0] as [Blob, number];
    expect(year).toBe(CURRENT_YEAR);
    expect(blob).toBeInstanceOf(Blob);

    expect(toastMock).toHaveBeenCalledWith({ description: "Wrapped image saved", variant: "success" });
  });

  it("shows a translated error toast and logs a warning when the export fails", async () => {
    renderWrappedCardMock.mockReset().mockRejectedValue(new Error("canvas exploded"));
    renderPage();
    await screen.findByText("Stats");

    fireEvent.click(screen.getByRole("button", { name: "Export as image" }));

    await waitFor(() => expect(toastMock).toHaveBeenCalled());

    expect(downloadWrappedCardMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith({ description: "Couldn't export the Wrapped image", variant: "error" });
    expect(loggerWarnMock).toHaveBeenCalledWith(expect.stringContaining("canvas exploded"));
  });

  it("has no detectable accessibility violations once stats have loaded", async () => {
    const { container } = renderPage();
    await screen.findByText("Stats");

    expect(await axe(container)).toHaveNoViolations();
  });
});
