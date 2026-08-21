// @vitest-environment node
//
// useTestSqlite() (see sqlite-test-harness.ts) uses the real node:sqlite
// built-in. Under the default jsdom environment, Vite treats this file as
// browser ("client") code and refuses to bundle a Node built-in into it.
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import { useTestSqlite } from "@/db/__tests__/sqlite-test-harness";
import { makeMedia } from "@/shared/test-utils";

vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => true }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("portableData", () => {
  useTestSqlite();

  it("exports the current state and can round-trip it back in", async () => {
    const { portableData } = await import("../portable-data");
    const { libraryRepository } = await import("@/features/library/library-repository");

    await libraryRepository.save(makeMedia({ id: 1, title: "Round Trip" }), { status: "watching" });

    const backup = await portableData.export();
    expect(backup.format).toBe("cinetrack-backup");
    expect(backup.data.library).toHaveLength(1);

    await portableData.import(backup);

    expect((await libraryRepository.get(1, "movie"))?.status).toBe("watching");
  });

  it("folds a legacy backup's watchlist array into planned library rows, dropping entries that already exist in the library", async () => {
    const { portableData } = await import("../portable-data");
    const { libraryRepository } = await import("@/features/library/library-repository");

    await portableData.import({
      format: "cinetrack-backup",
      version: 1,
      exportedAt: "",
      data: {
        library: [
          {
            profileId: DEFAULT_PROFILE_ID,
            mediaId: 1,
            mediaType: "movie",
            title: "Already tracked",
            genres: [],
            status: "watching",
            favourite: false,
            tags: [],
            rewatchCount: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        watchlist: [
          {
            id: "wl-1",
            mediaId: 1,
            mediaType: "movie",
            title: "Stale copy",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "wl-2",
            mediaId: 2,
            mediaType: "movie",
            title: "To watch",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      } as never,
    });

    expect((await libraryRepository.get(1, "movie"))?.status).toBe("watching");
    expect((await libraryRepository.get(2, "movie"))?.status).toBe("planned");
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
