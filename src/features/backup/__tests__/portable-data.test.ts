import { beforeEach, describe, expect, it } from "vitest";
import { portableData } from "../portable-data";
import { watchlistRepository } from "@/features/watchlist/watchlist-repository";
import { libraryRepository } from "@/features/library/library-repository";
import { makeMedia } from "@/shared/test-utils";

describe("portableData (browser fallback)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("exports the current state and can round-trip it back in", async () => {
    await watchlistRepository.upsert({
      mediaId: 1,
      mediaType: "movie",
      title: "Round Trip",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await libraryRepository.upsert(makeMedia({ id: 1, title: "Round Trip" }), { status: "watching" });

    const backup = await portableData.export();
    expect(backup.format).toBe("cinetrack-backup");
    expect(backup.data.watchlist).toHaveLength(1);
    expect(backup.data.library).toHaveLength(1);

    window.localStorage.clear();
    await portableData.import(backup);

    expect(await watchlistRepository.has(1, "movie")).toBe(true);
    expect((await libraryRepository.get(1, "movie"))?.status).toBe("watching");
  });

  it("rejects a backup with an unsupported format", async () => {
    await expect(
      portableData.import({ format: "something-else", version: 1, exportedAt: "", data: {} } as never),
    ).rejects.toThrow();
  });

  it("rejects a backup whose array fields are not arrays", async () => {
    await expect(
      portableData.import({
        format: "cinetrack-backup",
        version: 1,
        exportedAt: "",
        data: { watchlist: "not-an-array" },
      } as never),
    ).rejects.toThrow();
  });

  it("falls back to the default profile if the active profile referenced in the backup is missing", async () => {
    const backup = await portableData.import({
      format: "cinetrack-backup",
      version: 1,
      exportedAt: "",
      data: { preferences: { activeProfileId: "ghost" } },
    } as never).then(() => portableData.export());

    expect(backup.data.preferences.activeProfileId).toBe("default");
  });
});
