import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import type { WatchlistItem } from "@/types/media";

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

let items: WatchlistItem[];

// Fakes the Rust list_watchlist/has_watchlist_item/save_watchlist_item/
// remove_watchlist_item commands (see src-tauri/src/commands/watchlist.rs)
// at the invoke() boundary — the real SQL/transactions behind them are
// exercised by that module's own Rust tests, this only verifies the hooks'
// query invalidation wiring.
const invokeMock = vi.fn(async (command: string, args?: Record<string, unknown>) => {
  switch (command) {
    // useActiveProfileId() (see use-preferences.ts) reads this via
    // preferencesRepository.getPreferences() — fixed to "default" so it
    // matches useActiveProfileId's own pre-resolution fallback.
    case "get_preferences":
      return { activeProfileId: "default" };
    case "list_watchlist":
      return items;
    case "has_watchlist_item":
      return items.some((current) => current.mediaId === args!.mediaId && current.mediaType === args!.mediaType);
    case "save_watchlist_item": {
      const upserted = args!.item as WatchlistItem;
      const index = items.findIndex(
        (current) => current.mediaId === upserted.mediaId && current.mediaType === upserted.mediaType
      );
      items = index >= 0 ? items.map((current, i) => (i === index ? upserted : current)) : [...items, upserted];
      return undefined;
    }
    case "remove_watchlist_item":
      items = items.filter((current) => !(current.mediaId === args!.mediaId && current.mediaType === args!.mediaType));
      return undefined;
    default:
      throw new Error(`Unhandled command: ${command}`);
  }
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

describe("useWatchlist", () => {
  beforeEach(() => {
    items = [];
    invokeMock.mockClear();
  });

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
