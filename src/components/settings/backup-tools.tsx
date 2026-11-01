import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FolderOpen, RotateCcw, Undo2, Upload } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { BaseDirectory, mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { appCacheDir, join } from "@tauri-apps/api/path";
import { shareFile } from "@choochmeque/tauri-plugin-sharekit-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/use-toast";
import {
  MAX_BACKUP_FILE_BYTES,
  maintenanceService,
  parseBackup,
  portableData,
  summarizeBackup,
  type BackupSummary,
  type CineTrackBackup,
} from "@/features/backup";
import { logger } from "@/shared/lib/logger";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useSyncStatus } from "@/features/sync/use-sync-status";
import { errorMessage } from "@/shared/lib/errors";
import { displayMessage, UserFacingError } from "@/shared/lib/user-facing-error";
import { isMobileApp } from "@/shared/lib/platform";
import { formatRelativeDate } from "@/shared/utils/format";

const SHARE_CACHE_SUBDIR = "shares";

async function shareBackupOnMobile(contents: string, filename: string): Promise<boolean> {
  await mkdir(SHARE_CACHE_SUBDIR, { baseDir: BaseDirectory.AppCache, recursive: true });
  const relativePath = `${SHARE_CACHE_SUBDIR}/${filename}`;
  await writeFile(relativePath, new TextEncoder().encode(contents), { baseDir: BaseDirectory.AppCache });
  const absolutePath = await join(await appCacheDir(), relativePath);

  try {
    await shareFile(`file://${absolutePath}`, { mimeType: "application/json", title: filename });
    return true;
  } catch (error) {
    if (error instanceof Error && error.message === "Share cancelled") return false;
    throw error;
  }
}

interface PendingImport {
  backup: CineTrackBackup;
  summary: BackupSummary;
}

