import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  buildWeek: vi.fn(),
  preferredProviderIds: [] as number[] | undefined,
  preferencesPending: false,
}));

vi.mock("@/features/tracking/tracking-service", () => ({ trackingService: { build: mocks.build } }));
vi.mock("@/features/tracking/weekly-agenda-service", () => ({ weeklyAgendaService: { build: mocks.buildWeek } }));
vi.mock("@/features/preferences/use-preferences", () => ({
  useActiveProfileId: () => "default",
  usePreferences: () => ({
    data: { preferredProviderIds: mocks.preferredProviderIds },
    isPending: mocks.preferencesPending,
  }),
}));

import { useTracking } from "../use-tracking";
import { useWeeklyAgenda } from "../use-weekly-agenda";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("tracking hooks and the preferred streaming services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.build.mockResolvedValue([]);
    mocks.buildWeek.mockResolvedValue([]);
    mocks.preferredProviderIds = [];
    mocks.preferencesPending = false;
  });

  it("rebuilds the tracking feed when the preferred providers change", async () => {
    const { rerender } = renderHook(() => useTracking(), { wrapper: wrapper() });
    await waitFor(() => expect(mocks.build).toHaveBeenCalledTimes(1));

    mocks.preferredProviderIds = [8];
    rerender();

    await waitFor(() => expect(mocks.build).toHaveBeenLastCalledWith(60, [8]));
  });

  it("builds the weekly agenda with the same preferred providers as the tracking page", async () => {
    mocks.preferredProviderIds = [8];
    renderHook(() => useWeeklyAgenda(), { wrapper: wrapper() });

    await waitFor(() => expect(mocks.buildWeek).toHaveBeenCalledWith([8]));
  });

  it("does not build the weekly agenda before the preferences have settled, then builds it once", async () => {
    mocks.preferencesPending = true;
    const { rerender } = renderHook(() => useWeeklyAgenda(), { wrapper: wrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.buildWeek).not.toHaveBeenCalled();

    mocks.preferencesPending = false;
    mocks.preferredProviderIds = [8];
    rerender();

    await waitFor(() => expect(mocks.buildWeek).toHaveBeenCalledTimes(1));
    expect(mocks.buildWeek).toHaveBeenCalledWith([8]);
  });

  it("rebuilds the weekly agenda when the providers change, but not when the same ones are merely reordered", async () => {
    mocks.preferredProviderIds = [8, 9];
    const { rerender } = renderHook(() => useWeeklyAgenda(), { wrapper: wrapper() });
    await waitFor(() => expect(mocks.buildWeek).toHaveBeenCalledTimes(1));

    mocks.preferredProviderIds = [9, 8];
    rerender();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.buildWeek).toHaveBeenCalledTimes(1);

    mocks.preferredProviderIds = [8];
    rerender();
    await waitFor(() => expect(mocks.buildWeek).toHaveBeenCalledTimes(2));
  });
});
