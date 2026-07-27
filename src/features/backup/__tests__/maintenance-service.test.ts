import { beforeEach, describe, expect, it } from "vitest";
import { maintenanceService } from "../maintenance-service";
import { watchlistRepository } from "@/features/watchlist/watchlist-repository";
import { preferencesRepository } from "@/features/preferences/preferences-repository";

const item = (mediaId: number) => ({
  mediaId,
  mediaType: "movie" as const,
  title: `Movie ${mediaId}`,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("maintenanceService.restoreFromBackup / undoLastRestore (browser fallback)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    preferencesRepository.invalidate();
  });

  it("snapshots the current state before importing, and undo restores it", async () => {
    await watchlistRepository.upsert(item(1));
    const before = await watchlistRepository.list();
    expect(before).toHaveLength(1);

    const replacement = { format: "cinetrack-backup", version: 1, exportedAt: "", data: { watchlist: [] } };
    await maintenanceService.restoreFromBackup(replacement);
    expect(await watchlistRepository.list()).toHaveLength(0);

    await maintenanceService.undoLastRestore();
    expect(await watchlistRepository.list()).toHaveLength(1);
    expect((await watchlistRepository.list())[0].mediaId).toBe(1);
  });

  it("throws when there is nothing to undo", async () => {
    await expect(maintenanceService.undoLastRestore()).rejects.toThrow();
  });
});
