import { beforeEach, describe, expect, it, vi } from "vitest";
import { rename, writeTextFile } from "@tauri-apps/plugin-fs";

// `vi.hoisted` so `fsState` is reachable both from the (hoisted) vi.mock
// factory below and from the top-level `beforeEach` that clears it.
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

// Everything maintenanceService actually reads/writes (SQLite rows behind
// portableData.export()/import(), the Rust custom-path commands) is faked
// here instead of round-tripped through a real backend, since this file is
// entirely about maintenanceService's own orchestration — atomic tmp+rename
// writes, retention pruning, snapshot-before-restore/undo, custom-directory
// routing — not about what portableData actually contains. That content is
// covered by portable-data.test.ts and, on the Rust side, by
// src-tauri/src/backup/repository.rs's own tests.
const exportMock = vi.hoisted(() => vi.fn());
const importMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/backup/portable-data", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, portableData: { export: exportMock, import: importMock } };
});

const getPreferencesMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/preferences/preferences-repository", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, preferencesRepository: { getPreferences: getPreferencesMock } };
});

// Mocked at this layer (not `@/shared/lib/invoke`) so it transparently
// covers both `invokeCommand` and `invokeTypedCommand` — maintenanceService
// now goes through the latter for every Rust custom-path command (see
// backup-commands.ts), same convention as library-repository.test.ts.
const invokeCommandMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeCommandMock(command, args),
}));

beforeEach(() => {
  fsState.files.clear();
  window.localStorage.clear();
  // restoreFromBackup always snapshots the "current" state via export()
  // before importing, whatever it's restoring — every test gets a working
  // default here so only the tests that actually care about the snapshot's
  // content need to override it.
  exportMock.mockReset().mockResolvedValue(backup("default-snapshot"));
  importMock.mockReset();
  invokeCommandMock.mockReset();
  getPreferencesMock.mockReset().mockResolvedValue({ backupDirectory: null });
});

const backup = (marker: string, extra: Record<string, unknown> = {}) => ({
  format: "cinetrack-backup" as const,
  version: 1 as const,
  exportedAt: "2026-01-01T00:00:00.000Z",
  data: { marker, ...extra },
});

describe("maintenanceService.restoreFromBackup / undoLastRestore", () => {
  it("snapshots the current state before importing, and undo restores it", async () => {
    const currentState = backup("current");
    exportMock.mockResolvedValue(currentState);
    const { maintenanceService } = await import("../maintenance-service");
    const replacement = backup("replacement");

    await maintenanceService.restoreFromBackup(replacement);
    expect(importMock).toHaveBeenLastCalledWith(replacement);
    expect(fsState.files.get("backups/pre-restore.json")).toBe(JSON.stringify(currentState, null, 2));

    await maintenanceService.undoLastRestore();
    expect(importMock).toHaveBeenLastCalledWith(currentState);
  });

  it("throws when there is nothing to undo", async () => {
    const { maintenanceService } = await import("../maintenance-service");

    await expect(maintenanceService.undoLastRestore()).rejects.toThrow();
  });

  it("never corrupts the previous pre-restore snapshot if the atomic rename fails mid-write", async () => {
    exportMock.mockResolvedValue(backup("current"));
    const { maintenanceService } = await import("../maintenance-service");

    await maintenanceService.restoreFromBackup(backup("first replacement"));
    const goodSnapshot = fsState.files.get("backups/pre-restore.json");
    expect(goodSnapshot).toBeDefined();

    vi.mocked(rename).mockImplementationOnce(async () => {
      throw new Error("disk full");
    });
    await expect(maintenanceService.restoreFromBackup(backup("second replacement"))).rejects.toThrow();

    // The temp file was written, but the previously-valid snapshot was
    // never touched by the failed rename.
    expect(fsState.files.get("backups/pre-restore.json.tmp")).toBeDefined();
    expect(fsState.files.get("backups/pre-restore.json")).toBe(goodSnapshot);
  });
});

