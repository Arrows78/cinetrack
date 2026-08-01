import { describe, expect, it, vi } from "vitest";
import { useTestSqlite } from "@/db/__tests__/sqlite-test-harness";
import { makeMedia } from "@/shared/test-utils";

vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => true }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));

describe("portableData", () => {
  useTestSqlite();

  it("exports the current state and can round-trip it back in", async () => {
    const { portableData } = await import("../portable-data");
    const { watchlistRepository } = await import("@/features/watchlist/watchlist-repository");
    const { libraryRepository } = await import("@/features/library/library-repository");

    await watchlistRepository.upsert({
      id: "test-id",
      mediaId: 1,
      mediaType: "movie",
      title: "Round Trip",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await libraryRepository.upsert(makeMedia({ id: 1, title: "Round Trip" }), { status: "watching" });

    const backup = await portableData.export();
    expect(backup.format).toBe("cinetrack-backup");
    expect(backup.data.watchlist).toHaveLength(1);
    expect(backup.data.library).toHaveLength(1);

    await portableData.import(backup);

    expect(await watchlistRepository.has(1, "movie")).toBe(true);
    expect((await libraryRepository.get(1, "movie"))?.status).toBe("watching");
  });

  it("rejects a backup with an unsupported format", async () => {
    const { portableData } = await import("../portable-data");

    await expect(
      portableData.import({ format: "something-else", version: 1, exportedAt: "", data: {} } as never)
    ).rejects.toThrow();
  });

  it("rejects a backup whose array fields are not arrays", async () => {
    const { portableData } = await import("../portable-data");

    await expect(
      portableData.import({
        format: "cinetrack-backup",
        version: 1,
        exportedAt: "",
        data: { watchlist: "not-an-array" },
      } as never)
    ).rejects.toThrow();
  });

  it("rejects a backup with wrong-typed fields inside an array item", async () => {
    const { portableData } = await import("../portable-data");

    await expect(
      portableData.import({
        format: "cinetrack-backup",
        version: 1,
        exportedAt: "",
        data: {
          watchlist: [{ mediaId: "not-a-number", mediaType: "movie", title: "x", createdAt: "2026-01-01" }],
        },
      } as never)
    ).rejects.toThrow();
  });

  it("rejects a backup with an invalid enum value", async () => {
    const { portableData } = await import("../portable-data");

    await expect(
      portableData.import({
        format: "cinetrack-backup",
        version: 1,
        exportedAt: "",
        data: {
          watchlist: [{ mediaId: 1, mediaType: "documentary", title: "x", createdAt: "2026-01-01" }],
        },
      } as never)
    ).rejects.toThrow();
  });

  it("rejects a backup with more profiles than the configured limit", async () => {
    const { portableData } = await import("../portable-data");
    const tooManyProfiles = Array.from({ length: 51 }, (_, index) => ({
      id: `profile-${index}`,
      name: `Profile ${index}`,
    }));

    await expect(
      portableData.import({
        format: "cinetrack-backup",
        version: 1,
        exportedAt: "",
        data: { profiles: tooManyProfiles },
      } as never)
    ).rejects.toThrow();
  });

  it("falls back to the default profile if the active profile referenced in the backup is missing", async () => {
    const { portableData } = await import("../portable-data");

    const backup = await portableData
      .import({
        format: "cinetrack-backup",
        version: 1,
        exportedAt: "",
        data: { preferences: { activeProfileId: "ghost" } },
      } as never)
      .then(() => portableData.export());

    expect(backup.data.preferences.activeProfileId).toBe("default");
  });
});
