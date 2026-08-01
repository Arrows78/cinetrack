import { getDatabase } from "@/db/client";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import { cineTrackBackupSchema } from "./backup-schema";
import { emptyData, type PortableData } from "./portable-data-common";
import { exportDatabaseToStore } from "./portable-data-export";
import { importStoreIntoDatabase } from "./portable-data-import";

export interface CineTrackBackup {
  format: "cinetrack-backup";
  version: 1;
  exportedAt: string;
  data: PortableData;
}

// First line of defense before even attempting JSON.parse on a user-selected
// file — the per-array-field limits in backup-schema.ts are what actually
// bound the work done against SQLite, this just avoids parsing an
// unreasonably large file at all.
export const MAX_BACKUP_FILE_BYTES = 100 * 1024 * 1024;

/**
 * Validates and normalizes an untrusted value into a full CineTrackBackup.
 * Field-by-field shape checking (see portable-data-schema.ts) — a backup with
 * e.g. `watchlist: [{ mediaId: "not-a-number" }]` is rejected instead of
 * being written into SQLite as-is. Throws with a readable message on
 * failure.
 */
function parseBackup(value: unknown): CineTrackBackup {
  const result = cineTrackBackupSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.length ? ` (${issue.path.join(".")})` : "";
    throw new Error(`Sauvegarde invalide : ${issue?.message ?? "format non reconnu"}${path}.`);
  }

  const data = { ...emptyData(), ...result.data.data } as PortableData;
  if (!data.profiles.some((profile) => profile.id === "default")) {
    data.profiles.unshift({ id: "default", name: "Principal", createdAt: new Date().toISOString() });
  }
  const activeProfileId =
    typeof data.preferences.activeProfileId === "string" ? data.preferences.activeProfileId : "default";
  if (!data.profiles.some((profile) => profile.id === activeProfileId)) {
    data.preferences = { ...data.preferences, activeProfileId: "default" };
  }

  return { format: "cinetrack-backup", version: 1, exportedAt: result.data.exportedAt, data };
}

export const portableData = {
  async export(): Promise<CineTrackBackup> {
    const db = await getDatabase();
    const data = await exportDatabaseToStore(db);
    return { format: "cinetrack-backup", version: 1, exportedAt: new Date().toISOString(), data };
  },

  async import(backup: unknown): Promise<void> {
    const { data } = parseBackup(backup);
    const db = await getDatabase();
    await importStoreIntoDatabase(db, data);
    preferencesRepository.invalidate();
  },
};
