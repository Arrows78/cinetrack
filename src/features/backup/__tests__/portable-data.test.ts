import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import { emptyData, type PortableData } from "../portable-data-common";

const invokeCommandMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/invoke", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    invokeTypedCommand: (command: { name: string }, args?: Record<string, unknown>) =>
      args === undefined ? invokeCommandMock(command.name) : invokeCommandMock(command.name, args),
  };
});

const libraryItem = (overrides: Partial<PortableData["library"][number]> = {}): PortableData["library"][number] => ({
  id: "lib-1",
  profileId: DEFAULT_PROFILE_ID,
  mediaId: 1,
  mediaType: "movie",
  title: "Test",
  posterPath: null,
  backdropPath: null,
  year: null,
  rating: null,
  genres: [],
  status: "watching",
  favourite: false,
  userRating: null,
  notes: null,
  tags: [],
  startedAt: null,
  completedAt: null,
  rewatchCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const viewingEvent = (overrides: Partial<PortableData["viewingEvents"][number]> = {}) => ({
  id: "event-1",
  profileId: DEFAULT_PROFILE_ID,
  mediaId: 2,
  mediaType: "movie" as const,
  title: "Noted Movie",
  eventType: "watched" as const,
  watchedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

function importArgs(): PortableData {
  const call = invokeCommandMock.mock.calls.find(([name]) => name === "import_backup_data");
  return (call?.[1] as { data: PortableData }).data;
}

// The per-table SQLite reads/writes behind export_backup_data/import_backup_data
// live in Rust and are exercised there (see src-tauri/src/backup/repository.rs's
// own tests) — this file only verifies portableData's Zod validation/
// normalization (parseBackup) and that it forwards the normalized data to
// invoke() unchanged, without a value getting silently stripped along the way.
describe("portableData", () => {
  beforeEach(() => {
    invokeCommandMock.mockReset();
    invokeCommandMock.mockResolvedValue(undefined);
  });

  it("export() wraps whatever export_backup_data resolves with in the backup envelope", async () => {
    const data = { ...emptyData(), library: [libraryItem()] };
    invokeCommandMock.mockResolvedValueOnce(data);
    const { portableData } = await import("../portable-data");

    const backup = await portableData.export();

    expect(invokeCommandMock).toHaveBeenCalledWith("export_backup_data");
    expect(backup.format).toBe("cinetrack-backup");
    expect(backup.data).toBe(data);
  });

  it("import() forwards the validated data to import_backup_data, then refreshes preferences", async () => {
    const { portableData } = await import("../portable-data");

    await portableData.import({
      format: "cinetrack-backup",
      version: 1,
      exportedAt: "",
      data: { ...emptyData(), library: [libraryItem({ mediaId: 5 })] },
    });

    // libraryItemSchema doesn't declare `id` (Rust's library_items rows are
    // keyed by (profileId, mediaId, mediaType), not a client-supplied uuid),
    // so it's stripped by Zod on the way through — expected, not a bug.
    expect(importArgs().library).toEqual([{ ...libraryItem({ mediaId: 5 }), id: undefined }]);
    expect(invokeCommandMock).toHaveBeenCalledWith("refresh_preferences");
  });

  // Regression check for a real bug: viewingEventSchema (portable-data-schema.ts)
  // didn't declare `note`, so zod's default strip-unknown-keys behavior erased
  // it while validating an imported backup, even after the Rust side already
  // carried it through export/import — a restore-from-backup silently erased
  // every note ever written.
  it("preserves a viewing event's note through import validation", async () => {
    const { portableData } = await import("../portable-data");

    await portableData.import({
      format: "cinetrack-backup",
      version: 1,
      exportedAt: "",
      data: { ...emptyData(), viewingEvents: [viewingEvent({ note: "Loved it" })] },
    });

    expect(importArgs().viewingEvents[0]?.note).toBe("Loved it");
  });

  // Regression check for a real bug: smart_lists and saved_filters were both
  // added to PROFILE_SCOPED_TABLES (so a restore's purge step already
  // deletes them) but were never added to PortableData's export/import at
  // all — a restore-from-backup silently wiped every smart list and saved
  // filter a profile had, since nothing re-inserted them afterward.
  it("preserves smart lists and saved filters through import validation", async () => {
    const { portableData } = await import("../portable-data");
    const rules = {
      status: "any" as const,
      mediaType: "movie" as const,
      genre: "Horror",
      maxRuntimeMinutes: 100,
      minRating: null,
      provider: "any" as const,
      hasEpisodeWaiting: false,
    };

    await portableData.import({
      format: "cinetrack-backup",
      version: 1,
      exportedAt: "",
      data: {
        ...emptyData(),
        smartLists: [
          {
            id: "sl1",
            profileId: DEFAULT_PROFILE_ID,
            name: "Short horror",
            rules,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        savedFilters: [
          {
            id: "sf1",
            profileId: DEFAULT_PROFILE_ID,
            page: "library" as const,
            name: "Paused shows",
            filters: { statusFilter: "paused" },
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });

    expect(importArgs().smartLists).toHaveLength(1);
    expect(importArgs().smartLists[0]?.name).toBe("Short horror");
    expect(importArgs().savedFilters).toHaveLength(1);
    expect(importArgs().savedFilters[0]?.name).toBe("Paused shows");
  });

  it("folds a legacy backup's watchlist array into planned library rows, dropping entries that already exist in the library", async () => {
    const { portableData } = await import("../portable-data");

    await portableData.import({
      format: "cinetrack-backup",
      version: 1,
      exportedAt: "",
      data: {
        library: [libraryItem({ mediaId: 1, title: "Already tracked", status: "watching" })],
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

    const library = importArgs().library;
    expect(library.find((item) => item.mediaId === 1)?.status).toBe("watching");
    expect(library.find((item) => item.mediaId === 2)?.status).toBe("planned");
  });

  it("rejects a backup with an unsupported format", async () => {
    const { portableData } = await import("../portable-data");

    await expect(
      portableData.import({ format: "something-else", version: 1, exportedAt: "", data: {} } as never)
    ).rejects.toThrow();
    expect(invokeCommandMock).not.toHaveBeenCalled();
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

    await portableData.import({
      format: "cinetrack-backup",
      version: 1,
      exportedAt: "",
      data: { preferences: { activeProfileId: "ghost" } },
    } as never);

    expect(importArgs().preferences.activeProfileId).toBe(DEFAULT_PROFILE_ID);
  });

  it("injects a default profile when the backup has none", async () => {
    const { portableData } = await import("../portable-data");

    await portableData.import({
      format: "cinetrack-backup",
      version: 1,
      exportedAt: "",
      data: {},
    } as never);

    expect(importArgs().profiles.map((profile) => profile.id)).toContain(DEFAULT_PROFILE_ID);
  });

  it("does not inject a duplicate default profile when the backup already has one", async () => {
    const { portableData } = await import("../portable-data");

    await portableData.import({
      format: "cinetrack-backup",
      version: 1,
      exportedAt: "",
      data: { profiles: [{ id: DEFAULT_PROFILE_ID, name: "Default", createdAt: "2026-01-01T00:00:00.000Z" }] },
    } as never);

    expect(importArgs().profiles.filter((profile) => profile.id === DEFAULT_PROFILE_ID)).toHaveLength(1);
  });

  it("injects a default profile alongside other existing profiles that don't have that id", async () => {
    const { portableData } = await import("../portable-data");

    await portableData.import({
      format: "cinetrack-backup",
      version: 1,
      exportedAt: "",
      data: { profiles: [{ id: "alex", name: "Alex", createdAt: "2026-01-01T00:00:00.000Z" }] },
    } as never);

    const ids = importArgs().profiles.map((profile) => profile.id);
    expect(ids).toContain("alex");
    expect(ids).toContain(DEFAULT_PROFILE_ID);
  });
});
