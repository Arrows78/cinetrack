import {
  BaseDirectory,
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import i18n from "@/i18n";
import { invokeCommand } from "@/shared/lib/invoke";
import { UserFacingError } from "@/shared/lib/user-facing-error";
import { MAX_BACKUP_FILE_BYTES, portableData } from "@/features/backup/portable-data";
import { STALE_24_HOURS } from "@/shared/constants/query";
import { logger } from "@/features/diagnostics/logger";

const BACKUP_DIR = "backups";
const AUTO_BACKUP_PREFIX = "auto-";
// Keeps the last 5 daily automatic backups instead of one slot an in-flight
// write could leave corrupt with no fallback — the atomic tmp+rename already
// protects any single file, but a bad *export* (e.g. a DB that was already
// unhealthy) would still overwrite the only good backup without this.
const AUTO_BACKUP_RETENTION = 5;
const PRE_RESTORE_FILE = "backups/pre-restore.json";
// Pre-rotation installs wrote a single "backups/latest.json" — read as a
// fallback so upgrading doesn't orphan an existing automatic backup until
// the next one happens to be created under the new naming scheme.
const LEGACY_BACKUP_FILE = "backups/latest.json";
const LAST_BACKUP_KEY = "cinetrack.last-auto-backup";
// Just a status flag (no personal data) — not the same category of thing
// removed from localStorage elsewhere in this app. Lets Settings show
// "last backup failed" even when an older successful backup still exists
// on disk, which getAutomaticBackupInfo()'s date alone can't distinguish.
const LAST_BACKUP_FAILED_KEY = "cinetrack.last-auto-backup-failed";

// Embeds the backup's own exportedAt in the filename (colons/dots swapped
// for dashes — Windows rejects `:` in filenames) so plain alphabetical
// sorting is also chronological, with no directory metadata to read.
const autoBackupFileName = (exportedAt: string) =>
  `${BACKUP_DIR}/${AUTO_BACKUP_PREFIX}${exportedAt.replace(/[:.]/g, "-")}.json`;

async function listAutoBackups(): Promise<string[]> {
  try {
    const entries = await readDir(BACKUP_DIR, { baseDir: BaseDirectory.AppData });
    return entries
      .filter((entry) => entry.isFile && entry.name.startsWith(AUTO_BACKUP_PREFIX) && entry.name.endsWith(".json"))
      .map((entry) => `${BACKUP_DIR}/${entry.name}`)
      .sort();
  } catch {
    // Directory doesn't exist yet (no automatic backup has ever run).
    return [];
  }
}

async function pruneOldAutoBackups(): Promise<void> {
  const files = await listAutoBackups();
  const excess = files.slice(0, Math.max(0, files.length - AUTO_BACKUP_RETENTION));
  await Promise.all(
    excess.map((file) =>
      remove(file, { baseDir: BaseDirectory.AppData }).catch((error) => {
        logger.warn(`Failed to remove old backup ${file}: ${error}`);
      })
    )
  );
}

// Written to a `.tmp` sibling first, then renamed into place — a rename on
// the same filesystem is atomic, so a crash, disk-full error, or forced
// quit mid-write leaves the `.tmp` file corrupt but never touches the
// previously-valid backup at `fileName`. Writing `fileName` directly would
// mean the one and only automatic backup (or pre-restore snapshot) could be
// left truncated with no way to recover.
async function writeNamedBackup(fileName: string, content: string): Promise<void> {
  await mkdir(BACKUP_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
  const tempFile = `${fileName}.tmp`;
  await writeTextFile(tempFile, content, { baseDir: BaseDirectory.AppData });
  await rename(tempFile, fileName, { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData });
}

async function readNamedBackup(fileName: string): Promise<string | null> {
  if (!(await exists(fileName, { baseDir: BaseDirectory.AppData }))) return null;
  return readTextFile(fileName, { baseDir: BaseDirectory.AppData });
}

async function readLatestAutoBackup(): Promise<string | null> {
  const files = await listAutoBackups();
  const latest = files[files.length - 1];
  if (latest) return readNamedBackup(latest);
  return readNamedBackup(LEGACY_BACKUP_FILE);
}

function assertReasonableSize(raw: string): void {
  // .length is UTF-16 code units, not bytes, but it's a close enough proxy
  // for this sanity check — real backups are orders of magnitude smaller.
  if (raw.length > MAX_BACKUP_FILE_BYTES) {
    throw new UserFacingError(i18n.t("backup.fileTooLarge"));
  }
}

export const maintenanceService = {
  async checkDataIntegrity(): Promise<{ healthy: boolean; detail: string }> {
    return invokeCommand<{ healthy: boolean; detail: string }>("check_data_integrity");
  },

  async createAutomaticBackup(force = false): Promise<void> {
    const last = Number(window.localStorage.getItem(LAST_BACKUP_KEY) ?? 0);
    if (!force && Date.now() - last < STALE_24_HOURS) return;
    try {
      const backup = await portableData.export();
      await writeNamedBackup(autoBackupFileName(backup.exportedAt), JSON.stringify(backup, null, 2));
      await pruneOldAutoBackups();
      window.localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
      window.localStorage.removeItem(LAST_BACKUP_FAILED_KEY);
    } catch (error) {
      window.localStorage.setItem(LAST_BACKUP_FAILED_KEY, "1");
      throw error;
    }
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
    if (!raw) throw new UserFacingError(i18n.t("backup.noPreRestoreSnapshot"));
    assertReasonableSize(raw);
    await portableData.import(JSON.parse(raw));
  },

  async restoreAutomaticBackup(): Promise<void> {
    const raw = await readLatestAutoBackup();
    if (!raw) throw new UserFacingError(i18n.t("backup.noAutomaticBackup"));
    assertReasonableSize(raw);
    await maintenanceService.restoreFromBackup(JSON.parse(raw));
  },

  /**
   * Peeks at the most recent automatic backup's `exportedAt` without
   * validating or importing it, so a confirmation dialog can show the
   * caller what date they're about to overwrite everything with before
   * they commit.
   */
  async getAutomaticBackupInfo(): Promise<{ exportedAt: string } | null> {
    const raw = await readLatestAutoBackup();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { exportedAt?: unknown };
    return { exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "" };
  },

  /**
   * For a visible "last backup" status in Settings — otherwise a failed
   * automatic backup fails silently (see App.tsx's console.warn-only
   * catch) and the user has no way to know their safety net is stale.
   */
  async getLastBackupStatus(): Promise<{ exportedAt: string | null; failed: boolean }> {
    const info = await maintenanceService.getAutomaticBackupInfo();
    const failed = window.localStorage.getItem(LAST_BACKUP_FAILED_KEY) === "1";
    return { exportedAt: info?.exportedAt ?? null, failed };
  },
};
