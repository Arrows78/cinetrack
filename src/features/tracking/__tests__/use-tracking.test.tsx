import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  buildWeek: vi.fn(),
  preferredProviderIds: [] as number[] | undefined,
}));

vi.mock("@/features/tracking/tracking-service", () => ({ trackingService: { build: mocks.build } }));
vi.mock("@/features/tracking/weekly-agenda-service", () => ({ weeklyAgendaService: { build: mocks.buildWeek } }));
vi.mock("@/features/preferences/use-preferences", () => ({
  useActiveProfileId: () => "default",
  usePreferences: () => ({ data: { preferredProviderIds: mocks.preferredProviderIds } }),
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
});
