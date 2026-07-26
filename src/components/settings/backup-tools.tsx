import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QUERY_CACHE_KEY } from "@/app/query-client";
import { portableData, type CineTrackBackup } from "@/services/local/portable-data";

export function BackupTools() {
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
    setMessage("Sauvegarde exportée.");
  };

  const importBackup = async (file?: File) => {
    if (!file) return;
    const parsed = JSON.parse(await file.text()) as CineTrackBackup;
    await portableData.import(parsed);
    window.localStorage.removeItem(QUERY_CACHE_KEY);
    window.location.reload();
  };

  return (
    <div className="rounded-3xl border border-border bg-card/60 p-5">
      <p className="font-semibold">Sauvegarde portable</p>
      <p className="mt-1 text-sm text-muted-foreground">Export JSON complet, import et restauration locale.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void exportBackup()}><Download className="mr-2 size-4" />Exporter</Button>
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}><Upload className="mr-2 size-4" />Importer</Button>
        <input ref={inputRef} className="hidden" type="file" accept="application/json,.json" onChange={(event) => void importBackup(event.target.files?.[0])} />
      </div>
      {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
