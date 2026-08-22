import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FolderOpen, RotateCcw, Undo2, Upload } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/use-toast";
import { MAX_BACKUP_FILE_BYTES, portableData } from "@/features/backup/portable-data";
import { maintenanceService } from "@/features/backup/maintenance-service";
import { logger } from "@/features/diagnostics/logger";
import { usePreferences } from "@/features/preferences/use-preferences";
import { errorMessage } from "@/shared/lib/errors";
import { displayMessage, UserFacingError } from "@/shared/lib/user-facing-error";

export function BackupTools() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [pendingUndo, setPendingUndo] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { data: preferences, updatePreference } = usePreferences();
  const [isChoosingFolder, setIsChoosingFolder] = useState(false);
  const [isResettingFolder, setIsResettingFolder] = useState(false);
  const backupDirectory = preferences?.backupDirectory ?? null;

  const exportBackup = async () => {
    setIsExporting(true);
    try {
      const backup = await portableData.export();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `cinetrack-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast({ description: t("backup.exported"), variant: "success" });
    } catch {
      toast({ description: t("backup.exportFailed"), variant: "error" });
    } finally {
      setIsExporting(false);
    }
  };

  const confirmImport = async () => {
    const file = pendingImportFile;
    if (!file) return;
    setIsImporting(true);
    try {
      if (file.size > MAX_BACKUP_FILE_BYTES) {
        throw new UserFacingError(t("backup.fileTooLarge"));
      }
      const parsed: unknown = JSON.parse(await file.text());
      await maintenanceService.restoreFromBackup(parsed);
      window.location.reload();
    } catch (error) {
      setIsImporting(false);
      setPendingImportFile(null);
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
              if (file) setPendingImportFile(file);
            }}
          />
        </div>
        <div className="border-t border-border pt-6">
          <p className="text-sm font-medium">{t("backup.locationTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("backup.locationDescription")}</p>
          <p className="mt-3 rounded-xl border border-border bg-card p-3 font-mono text-xs break-all">
            {backupDirectory ? t("backup.currentLocation", { path: backupDirectory }) : t("backup.defaultLocation")}
          </p>
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
        </div>
      </CardContent>
      <ConfirmDialog
        open={pendingImportFile !== null}
        onOpenChange={(open) => !open && !isImporting && setPendingImportFile(null)}
        title={t("backup.importConfirmTitle")}
        description={t("backup.importConfirmDescription")}
        confirmLabel={t("backup.import")}
        cancelLabel={t("common.cancel")}
        isConfirming={isImporting}
        onConfirm={() => void confirmImport()}
      />

      <ConfirmDialog
        open={pendingUndo}
        onOpenChange={(open) => !open && !isUndoing && setPendingUndo(false)}
        title={t("backup.undoConfirmTitle")}
        description={t("backup.undoConfirmDescription")}
        confirmLabel={t("backup.undoLastImport")}
        cancelLabel={t("common.cancel")}
        confirmVariant="destructive"
        isConfirming={isUndoing}
        onConfirm={() => void undoLastImport()}
      />
    </Card>
  );
}
