import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchlistItem } from "@/types/media";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

const item = (): WatchlistItem => ({
  id: "test-id",
  mediaId: 42,
  mediaType: "movie",
  title: "Test Movie",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

// The upsert/remove transactions, history logging and active-profile
// resolution now live in Rust and are exercised there (see
// src-tauri/src/commands/watchlist.rs's own tests) — this only verifies the
// repository wraps invoke() with the right command name/args.
describe("watchlistRepository", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("list() invokes list_watchlist and returns its result", async () => {
    const items = [item()];
    invokeMock.mockResolvedValueOnce(items);
    const { watchlistRepository } = await import("../watchlist-repository");

    await expect(watchlistRepository.list()).resolves.toEqual(items);
    expect(invokeMock).toHaveBeenCalledWith("list_watchlist", undefined);
  });

  it("has() invokes has_watchlist_item with mediaId/mediaType", async () => {
    invokeMock.mockResolvedValueOnce(true);
    const { watchlistRepository } = await import("../watchlist-repository");

    await expect(watchlistRepository.has(42, "movie")).resolves.toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("has_watchlist_item", { mediaId: 42, mediaType: "movie" });
  });

  it("upsert() invokes upsert_watchlist_item with the item", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { watchlistRepository } = await import("../watchlist-repository");
    const watchlistItem = item();

    await watchlistRepository.upsert(watchlistItem);
    expect(invokeMock).toHaveBeenCalledWith("upsert_watchlist_item", { item: watchlistItem });
  });

  it("remove() invokes remove_watchlist_item with mediaId/mediaType", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { watchlistRepository } = await import("../watchlist-repository");

    await watchlistRepository.remove(42, "movie");
    expect(invokeMock).toHaveBeenCalledWith("remove_watchlist_item", { mediaId: 42, mediaType: "movie" });
  });
});
