import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { useTestSqlite } from "@/db/__tests__/sqlite-test-harness";
import type { WatchlistItem } from "@/types/media";

vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => true }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const item: WatchlistItem = {
  id: "test-id",
  mediaId: 7,
  mediaType: "movie",
  title: "Test Movie",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("useWatchlist", () => {
  useTestSqlite();

  it("adding to the watchlist is reflected by useIsInWatchlist without a manual refetch", async () => {
    const { useIsInWatchlist, useWatchlist } = await import("../use-watchlist");
    const wrapper = createWrapper();
    const { result: watchlist } = renderHook(() => useWatchlist(), { wrapper });
    const { result: isInWatchlist } = renderHook(() => useIsInWatchlist(7, "movie"), { wrapper });

    await waitFor(() => expect(watchlist.current.isLoading).toBe(false));
    await waitFor(() => expect(isInWatchlist.current.data).toBe(false));

    await act(async () => {
      await watchlist.current.addToWatchlist(item);
    });

    await waitFor(() => expect(isInWatchlist.current.data).toBe(true));
    expect(watchlist.current.data).toHaveLength(1);
  });

  it("removing from the watchlist is reflected by useIsInWatchlist", async () => {
    const { useIsInWatchlist, useWatchlist } = await import("../use-watchlist");
    const wrapper = createWrapper();
    const { result: watchlist } = renderHook(() => useWatchlist(), { wrapper });
    const { result: isInWatchlist } = renderHook(() => useIsInWatchlist(7, "movie"), { wrapper });

    await waitFor(() => expect(watchlist.current.isLoading).toBe(false));

    await act(async () => {
      await watchlist.current.addToWatchlist(item);
    });
    await waitFor(() => expect(isInWatchlist.current.data).toBe(true));

    await act(async () => {
      await watchlist.current.removeFromWatchlist({ mediaId: 7, mediaType: "movie" });
    });

    await waitFor(() => expect(isInWatchlist.current.data).toBe(false));
    expect(watchlist.current.data).toHaveLength(0);
  });
});
