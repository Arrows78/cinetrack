import i18n from "@/i18n";
import { backupCommands } from "@/features/backup/backup-commands";
import { invokeTypedCommand } from "@/shared/lib/invoke";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import { cineTrackBackupSchema } from "./backup-schema";
import { emptyData, foldLegacyWatchlistIntoLibrary, type PortableData } from "./portable-data-common";

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
 * being sent to Rust as-is. Throws with a readable message on failure.
 */
function parseBackup(value: unknown): CineTrackBackup {
  const result = cineTrackBackupSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.length ? ` (${issue.path.join(".")})` : "";
    throw new Error(
      i18n.t("backup.invalidBackupDetail", {
        message: issue?.message ?? i18n.t("backup.unrecognizedFormat"),
        path,
      })
    );
  }

  // `watchlist` only exists on backups exported before the watchlist/library
  // merge (migration 10) — fold it into planned-status library rows before
  // Rust ever sees this payload, which no longer knows about that table.
  const { watchlist: legacyWatchlist, ...rest } = result.data.data;
  const data = { ...emptyData(), ...rest } as PortableData;
  data.library = foldLegacyWatchlistIntoLibrary(data.library, legacyWatchlist);

  if (!data.profiles.some((profile) => profile.id === DEFAULT_PROFILE_ID)) {
    data.profiles.unshift({ id: DEFAULT_PROFILE_ID, name: "Default", createdAt: new Date().toISOString() });
  }
  const activeProfileId =
    typeof data.preferences.activeProfileId === "string" ? data.preferences.activeProfileId : DEFAULT_PROFILE_ID;
  if (!data.profiles.some((profile) => profile.id === activeProfileId)) {
    data.preferences = { ...data.preferences, activeProfileId: DEFAULT_PROFILE_ID };
  }

  return { format: "cinetrack-backup", version: 1, exportedAt: result.data.exportedAt, data };
}

// The per-table reads/writes (export_backup_data/import_backup_data) now
// live in Rust (see src-tauri/src/backup/) — this module
// keeps the Zod validation/normalization of untrusted backup JSON, which
// isn't SQL and stays in TS where it's already tested.
export const portableData = {
  async export(): Promise<CineTrackBackup> {
    const data = await invokeTypedCommand(backupCommands.exportData);
    return { format: "cinetrack-backup", version: 1, exportedAt: new Date().toISOString(), data };
  },

  async import(backup: unknown): Promise<void> {
    const { data } = parseBackup(backup);
    await invokeTypedCommand(backupCommands.importData, { data });
    await preferencesRepository.refresh();
  },
};
