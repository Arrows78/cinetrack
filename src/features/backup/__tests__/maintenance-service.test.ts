import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTestSqlite } from "@/db/__tests__/sqlite-test-harness";

vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => true }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

// `vi.hoisted` so `fsState` is reachable both from the (hoisted) vi.mock
// factory below and from the top-level `beforeEach` that clears it — plain
// `vi.resetModules()` (see the shared harness) doesn't reliably re-run
// vi.mock factories, so without an explicit reset, files written by one
// test would still be visible to the next.
const fsState = vi.hoisted(() => ({ files: new Map<string, string>() }));

vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: 0 },
  mkdir: vi.fn(async () => undefined),
  writeTextFile: vi.fn(async (path: string, content: string) => {
    fsState.files.set(path, content);
  }),
  readTextFile: vi.fn(async (path: string) => {
    const content = fsState.files.get(path);
    if (content === undefined) throw new Error(`not found: ${path}`);
    return content;
  }),
  exists: vi.fn(async (path: string) => fsState.files.has(path)),
}));

beforeEach(() => {
  fsState.files.clear();
});

const item = (mediaId: number) => ({
  id: "test-id",
  mediaId,
  mediaType: "movie" as const,
  title: `Movie ${mediaId}`,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("maintenanceService.restoreFromBackup / undoLastRestore", () => {
  useTestSqlite();

  it("snapshots the current state before importing, and undo restores it", async () => {
    const { maintenanceService } = await import("../maintenance-service");
    const { watchlistRepository } = await import("@/features/watchlist/watchlist-repository");

    await watchlistRepository.save(item(1));
    const before = await watchlistRepository.list();
    expect(before).toHaveLength(1);

    const replacement = { format: "cinetrack-backup", version: 1, exportedAt: "", data: { watchlist: [] } };
    await maintenanceService.restoreFromBackup(replacement);
    expect(await watchlistRepository.list()).toHaveLength(0);

    await maintenanceService.undoLastRestore();
    expect(await watchlistRepository.list()).toHaveLength(1);
    expect((await watchlistRepository.list())[0]!.mediaId).toBe(1);
  });

  it("throws when there is nothing to undo", async () => {
    const { maintenanceService } = await import("../maintenance-service");

    await expect(maintenanceService.undoLastRestore()).rejects.toThrow();
  });
});
