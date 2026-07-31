import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Tv, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  importTvTimeExport,
  type TvTimeImportProgress,
  type TvTimeImportSummary,
} from "@/features/tvtime/tvtime-import-service";

export function TvTimeImportCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<TvTimeImportProgress | null>(null);
  const [summary, setSummary] = useState<TvTimeImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const running = progress !== null;

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList?.length || running) return;
    setSummary(null);
    setError(null);
    setProgress({ phase: "series", done: 0, total: 0, label: "" });

    try {
      const contents = await Promise.all([...fileList].map((file) => file.text()));
      const result = await importTvTimeExport(contents, setProgress);
      setSummary(result);
      await queryClient.invalidateQueries({ queryKey: ["local"] });
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : t("tvtimeImport.failed"));
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-3xl border border-border bg-card/60 p-5">
      <div className="flex items-center gap-2">
        <Tv className="size-5 text-primary" />
        <p className="font-semibold">{t("tvtimeImport.title")}</p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t("tvtimeImport.description")}</p>
      <p className="mt-2 text-xs text-muted-foreground">{t("tvtimeImport.hint")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={running} onClick={() => inputRef.current?.click()}>
          {running ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
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
          <p className="text-sm tabular-nums text-muted-foreground">
            {t(`tvtimeImport.phase.${progress.phase}`)} · {progress.done}/{progress.total}
            {progress.label ? ` · ${progress.label}` : ""}
          </p>
        ) : null}
      </div>

      {summary ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
          <p className="font-medium">
            {t("tvtimeImport.done", {
              episodes: summary.episodesImported,
              series: summary.seriesImported,
              movies: summary.moviesImported,
              watchlist: summary.watchlistImported,
            })}
          </p>
          {summary.unmatched.length ? (
            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                {t("tvtimeImport.unmatched", { count: summary.unmatched.length })}
              </summary>
              <p className="mt-1 break-words">{summary.unmatched.join(" · ")}</p>
            </details>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
