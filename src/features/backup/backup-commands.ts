import type { PortableData } from "@/features/backup/portable-data-common";
import { defineCommand } from "@/shared/lib/invoke";

type ImportBackupDataArgs = {
  data: PortableData;
};

export interface DataIntegrityCheck {
  healthy: boolean;
  detail: string;
}

type WriteBackupToPathArgs = {
  path: string;
  contents: string;
};

type PathArgs = {
  path: string;
};

type ListBackupDirectoryArgs = {
  directory: string;
};

export const backupCommands = {
  exportData: defineCommand<undefined, PortableData>("export_backup_data"),
  importData: defineCommand<ImportBackupDataArgs, void>("import_backup_data"),
  checkDataIntegrity: defineCommand<undefined, DataIntegrityCheck>("check_data_integrity"),
  writeToPath: defineCommand<WriteBackupToPathArgs, void>("write_backup_to_path"),
  readFromPath: defineCommand<PathArgs, string | null>("read_backup_from_path"),
  listDirectory: defineCommand<ListBackupDirectoryArgs, string[]>("list_backup_directory"),
  removeFile: defineCommand<PathArgs, void>("remove_backup_file"),
} as const;
