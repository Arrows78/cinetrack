import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Undo2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { QUERY_CACHE_KEY } from "@/app/query-client";
import { MAX_BACKUP_FILE_BYTES, portableData } from "@/features/backup/portable-data";
import { maintenanceService } from "@/features/backup/maintenance-service";

export function BackupTools() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  const exportBackup = async () => {
    const backup = await portableData.export();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cinetrack-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(t("backup.exported"));
  };

  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_FILE_BYTES) {
        throw new Error(t("backup.fileTooLarge"));
      }
      const parsed: unknown = JSON.parse(await file.text());
      await maintenanceService.restoreFromBackup(parsed);
      window.localStorage.removeItem(QUERY_CACHE_KEY);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("backup.importFailed"));
    }
  };

  const undoLastImport = async () => {
    try {
      await maintenanceService.undoLastRestore();
      window.localStorage.removeItem(QUERY_CACHE_KEY);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("backup.undoFailed"));
    }
  };

  return (
    <Panel>
      <p className="font-semibold">{t("backup.title")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t("backup.description")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void exportBackup()}>
          <Download className="mr-2 size-4" />
          {t("backup.export")}
        </Button>
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
          <Upload className="mr-2 size-4" />
          {t("backup.import")}
        </Button>
        <Button type="button" variant="outline" onClick={() => void undoLastImport()}>
          <Undo2 className="mr-2 size-4" />
          {t("backup.undoLastImport")}
        </Button>
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void importBackup(event.target.files?.[0])}
        />
      </div>
      {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
    </Panel>
  );
}
