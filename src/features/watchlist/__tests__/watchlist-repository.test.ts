import { describe, expect, it, vi } from "vitest";
import { useTestSqlite } from "@/db/__tests__/sqlite-test-harness";
import type { WatchlistItem } from "@/types/media";

vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => true }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));

const item = (): WatchlistItem => ({
  id: "test-id",
  mediaId: 42,
  mediaType: "movie",
  title: "Test Movie",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("watchlistRepository", () => {
  useTestSqlite();

  it("adds an item and reports it as present", async () => {
    const { watchlistRepository } = await import("../watchlist-repository");

    await watchlistRepository.upsert(item());

    const list = await watchlistRepository.list();
    expect(list).toHaveLength(1);
    expect(list[0].mediaId).toBe(42);
    expect(await watchlistRepository.has(42, "movie")).toBe(true);
  });

  it("records a history entry only the first time an item is added", async () => {
    const { watchlistRepository } = await import("../watchlist-repository");
    const { historyRepository } = await import("@/features/history/history-repository");

    await watchlistRepository.upsert(item());
    await watchlistRepository.upsert(item());

    const history = await historyRepository.list();
    expect(history.filter((entry) => entry.action === "watchlist:add")).toHaveLength(1);
  });

  it("removes an item and records a removal history entry", async () => {
    const { watchlistRepository } = await import("../watchlist-repository");
    const { historyRepository } = await import("@/features/history/history-repository");

    await watchlistRepository.upsert(item());
    await watchlistRepository.remove(42, "movie");

    expect(await watchlistRepository.has(42, "movie")).toBe(false);
    const history = await historyRepository.list();
    expect(history.some((entry) => entry.action === "watchlist:remove")).toBe(true);
  });

  it("does not record a removal history entry when the item was never present", async () => {
    const { watchlistRepository } = await import("../watchlist-repository");
    const { historyRepository } = await import("@/features/history/history-repository");

    await watchlistRepository.remove(999, "movie");
    const history = await historyRepository.list();
    expect(history.some((entry) => entry.action === "watchlist:remove")).toBe(false);
  });
});
