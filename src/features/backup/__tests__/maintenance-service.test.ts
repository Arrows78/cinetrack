// @vitest-environment node
//
// useTestSqlite() (see sqlite-test-harness.ts) uses the real node:sqlite
// built-in. Under the default jsdom environment, Vite treats this file as
// browser ("client") code and refuses to bundle a Node built-in into it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
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
  rename: vi.fn(async (oldPath: string, newPath: string) => {
    const content = fsState.files.get(oldPath);
    if (content === undefined) throw new Error(`not found: ${oldPath}`);
    fsState.files.delete(oldPath);
    fsState.files.set(newPath, content);
  }),
  remove: vi.fn(async (path: string) => {
    fsState.files.delete(path);
  }),
  readDir: vi.fn(async (dir: string) => {
    const prefix = `${dir}/`;
    const names = new Set<string>();
    for (const path of fsState.files.keys()) {
      if (path.startsWith(prefix) && !path.slice(prefix.length).includes("/")) {
        names.add(path.slice(prefix.length));
      }
    }
    return Array.from(names).map((name) => ({ name, isFile: true, isDirectory: false, isSymlink: false }));
  }),
}));

// createAutomaticBackup() reads/writes window.localStorage (just the
// once-per-24h throttle timestamp, not app data) — stubbed here since this
// file runs under the node environment (no window global), unlike the app
// itself which always runs in a webview.
const localStorageState = new Map<string, string>();
(globalThis as unknown as { window: { localStorage: Storage } }).window = {
  localStorage: {
    getItem: (key: string) => localStorageState.get(key) ?? null,
    setItem: (key: string, value: string) => void localStorageState.set(key, value),
    removeItem: (key: string) => void localStorageState.delete(key),
  } as Storage,
};

beforeEach(() => {
  fsState.files.clear();
  localStorageState.clear();
});

const media = (mediaId: number) => ({
  id: mediaId,
  mediaType: "movie" as const,
  title: `Movie ${mediaId}`,
  overview: "",
  genres: [] as string[],
  cast: [] as never[],
});

describe("maintenanceService.restoreFromBackup / undoLastRestore", () => {
  useTestSqlite();

  it("snapshots the current state before importing, and undo restores it", async () => {
    const { maintenanceService } = await import("../maintenance-service");
    const { libraryRepository } = await import("@/features/library/library-repository");

    await libraryRepository.save(media(1), { status: "planned" });
    const before = await libraryRepository.list();
    expect(before).toHaveLength(1);

    const replacement = { format: "cinetrack-backup", version: 1, exportedAt: "", data: { library: [] } };
    await maintenanceService.restoreFromBackup(replacement);
    expect(await libraryRepository.list()).toHaveLength(0);

    await maintenanceService.undoLastRestore();
    expect(await libraryRepository.list()).toHaveLength(1);
    expect((await libraryRepository.list())[0]!.mediaId).toBe(1);
  });

  it("throws when there is nothing to undo", async () => {
    const { maintenanceService } = await import("../maintenance-service");

    await expect(maintenanceService.undoLastRestore()).rejects.toThrow();
  });

  it("never corrupts the previous pre-restore snapshot if the atomic rename fails mid-write", async () => {
    const { maintenanceService } = await import("../maintenance-service");
    const { libraryRepository } = await import("@/features/library/library-repository");
    await libraryRepository.save(media(1), { status: "planned" });

    await maintenanceService.restoreFromBackup({ format: "cinetrack-backup", version: 1, exportedAt: "", data: {} });
    const goodSnapshot = fsState.files.get("backups/pre-restore.json");
    expect(goodSnapshot).toBeDefined();

    vi.mocked(rename).mockImplementationOnce(async () => {
      throw new Error("disk full");
    });
    await expect(
      maintenanceService.restoreFromBackup({ format: "cinetrack-backup", version: 1, exportedAt: "", data: {} })
    ).rejects.toThrow();

    // The temp file was written, but the previously-valid snapshot was
    // never touched by the failed rename.
    expect(fsState.files.get("backups/pre-restore.json.tmp")).toBeDefined();
    expect(fsState.files.get("backups/pre-restore.json")).toBe(goodSnapshot);
  });
});

