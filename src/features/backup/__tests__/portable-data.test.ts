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
  const db = useTestSqlite();

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

  // Regression check for a real bug: viewingEventSchema (portable-data-schema.ts)
  // didn't declare `note`, so zod's default strip-unknown-keys behavior erased
  // it while validating an imported backup, even after the Rust side already
  // carried it through export/import — a restore-from-backup silently erased
  // every note ever written.
  it("round-trips a viewing event's note through export and import", async () => {
    const { portableData } = await import("../portable-data");
    const { progressRepository } = await import("@/features/progress/progress-repository");

    await progressRepository.toggleMovieSeen(makeMedia({ id: 2, title: "Noted Movie" }), true, undefined, "Loved it");

    const backup = await portableData.export();
    const note = backup.data.viewingEvents.find((event) => event.mediaId === 2)?.note;
    expect(note).toBe("Loved it");

    await portableData.import(backup);

    const restoredNote = (await portableData.export()).data.viewingEvents.find((event) => event.mediaId === 2)?.note;
    expect(restoredNote).toBe("Loved it");
  });

  // Regression check for a real bug: smart_lists and saved_filters were both
  // added to PROFILE_SCOPED_TABLES (so a restore's purge step already
  // deletes them) but were never added to PortableData's export/import at
  // all — a restore-from-backup silently wiped every smart list and saved
  // filter a profile had, since nothing re-inserted them afterward.
  it("round-trips a smart list and a saved filter through export and import", async () => {
    const { portableData } = await import("../portable-data");
    const { libraryRepository } = await import("@/features/library/library-repository");

    // A real repository call first, so getDatabase() has already run
    // migrations before these tables are touched directly — smart_lists/
    // saved_filters have no TS repository wired into the fake invoke()
    // backend yet (only the Rust command layer), so this test seeds them
    // with raw SQL against the same in-memory database, the same way the
    // Rust-side regression test for this exact bug does.
    await libraryRepository.save(makeMedia({ id: 3, title: "Unrelated" }), { status: "planned" });

    const rules = JSON.stringify({
      status: "any",
      mediaType: "movie",
      genre: "Horror",
      maxRuntimeMinutes: 100,
      minRating: null,
      provider: "any",
      hasEpisodeWaiting: false,
    });
    db.current
      .prepare(
        `INSERT INTO smart_lists (uuid, profile_id, name, rules, created_at, updated_at)
         VALUES ('sl1', ?, 'Short horror', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      )
      .run(DEFAULT_PROFILE_ID, rules);
    db.current
      .prepare(
        `INSERT INTO saved_filters (uuid, profile_id, page, name, filters, created_at, updated_at)
         VALUES ('sf1', ?, 'library', 'Paused shows', '{"statusFilter":"paused"}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      )
      .run(DEFAULT_PROFILE_ID);

    const backup = await portableData.export();
    expect(backup.data.smartLists).toHaveLength(1);
    expect(backup.data.smartLists[0]?.name).toBe("Short horror");
    expect(backup.data.savedFilters).toHaveLength(1);
    expect(backup.data.savedFilters[0]?.name).toBe("Paused shows");

    await portableData.import(backup);

    const smartListCount = db.current.prepare("SELECT COUNT(*) as count FROM smart_lists").get();
    const savedFilterCount = db.current.prepare("SELECT COUNT(*) as count FROM saved_filters").get();
    expect(smartListCount?.count).toBe(1);
    expect(savedFilterCount?.count).toBe(1);
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
