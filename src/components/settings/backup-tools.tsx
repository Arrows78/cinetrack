import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Undo2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Panel } from "@/components/ui/panel";
import { toast } from "@/components/ui/use-toast";
import { MAX_BACKUP_FILE_BYTES, portableData } from "@/features/backup/portable-data";
import { maintenanceService } from "@/features/backup/maintenance-service";

export function BackupTools() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [pendingUndo, setPendingUndo] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

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
        throw new Error(t("backup.fileTooLarge"));
      }
      const parsed: unknown = JSON.parse(await file.text());
      await maintenanceService.restoreFromBackup(parsed);
      window.location.reload();
    } catch (error) {
      setIsImporting(false);
      setPendingImportFile(null);
      toast({ description: error instanceof Error ? error.message : t("backup.importFailed"), variant: "error" });
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
      toast({ description: error instanceof Error ? error.message : t("backup.undoFailed"), variant: "error" });
    }
  };

  return (
    <Panel>
      <p className="font-semibold">{t("backup.title")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t("backup.description")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
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
    </Panel>
  );
}
