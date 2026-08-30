import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

const pickMock = vi.fn();
vi.mock("@/features/watch-tonight/watch-tonight-service", () => ({
  watchTonightService: { pick: (...args: unknown[]) => pickMock(...args) },
}));

vi.mock("@/features/preferences/use-preferences", () => ({
  useActiveProfileId: () => "profile-1",
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  pickMock.mockReset().mockResolvedValue({ movies: [], series: [] });
});

describe("useWatchTonightPicks", () => {
  it("calls watchTonightService.pick with the given filters", async () => {
    const { useWatchTonightPicks } = await import("../use-watch-tonight");
    const { result } = renderHook(() => useWatchTonightPicks({ maxRuntime: 90 }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(pickMock).toHaveBeenCalledWith({ maxRuntime: 90 });
  });

  it("re-fetches when only the seed changes, even with identical filters", async () => {
    const { useWatchTonightPicks } = await import("../use-watch-tonight");
    const { result, rerender } = renderHook(({ seed }) => useWatchTonightPicks({}, seed), {
      wrapper: createWrapper(),
      initialProps: { seed: 0 },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(pickMock).toHaveBeenCalledTimes(1);

    rerender({ seed: 1 });
    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(2));
  });

  it("does not re-fetch when filters and seed are both unchanged across a re-render", async () => {
    const { useWatchTonightPicks } = await import("../use-watch-tonight");
    const { rerender } = renderHook(() => useWatchTonightPicks({ maxRuntime: 90 }, 0), { wrapper: createWrapper() });

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(1));
    rerender();

    expect(pickMock).toHaveBeenCalledTimes(1);
  });
});
