import { beforeEach, describe, expect, it } from "vitest";
import { watchlistRepository } from "../watchlist-repository";
import { historyRepository } from "../history-repository";
import type { WatchlistItem } from "@/types/media";

const item = (): WatchlistItem => ({
  mediaId: 42,
  mediaType: "movie",
  title: "Test Movie",
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("watchlistRepository (browser fallback)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("adds an item and reports it as present", async () => {
    await watchlistRepository.upsert(item());

    const list = await watchlistRepository.list();
    expect(list).toHaveLength(1);
    expect(list[0].mediaId).toBe(42);
    expect(await watchlistRepository.has(42, "movie")).toBe(true);
  });

  it("records a history entry only the first time an item is added", async () => {
    await watchlistRepository.upsert(item());
    await watchlistRepository.upsert(item());

    const history = await historyRepository.list();
    expect(history.filter((entry) => entry.action === "watchlist:add")).toHaveLength(1);
  });

  it("removes an item and records a removal history entry", async () => {
    await watchlistRepository.upsert(item());
    await watchlistRepository.remove(42, "movie");

    expect(await watchlistRepository.has(42, "movie")).toBe(false);
    const history = await historyRepository.list();
    expect(history.some((entry) => entry.action === "watchlist:remove")).toBe(true);
  });

  it("does not record a removal history entry when the item was never present", async () => {
    await watchlistRepository.remove(999, "movie");
    const history = await historyRepository.list();
    expect(history.some((entry) => entry.action === "watchlist:remove")).toBe(false);
  });
});
