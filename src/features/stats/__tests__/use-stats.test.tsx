import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

const getStatsMock = vi.fn(async () => ({ totalWatched: 10 }) as never);
const getYearSummaryMock = vi.fn(async (year: number) => ({ year }) as never);
const getForecastMock = vi.fn(async () => ({ backlogEpisodes: 3 }) as never);
const getYearlyActivityMock = vi.fn(async () => [
  { year: 2026, moviesWatched: 5, episodesWatched: 2, minutesWatched: 300 },
]);
const getOnThisDayEventsMock = vi.fn(async () => [{ id: "evt-1" }] as never);
const getMonthlyRecapMock = vi.fn(async (month: string) => ({ month }) as never);
const getRewatchStatsMock = vi.fn(async () => ({ totalRewatches: 4 }) as never);
const getRatingDistributionMock = vi.fn(async () => ({ distribution: [] }) as never);
const getWatchMilestonesMock = vi.fn(async () => [{ id: "episodes-100" }] as never);

vi.mock("@/features/stats/stats-repository", () => ({
  statsRepository: {
    getStats: getStatsMock,
    getYearSummary: getYearSummaryMock,
    getForecast: getForecastMock,
    getYearlyActivity: getYearlyActivityMock,
    getOnThisDayEvents: getOnThisDayEventsMock,
    getMonthlyRecap: getMonthlyRecapMock,
    getRewatchStats: getRewatchStatsMock,
    getRatingDistribution: getRatingDistributionMock,
    getWatchMilestones: getWatchMilestonesMock,
  },
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("stats hooks", () => {
  it("useStats loads stats from the repository", async () => {
    const { useStats } = await import("../use-stats");
    const { result } = renderHook(() => useStats(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual({ totalWatched: 10 });
  });

  it("useWrapped defaults to the current year and forwards an explicit one", async () => {
    const { useWrapped } = await import("../use-stats");
    const { result: defaultYear } = renderHook(() => useWrapped(), { wrapper: createWrapper() });
    await waitFor(() => expect(defaultYear.current.isLoading).toBe(false));
    expect(getYearSummaryMock).toHaveBeenCalledWith(new Date().getFullYear());

    const { result: explicitYear } = renderHook(() => useWrapped(2020), { wrapper: createWrapper() });
    await waitFor(() => expect(explicitYear.current.data).toEqual({ year: 2020 }));
  });

  it("useWatchForecast loads the forecast", async () => {
    const { useWatchForecast } = await import("../use-stats");
    const { result } = renderHook(() => useWatchForecast(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual({ backlogEpisodes: 3 });
  });

  it("useYearlyActivity loads the per-year buckets", async () => {
    const { useYearlyActivity } = await import("../use-stats");
    const { result } = renderHook(() => useYearlyActivity(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([{ year: 2026, moviesWatched: 5, episodesWatched: 2, minutesWatched: 300 }]);
  });

  it("useOnThisDay does not fetch at all while disabled", async () => {
    getOnThisDayEventsMock.mockClear();
    const { useOnThisDay } = await import("../use-stats");
    const { result } = renderHook(() => useOnThisDay(false), { wrapper: createWrapper() });

    // A disabled query never transitions into a loading/fetching state.
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
    expect(getOnThisDayEventsMock).not.toHaveBeenCalled();
  });

  it("useOnThisDay fetches the day's events once enabled", async () => {
    getOnThisDayEventsMock.mockClear();
    const { useOnThisDay } = await import("../use-stats");
    const { result } = renderHook(() => useOnThisDay(true), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toEqual([{ id: "evt-1" }]));
    expect(getOnThisDayEventsMock).toHaveBeenCalled();
  });

  it("useMonthlyRecap forwards the selected month to the repository", async () => {
    const { useMonthlyRecap } = await import("../use-stats");
    const { result } = renderHook(() => useMonthlyRecap("2026-03"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toEqual({ month: "2026-03" }));
    expect(getMonthlyRecapMock).toHaveBeenCalledWith("2026-03");
  });

  it("useRewatchStats loads rewatch analytics", async () => {
    const { useRewatchStats } = await import("../use-stats");
    const { result } = renderHook(() => useRewatchStats(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toEqual({ totalRewatches: 4 }));
  });

  it("useRatingDistribution loads the rating distribution", async () => {
    const { useRatingDistribution } = await import("../use-stats");
    const { result } = renderHook(() => useRatingDistribution(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toEqual({ distribution: [] }));
  });

  it("useWatchMilestones loads the milestone list", async () => {
    const { useWatchMilestones } = await import("../use-stats");
    const { result } = renderHook(() => useWatchMilestones(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toEqual([{ id: "episodes-100" }]));
  });
});
