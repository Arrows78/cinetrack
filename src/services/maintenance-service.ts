import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { browserStore, getDatabase } from "@/services/local/db";
import { portableData, type CineTrackBackup } from "@/services/local/portable-data";
import { isTauriApp } from "@/shared/lib/platform";

const BACKUP_FILE = "backups/latest.json";
const LAST_BACKUP_KEY = "cinetrack.last-auto-backup";

export const maintenanceService = {
  async quickCheck(): Promise<{ healthy: boolean; detail: string }> {
    const db = await getDatabase();
    if (!db) {
      try { JSON.stringify(browserStore.read()); return { healthy: true, detail: "Stockage navigateur lisible" }; }
      catch { return { healthy: false, detail: "Stockage navigateur invalide" }; }
    }
    const rows = await db.select<Array<{ quick_check: string }>>("PRAGMA quick_check");
    const detail = rows.map((row) => row.quick_check).join(", ") || "unknown";
    return { healthy: detail === "ok", detail };
  },

  async createAutomaticBackup(force = false): Promise<void> {
    const last = Number(window.localStorage.getItem(LAST_BACKUP_KEY) ?? 0);
    if (!force && Date.now() - last < 24 * 60 * 60 * 1000) return;
    const backup = await portableData.export();
    if (isTauriApp()) {
      await mkdir("backups", { baseDir: BaseDirectory.AppData, recursive: true });
      await writeTextFile(BACKUP_FILE, JSON.stringify(backup, null, 2), { baseDir: BaseDirectory.AppData });
    } else window.localStorage.setItem("cinetrack.latest-backup", JSON.stringify(backup));
    window.localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
  },

  async restoreAutomaticBackup(): Promise<void> {
    let raw: string | null = null;
    if (isTauriApp()) {
      if (!(await exists(BACKUP_FILE, { baseDir: BaseDirectory.AppData }))) throw new Error("Aucune sauvegarde automatique trouvée.");
      raw = await readTextFile(BACKUP_FILE, { baseDir: BaseDirectory.AppData });
    } else raw = window.localStorage.getItem("cinetrack.latest-backup");
    if (!raw) throw new Error("Aucune sauvegarde automatique trouvée.");
    await portableData.import(JSON.parse(raw) as CineTrackBackup);
  },
};
