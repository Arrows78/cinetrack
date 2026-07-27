import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { browserStore, getDatabase } from "@/db/client";
import { MAX_BACKUP_FILE_BYTES, portableData } from "@/features/backup/portable-data";
import { isTauriApp } from "@/shared/lib/platform";

const BACKUP_FILE = "backups/latest.json";
const PRE_RESTORE_FILE = "backups/pre-restore.json";
const LAST_BACKUP_KEY = "cinetrack.last-auto-backup";
const LATEST_BACKUP_KEY = "cinetrack.latest-backup";
const PRE_RESTORE_KEY = "cinetrack.pre-restore-backup";

async function writeNamedBackup(fileName: string, browserKey: string, content: string): Promise<void> {
  if (isTauriApp()) {
    await mkdir("backups", { baseDir: BaseDirectory.AppData, recursive: true });
    await writeTextFile(fileName, content, { baseDir: BaseDirectory.AppData });
  } else {
    window.localStorage.setItem(browserKey, content);
  }
}

async function readNamedBackup(fileName: string, browserKey: string): Promise<string | null> {
  if (isTauriApp()) {
    if (!(await exists(fileName, { baseDir: BaseDirectory.AppData }))) return null;
    return readTextFile(fileName, { baseDir: BaseDirectory.AppData });
  }
  return window.localStorage.getItem(browserKey);
}

function assertReasonableSize(raw: string): void {
  // .length is UTF-16 code units, not bytes, but it's a close enough proxy
  // for this sanity check — real backups are orders of magnitude smaller.
  if (raw.length > MAX_BACKUP_FILE_BYTES) {
    throw new Error("Fichier de sauvegarde trop volumineux.");
  }
}

export const maintenanceService = {
  async quickCheck(): Promise<{ healthy: boolean; detail: string }> {
    const db = await getDatabase();
    if (!db) {
      try {
        JSON.stringify(browserStore.read());
        return { healthy: true, detail: "Stockage navigateur lisible" };
      } catch {
        return { healthy: false, detail: "Stockage navigateur invalide" };
      }
    }
    const rows = await db.select<Array<{ quick_check: string }>>("PRAGMA quick_check");
    const detail = rows.map((row) => row.quick_check).join(", ") || "unknown";
    return { healthy: detail === "ok", detail };
  },

  async createAutomaticBackup(force = false): Promise<void> {
    const last = Number(window.localStorage.getItem(LAST_BACKUP_KEY) ?? 0);
    if (!force && Date.now() - last < 24 * 60 * 60 * 1000) return;
    const backup = await portableData.export();
    await writeNamedBackup(BACKUP_FILE, LATEST_BACKUP_KEY, JSON.stringify(backup, null, 2));
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
    await writeNamedBackup(PRE_RESTORE_FILE, PRE_RESTORE_KEY, JSON.stringify(snapshot, null, 2));
    await portableData.import(parsed);
  },

  async undoLastRestore(): Promise<void> {
    const raw = await readNamedBackup(PRE_RESTORE_FILE, PRE_RESTORE_KEY);
    if (!raw) throw new Error("Aucune sauvegarde pré-restauration trouvée.");
    assertReasonableSize(raw);
    await portableData.import(JSON.parse(raw));
  },

  async restoreAutomaticBackup(): Promise<void> {
    const raw = await readNamedBackup(BACKUP_FILE, LATEST_BACKUP_KEY);
    if (!raw) throw new Error("Aucune sauvegarde automatique trouvée.");
    assertReasonableSize(raw);
    await maintenanceService.restoreFromBackup(JSON.parse(raw));
  },
};
