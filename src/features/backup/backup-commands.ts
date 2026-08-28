import type { PortableData } from "@/features/backup/portable-data-common";
import { defineCommand } from "@/shared/lib/invoke";

type ImportBackupDataArgs = {
  data: PortableData;
};

export const backupCommands = {
  exportData: defineCommand<undefined, PortableData>("export_backup_data"),
  importData: defineCommand<ImportBackupDataArgs, void>("import_backup_data"),
} as const;
