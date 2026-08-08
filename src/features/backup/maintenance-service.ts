import { BaseDirectory, exists, mkdir, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import i18n from "@/i18n";
import { invokeCommand } from "@/shared/lib/invoke";
import { MAX_BACKUP_FILE_BYTES, portableData } from "@/features/backup/portable-data";

const BACKUP_FILE = "backups/latest.json";
const PRE_RESTORE_FILE = "backups/pre-restore.json";
const LAST_BACKUP_KEY = "cinetrack.last-auto-backup";

// Written to a `.tmp` sibling first, then renamed into place — a rename on
// the same filesystem is atomic, so a crash, disk-full error, or forced
// quit mid-write leaves the `.tmp` file corrupt but never touches the
// previously-valid backup at `fileName`. Writing `fileName` directly would
// mean the one and only automatic backup (or pre-restore snapshot) could be
// left truncated with no way to recover.
async function writeNamedBackup(fileName: string, content: string): Promise<void> {
  await mkdir("backups", { baseDir: BaseDirectory.AppData, recursive: true });
  const tempFile = `${fileName}.tmp`;
  await writeTextFile(tempFile, content, { baseDir: BaseDirectory.AppData });
  await rename(tempFile, fileName, { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData });
}

async function readNamedBackup(fileName: string): Promise<string | null> {
  if (!(await exists(fileName, { baseDir: BaseDirectory.AppData }))) return null;
  return readTextFile(fileName, { baseDir: BaseDirectory.AppData });
}

function assertReasonableSize(raw: string): void {
  // .length is UTF-16 code units, not bytes, but it's a close enough proxy
  // for this sanity check — real backups are orders of magnitude smaller.
  if (raw.length > MAX_BACKUP_FILE_BYTES) {
    throw new Error(i18n.t("backup.fileTooLarge"));
  }
}

export const maintenanceService = {
  async checkDataIntegrity(): Promise<{ healthy: boolean; detail: string }> {
    return invokeCommand<{ healthy: boolean; detail: string }>("check_data_integrity");
  },

  async createAutomaticBackup(force = false): Promise<void> {
    const last = Number(window.localStorage.getItem(LAST_BACKUP_KEY) ?? 0);
    if (!force && Date.now() - last < 24 * 60 * 60 * 1000) return;
    const backup = await portableData.export();
    await writeNamedBackup(BACKUP_FILE, JSON.stringify(backup, null, 2));
    window.localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
  },

  /**
   * Snapshots the current state to a recoverable "pre-restore" slot, then
   * imports `parsed`. Without this, importing the wrong file (or a
   * corrupted one that still happens to validate) silently and irreversibly
   * replaces everything — the automatic daily backup isn't a reliable
   * safety net for this since it can be up to 24h stale.
   */
  async restoreFromBackup(parsed: unknown): Promise<void> {
    const snapshot = await portableData.export();
    await writeNamedBackup(PRE_RESTORE_FILE, JSON.stringify(snapshot, null, 2));
    await portableData.import(parsed);
  },

  async undoLastRestore(): Promise<void> {
    const raw = await readNamedBackup(PRE_RESTORE_FILE);
    if (!raw) throw new Error(i18n.t("backup.noPreRestoreSnapshot"));
    assertReasonableSize(raw);
    await portableData.import(JSON.parse(raw));
  },

  async restoreAutomaticBackup(): Promise<void> {
    const raw = await readNamedBackup(BACKUP_FILE);
    if (!raw) throw new Error(i18n.t("backup.noAutomaticBackup"));
    assertReasonableSize(raw);
    await maintenanceService.restoreFromBackup(JSON.parse(raw));
  },

  /**
   * Peeks at the automatic backup's `exportedAt` without validating or
   * importing it, so a confirmation dialog can show the caller what date
   * they're about to overwrite everything with before they commit.
   */
  async getAutomaticBackupInfo(): Promise<{ exportedAt: string } | null> {
    const raw = await readNamedBackup(BACKUP_FILE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { exportedAt?: unknown };
    return { exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "" };
  },
};
