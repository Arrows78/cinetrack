import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

const getStatsMock = vi.fn(async () => ({ totalWatched: 10 }) as never);
const getYearSummaryMock = vi.fn(async (year: number) => ({ year }) as never);
const getForecastMock = vi.fn(async () => ({ backlogEpisodes: 3 }) as never);

vi.mock("@/features/stats/stats-repository", () => ({
  statsRepository: {
    getStats: getStatsMock,
    getYearSummary: getYearSummaryMock,
    getForecast: getForecastMock,
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
});