// Backups are seeded directly into fsState rather than via repeated
// createAutomaticBackup() calls — the filename embeds exportedAt
// (new Date().toISOString()), and two calls executed within the same test
// can land in the same millisecond, colliding on one file instead of
// producing two.
const autoBackupContent = (mediaId: number) =>
  JSON.stringify({
    format: "cinetrack-backup",
    version: 1,
    exportedAt: "",
    data: {
      library: [
        {
          profileId: DEFAULT_PROFILE_ID,
          mediaId,
          mediaType: "movie",
          title: `Seed ${mediaId}`,
          genres: [],
          status: "planned",
          favourite: false,
          tags: [],
          rewatchCount: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    },
  });

describe("maintenanceService automatic backup rotation", () => {
  useTestSqlite();

  it("creating an automatic backup and restoring it round-trips the data", async () => {
    const { maintenanceService } = await import("../maintenance-service");
    const { libraryRepository } = await import("@/features/library/library-repository");
    await libraryRepository.save(media(1), { status: "planned" });

    await maintenanceService.createAutomaticBackup(true);
    await libraryRepository.remove(1, "movie");
    expect(await libraryRepository.list()).toHaveLength(0);

    await maintenanceService.restoreAutomaticBackup();
    expect((await libraryRepository.list())[0]?.mediaId).toBe(1);
  });

  it("restores the most recently created automatic backup, not just any", async () => {
    fsState.files.set("backups/auto-2026-01-01T00-00-00-000Z.json", autoBackupContent(1));
    fsState.files.set("backups/auto-2026-06-01T00-00-00-000Z.json", autoBackupContent(2));

    const { maintenanceService } = await import("../maintenance-service");
    const { libraryRepository } = await import("@/features/library/library-repository");

    await maintenanceService.restoreAutomaticBackup();

    const items = await libraryRepository.list();
    expect(items).toHaveLength(1);
    expect(items[0]!.mediaId).toBe(2);
  });

  it("prunes automatic backups beyond the retention limit when a new one is created", async () => {
    for (let day = 1; day <= 7; day++) {
      fsState.files.set(`backups/auto-2026-01-0${day}T00-00-00-000Z.json`, autoBackupContent(day));
    }

    const { maintenanceService } = await import("../maintenance-service");
    await maintenanceService.createAutomaticBackup(true);

    const remaining = Array.from(fsState.files.keys())
      .filter((path) => path.startsWith("backups/auto-") && path.endsWith(".json"))
      .sort();

    // The 5 most recent survive (retention limit — see AUTO_BACKUP_RETENTION
    // in maintenance-service.ts): the 4 newest seeded plus the one just
    // created. The 3 oldest seeded ones are gone.
    expect(remaining).toHaveLength(5);
    expect(remaining).not.toContain("backups/auto-2026-01-01T00-00-00-000Z.json");
    expect(remaining).not.toContain("backups/auto-2026-01-02T00-00-00-000Z.json");
    expect(remaining).not.toContain("backups/auto-2026-01-03T00-00-00-000Z.json");
    expect(remaining).toContain("backups/auto-2026-01-07T00-00-00-000Z.json");
  });

  it("falls back to the pre-rotation backups/latest.json when no rotated backup exists yet", async () => {
    fsState.files.set("backups/latest.json", autoBackupContent(9));

    const { maintenanceService } = await import("../maintenance-service");
    const { libraryRepository } = await import("@/features/library/library-repository");

    const info = await maintenanceService.getAutomaticBackupInfo();
    expect(info).not.toBeNull();

    await maintenanceService.restoreAutomaticBackup();
    expect((await libraryRepository.list())[0]?.mediaId).toBe(9);
  });

  it("flags the last backup attempt as failed, then clears the flag on the next success", async () => {
    const { maintenanceService } = await import("../maintenance-service");

    vi.mocked(writeTextFile).mockImplementationOnce(async () => {
      throw new Error("disk full");
    });
    await expect(maintenanceService.createAutomaticBackup(true)).rejects.toThrow();
    expect((await maintenanceService.getLastBackupStatus()).failed).toBe(true);

    await maintenanceService.createAutomaticBackup(true);
    const status = await maintenanceService.getLastBackupStatus();
    expect(status.failed).toBe(false);
    expect(status.exportedAt).not.toBeNull();
  });
});