describe("maintenanceService automatic backup rotation", () => {
  it("creating an automatic backup and restoring it round-trips the data", async () => {
    exportMock.mockResolvedValue(backup("round-trip"));
    const { maintenanceService } = await import("../maintenance-service");

    await maintenanceService.createAutomaticBackup(true);
    await maintenanceService.restoreAutomaticBackup();

    expect(importMock).toHaveBeenLastCalledWith(backup("round-trip"));
  });

  it("restores the most recently created automatic backup, not just any", async () => {
    fsState.files.set("backups/auto-2026-01-01T00-00-00-000Z.json", JSON.stringify(backup("older")));
    fsState.files.set("backups/auto-2026-06-01T00-00-00-000Z.json", JSON.stringify(backup("newer")));
    const { maintenanceService } = await import("../maintenance-service");

    await maintenanceService.restoreAutomaticBackup();

    expect(importMock).toHaveBeenLastCalledWith(backup("newer"));
  });

  it("prunes automatic backups beyond the retention limit when a new one is created", async () => {
    for (let day = 1; day <= 7; day++) {
      fsState.files.set(`backups/auto-2026-01-0${day}T00-00-00-000Z.json`, JSON.stringify(backup(`day-${day}`)));
    }
    // Later than every seeded day so the new file sorts after all of them —
    // the fixed default exportedAt in backup() would otherwise collide with
    // day 1's filename instead of adding an 8th entry to prune from.
    exportMock.mockResolvedValue({ ...backup("new"), exportedAt: "2026-02-01T00:00:00.000Z" });
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
    fsState.files.set("backups/latest.json", JSON.stringify(backup("legacy")));
    const { maintenanceService } = await import("../maintenance-service");

    const info = await maintenanceService.getAutomaticBackupInfo();
    expect(info).not.toBeNull();

    await maintenanceService.restoreAutomaticBackup();
    expect(importMock).toHaveBeenLastCalledWith(backup("legacy"));
  });

  it("flags the last backup attempt as failed, then clears the flag on the next success", async () => {
    exportMock.mockResolvedValue(backup("status"));
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

// A custom backupDirectory routes every read/write through the
// write_backup_to_path/read_backup_from_path/list_backup_directory/
// remove_backup_file Rust commands (src-tauri/src/backup/) instead of the
// @tauri-apps/plugin-fs calls used above — that plugin can't safely be
// pre-allow-listed for an arbitrary, user-chosen absolute path. These
// commands are pure file I/O with no SQL behind them, so they're faked here
// with a small in-memory file map instead of a second plugin-fs mock.
describe("maintenanceService with a custom backup directory", () => {
  const CUSTOM_DIR = "/Users/alex/iCloud Drive/CineTrack Backups";

  function useCustomDirectory(): Map<string, string> {
    getPreferencesMock.mockResolvedValue({ backupDirectory: CUSTOM_DIR });
    const customFiles = new Map<string, string>();
    invokeCommandMock.mockImplementation(async (command: string, rawArgs?: Record<string, unknown>) => {
      const args = rawArgs ?? {};
      switch (command) {
        case "write_backup_to_path":
          customFiles.set(args.path as string, args.contents as string);
          return undefined;
        case "read_backup_from_path":
          return customFiles.get(args.path as string) ?? null;
        case "list_backup_directory": {
          const prefix = `${args.directory as string}/`;
          const names = new Set<string>();
          for (const path of customFiles.keys()) {
            if (path.startsWith(prefix) && !path.slice(prefix.length).includes("/")) {
              names.add(path.slice(prefix.length));
            }
          }
          return Array.from(names);
        }
        case "remove_backup_file":
          customFiles.delete(args.path as string);
          return undefined;
        default:
          throw new Error(`unexpected invokeCommand("${command}") in a custom-directory test`);
      }
    });
    return customFiles;
  }

  it("writes automatic backups through the custom-path commands instead of plugin-fs, and can restore them back", async () => {
    exportMock.mockResolvedValue(backup("custom"));
    const customFiles = useCustomDirectory();
    const { maintenanceService } = await import("../maintenance-service");

    // writeTextFile's call history isn't reset between tests (no
    // clearMocks in vitest.config.ts) and earlier tests in this file
    // legitimately call it via the default $APPDATA branch — clear it here
    // so the assertion below reflects only this test's own operation.
    vi.mocked(writeTextFile).mockClear();
    await maintenanceService.createAutomaticBackup(true);

    expect(writeTextFile).not.toHaveBeenCalled();
    expect(Array.from(customFiles.keys()).some((path) => path.startsWith(`${CUSTOM_DIR}/backups/auto-`))).toBe(true);

    await maintenanceService.restoreAutomaticBackup();
    expect(importMock).toHaveBeenLastCalledWith(backup("custom"));
  });

  it("prunes automatic backups beyond the retention limit inside the custom directory too", async () => {
    const customFiles = useCustomDirectory();
    for (let day = 1; day <= 7; day++) {
      customFiles.set(
        `${CUSTOM_DIR}/backups/auto-2026-01-0${day}T00-00-00-000Z.json`,
        JSON.stringify(backup(`d${day}`))
      );
    }
    // Later than every seeded day — see the equivalent $APPDATA pruning test.
    exportMock.mockResolvedValue({ ...backup("new"), exportedAt: "2026-02-01T00:00:00.000Z" });
    const { maintenanceService } = await import("../maintenance-service");

    await maintenanceService.createAutomaticBackup(true);

    const remaining = Array.from(customFiles.keys())
      .filter((path) => path.includes("/backups/auto-"))
      .sort();

    expect(remaining).toHaveLength(5);
    expect(remaining).not.toContain(`${CUSTOM_DIR}/backups/auto-2026-01-01T00-00-00-000Z.json`);
    expect(remaining).toContain(`${CUSTOM_DIR}/backups/auto-2026-01-07T00-00-00-000Z.json`);
  });

  it("snapshots and undoes a restore against the custom directory", async () => {
    exportMock.mockResolvedValue(backup("current", { preferences: { backupDirectory: CUSTOM_DIR } }));
    const customFiles = useCustomDirectory();
    const { maintenanceService } = await import("../maintenance-service");

    const replacement = backup("replacement", { preferences: { backupDirectory: CUSTOM_DIR } });
    await maintenanceService.restoreFromBackup(replacement);
    expect(importMock).toHaveBeenLastCalledWith(replacement);
    expect(customFiles.has(`${CUSTOM_DIR}/backups/pre-restore.json`)).toBe(true);

    await maintenanceService.undoLastRestore();
    expect(importMock).toHaveBeenLastCalledWith(backup("current", { preferences: { backupDirectory: CUSTOM_DIR } }));
  });
});
