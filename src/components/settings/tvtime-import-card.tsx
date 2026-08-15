import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Tv, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { toast } from "@/components/ui/use-toast";
import {
  importTvTimeExport,
  MAX_TVTIME_FILE_BYTES,
  MAX_TVTIME_FILES,
  MAX_TVTIME_TOTAL_BYTES,
  type TvTimeImportProgress,
} from "@/features/tvtime/tvtime-import-service";

export function TvTimeImportCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<TvTimeImportProgress | null>(null);

  const running = progress !== null;

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList?.length || running) return;

    const files = [...fileList];
    if (files.length > MAX_TVTIME_FILES) {
      toast({ description: t("tvtimeImport.tooManyFiles", { max: MAX_TVTIME_FILES }), variant: "error" });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const oversized = files.find((file) => file.size > MAX_TVTIME_FILE_BYTES);
    if (oversized) {
      toast({ description: t("tvtimeImport.fileTooLarge", { name: oversized.name }), variant: "error" });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_TVTIME_TOTAL_BYTES) {
      toast({
        description: t("tvtimeImport.totalTooLarge", { max: Math.round(MAX_TVTIME_TOTAL_BYTES / (1024 * 1024)) }),
        variant: "error",
      });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setProgress({ phase: "series", done: 0, total: 0, label: "" });

    try {
      const contents = await Promise.all(files.map((file) => file.text()));
      const result = await importTvTimeExport(contents, setProgress);
      await queryClient.invalidateQueries({ queryKey: ["local"] });
      toast({
        description: (
          <div>
            <p className="font-medium">
              {t("tvtimeImport.done", {
                episodes: result.episodesImported,
                series: result.seriesImported,
                movies: result.moviesImported,
                planned: result.plannedImported,
              })}
            </p>
            {result.unmatched.length ? (
              <details className="mt-2 text-xs opacity-90">
                <summary className="cursor-pointer">
                  {t("tvtimeImport.unmatched", { count: result.unmatched.length })}
                </summary>
                <p className="mt-1 break-words">{result.unmatched.join(" · ")}</p>
              </details>
            ) : null}
          </div>
        ),
        variant: "success",
      });
    } catch (importError) {
      toast({
        description: importError instanceof Error ? importError.message : t("tvtimeImport.failed"),
        variant: "error",
      });
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Panel>
      <div className="flex items-center gap-2">
        <Tv className="size-5 text-primary" />
        <p className="font-semibold">{t("tvtimeImport.title")}</p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t("tvtimeImport.description")}</p>
      <p className="mt-2 text-xs text-muted-foreground">{t("tvtimeImport.hint")}</p>
      <p className="mt-2 text-xs text-muted-foreground">{t("tvtimeImport.rewatchNotice")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          isLoading={running}
          aria-busy={running}
          onClick={() => inputRef.current?.click()}
        >
          {!running && <Upload className="size-4" />}
          {t("tvtimeImport.selectFiles")}
        </Button>
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept=".csv,text/csv"
          multiple
          onChange={(event) => void handleFiles(event.target.files)}
        />
        {progress && progress.total > 0 ? (
          <p role="status" aria-live="polite" className="text-sm tabular-nums text-muted-foreground">
            {t(`tvtimeImport.phase.${progress.phase}`)} · {progress.done}/{progress.total}
            {progress.label ? ` · ${progress.label}` : ""}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
