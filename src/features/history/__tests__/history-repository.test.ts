import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewingHistoryItem } from "@/types/media";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

const entry = (overrides: Partial<ViewingHistoryItem> = {}): ViewingHistoryItem => ({
  id: crypto.randomUUID(),
  mediaId: 1,
  mediaType: "movie",
  title: "Test Movie",
  action: "movie:watched",
  timestamp: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

// The activity_log upsert, profile scoping and profileId fallback behavior
// now live in Rust and are exercised there (see
// src-tauri/src/commands/history.rs's own tests) — this only verifies the
// repository wraps invoke() with the right command name/args.
describe("historyRepository", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("list() invokes list_history with the given limit and returns its result", async () => {
    const items = [entry()];
    invokeMock.mockResolvedValueOnce(items);
    const { historyRepository } = await import("../history-repository");

    await expect(historyRepository.list(5)).resolves.toEqual(items);
    expect(invokeMock).toHaveBeenCalledWith("list_history", { limit: 5 });
  });

  it("list() defaults to a limit of 50", async () => {
    invokeMock.mockResolvedValueOnce([]);
    const { historyRepository } = await import("../history-repository");

    await historyRepository.list();
    expect(invokeMock).toHaveBeenCalledWith("list_history", { limit: 50 });
  });

  it("list() forwards a cursor's timestamp/id as beforeTimestamp/beforeId", async () => {
    invokeMock.mockResolvedValueOnce([]);
    const { historyRepository } = await import("../history-repository");

    await historyRepository.list(50, { beforeTimestamp: "2026-01-01T00:00:00.000Z", beforeId: "abc" });
    expect(invokeMock).toHaveBeenCalledWith("list_history", {
      limit: 50,
      beforeTimestamp: "2026-01-01T00:00:00.000Z",
      beforeId: "abc",
    });
  });

  it("wraps a rejected invoke() into an ApiCommandError", async () => {
    invokeMock.mockRejectedValueOnce({ message: "boom", status: 500 });
    const { historyRepository } = await import("../history-repository");

    await expect(historyRepository.list()).rejects.toMatchObject({ message: "boom", status: 500 });
  });
});