export function BackupTools() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [pendingUndo, setPendingUndo] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { data: preferences, updatePreference } = usePreferences();
  const [isChoosingFolder, setIsChoosingFolder] = useState(false);
  const [isResettingFolder, setIsResettingFolder] = useState(false);
  const mobile = isMobileApp();
  const backupDirectory = mobile ? null : (preferences?.backupDirectory ?? null);
  // A restore does not tell the cloud what it removed: on a synced profile,
  // what the backup lacks can come back at the next sync.
  const syncStatus = useSyncStatus();
  const syncWarning = syncStatus.data?.lastSyncedAt ? ` ${t("backup.syncRestoreWarning")}` : "";

  const exportBackup = async () => {
    setIsExporting(true);
    try {
      const backup = await portableData.export();
      const contents = JSON.stringify(backup, null, 2);
      // Full timestamp (not just the date) — same pattern
      // maintenance-service.ts's automatic backup already uses — so two
      // manual exports the same day don't silently overwrite one another.
      const filename = `cinetrack-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

      if (mobile) {
        const shared = await shareBackupOnMobile(contents, filename);
        if (!shared) return;
      } else {
        const blob = new Blob([contents], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
      }

      toast({ description: t("backup.exported"), variant: "success" });
    } catch (error) {
      logger.warn(`Backup export failed: ${errorMessage(error)}`);
      toast({ description: t("backup.exportFailed"), variant: "error" });
    } finally {
      setIsExporting(false);
    }
  };

  const prepareImport = async (file: File) => {
    try {
      if (file.size > MAX_BACKUP_FILE_BYTES) {
        throw new UserFacingError(t("backup.fileTooLarge"));
      }
      const raw: unknown = JSON.parse(await file.text());
      const parsed = parseBackup(raw);
      setPendingImport({ backup: parsed, summary: summarizeBackup(parsed) });
    } catch (error) {
      logger.warn(`Backup preview failed: ${errorMessage(error)}`);
      toast({ description: displayMessage(error, t("backup.importFailed")), variant: "error" });
    }
  };

  const confirmImport = async () => {
    if (!pendingImport) return;
    setIsImporting(true);
    try {
      await maintenanceService.restoreFromBackup(pendingImport.backup);
      window.location.reload();
    } catch (error) {
      setIsImporting(false);
      setPendingImport(null);
      logger.warn(`Backup import failed: ${errorMessage(error)}`);
      toast({ description: displayMessage(error, t("backup.importFailed")), variant: "error" });
    }
  };

  const undoLastImport = async () => {
    setIsUndoing(true);
    try {
      await maintenanceService.undoLastRestore();
      window.location.reload();
    } catch (error) {
      setIsUndoing(false);
      setPendingUndo(false);
      logger.warn(`Undo last import failed: ${errorMessage(error)}`);
      toast({ description: displayMessage(error, t("backup.undoFailed")), variant: "error" });
    }
  };

  const chooseBackupFolder = async () => {
    setIsChoosingFolder(true);
    try {
      const selected = await open({ directory: true });
      // A cancelled dialog resolves to null — not an error, just a no-op.
      if (!selected || Array.isArray(selected)) return;
      await updatePreference({ key: "backupDirectory", value: selected });
      toast({ description: t("backup.folderUpdated"), variant: "success" });
    } catch (error) {
      logger.warn(`Choosing a backup folder failed: ${errorMessage(error)}`);
      toast({ description: displayMessage(error, t("backup.folderUpdateFailed")), variant: "error" });
    } finally {
      setIsChoosingFolder(false);
    }
  };

  const resetBackupFolder = async () => {
    setIsResettingFolder(true);
    try {
      await updatePreference({ key: "backupDirectory", value: null });
      toast({ description: t("backup.folderReset"), variant: "success" });
    } catch (error) {
      logger.warn(`Resetting the backup folder failed: ${errorMessage(error)}`);
      toast({ description: displayMessage(error, t("backup.folderUpdateFailed")), variant: "error" });
    } finally {
      setIsResettingFolder(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("backup.title")}</CardTitle>
        <CardDescription>{t("backup.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={isExporting} onClick={() => void exportBackup()}>
            <Download className="mr-2 size-4" />
            {t("backup.export")}
          </Button>
          <Button type="button" variant="outline" disabled={isImporting} onClick={() => inputRef.current?.click()}>
            <Upload className="mr-2 size-4" />
            {t("backup.import")}
          </Button>
          <Button type="button" variant="outline" disabled={isUndoing} onClick={() => setPendingUndo(true)}>
            <Undo2 className="mr-2 size-4" />
            {t("backup.undoLastImport")}
          </Button>
          <input
            ref={inputRef}
            className="hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void prepareImport(file);
            }}
          />
        </div>
        <div className="border-t border-border pt-6">
          <p className="text-body-sm font-medium">{t("backup.locationTitle")}</p>
          <p className="mt-1 text-caption text-muted-foreground">
            {t(mobile ? "backup.locationMobileDescription" : "backup.locationDescription")}
          </p>
          <p className="mt-3 rounded-xl border border-border bg-card p-3 font-mono text-caption break-all">
            {backupDirectory ? t("backup.currentLocation", { path: backupDirectory }) : t("backup.defaultLocation")}
          </p>
          {!mobile ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isChoosingFolder}
                onClick={() => void chooseBackupFolder()}
              >
                <FolderOpen className="mr-2 size-4" />
                {t("backup.chooseFolder")}
              </Button>
              {backupDirectory ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isResettingFolder}
                  onClick={() => void resetBackupFolder()}
                >
                  <RotateCcw className="mr-2 size-4" />
                  {t("backup.resetFolder")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
      <ConfirmDialog
        open={pendingImport !== null}
        onOpenChange={(open) => !open && !isImporting && setPendingImport(null)}
        title={t("backup.importConfirmTitle")}
        description={
          pendingImport
            ? `${t("backup.importPreview", {
                date: formatRelativeDate(pendingImport.summary.exportedAt),
                profiles: pendingImport.summary.profiles,
                libraryItems: pendingImport.summary.libraryItems,
                viewingEvents: pendingImport.summary.viewingEvents,
                trackedSeries: pendingImport.summary.trackedSeries,
                lists: pendingImport.summary.customLists,
              })} ${t("backup.importConfirmDescription")}${syncWarning}`
            : undefined
        }
        confirmLabel={t("backup.import")}
        cancelLabel={t("common.cancel")}
        isConfirming={isImporting}
        onConfirm={() => void confirmImport()}
      />

      <ConfirmDialog
        open={pendingUndo}
        onOpenChange={(open) => !open && !isUndoing && setPendingUndo(false)}
        title={t("backup.undoConfirmTitle")}
        description={`${t("backup.undoConfirmDescription")}${syncWarning}`}
        confirmLabel={t("backup.undoLastImport")}
        cancelLabel={t("common.cancel")}
        confirmVariant="destructive"
        isConfirming={isUndoing}
        onConfirm={() => void undoLastImport()}
      />
    </Card>
  );
}
