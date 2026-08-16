import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Tv, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/use-toast";
import { logger } from "@/features/diagnostics/logger";
import { parseTvTimeFiles, type TvTimeExport, type TvTimeFile } from "@/features/tvtime/parse-export";
import {
  applyTvTimeImport,
  MAX_TVTIME_FILE_BYTES,
  MAX_TVTIME_FILES,
  MAX_TVTIME_TOTAL_BYTES,
  type TvTimeImportProgress,
} from "@/features/tvtime/tvtime-import-service";
import { extractCsvEntries, ZipTooLargeError } from "@/features/tvtime/zip";

interface PendingImport {
  data: TvTimeExport;
  unrecognizedFiles: string[];
}

const isZipFile = (file: File): boolean => file.name.toLowerCase().endsWith(".zip");

// See preflightDescription below for why this is capped.
const MAX_LISTED_UNRECOGNIZED_FILES = 4;

export function TvTimeImportCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [progress, setProgress] = useState<TvTimeImportProgress | null>(null);

  const running = progress !== null;

  const expandFiles = async (files: File[]): Promise<TvTimeFile[]> => {
    const expanded: TvTimeFile[] = [];
    for (const file of files) {
      if (isZipFile(file)) {
        expanded.push(...(await extractCsvEntries(file)));
      } else {
        expanded.push({ name: file.name, text: await file.text() });
      }
    }
    return expanded;
  };

  const prepareImport = async (fileList: FileList | null) => {
    if (!fileList?.length || running || isPreparing) return;

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

    setIsPreparing(true);
    try {
      const expanded = await expandFiles(files);
      const { data, unrecognizedFiles } = parseTvTimeFiles(expanded);
      const foundNothing = !data.episodes.length && !data.movies.length && !data.watchlist.length;
      if (foundNothing) {
        toast({ description: t("tvtimeImport.nothingFound"), variant: "error" });
        return;
      }
      setPending({ data, unrecognizedFiles });
    } catch (error) {
      if (error instanceof ZipTooLargeError) {
        toast({ description: t("tvtimeImport.zipTooLarge", { name: error.entryName }), variant: "error" });
      } else {
        logger.warn(`TV Time zip extraction failed: ${error instanceof Error ? error.message : String(error)}`);
        toast({ description: t("tvtimeImport.zipReadFailed"), variant: "error" });
      }
    } finally {
      setIsPreparing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const confirmImport = async () => {
    if (!pending) return;
    const { data } = pending;
    setPending(null);
    setProgress({ phase: "series", done: 0, total: 0, label: "" });

    try {
      const result = await applyTvTimeImport(data, setProgress);
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
            {result.ambiguous.length ? (
              <p className="mt-1 text-xs opacity-90">
                {t("tvtimeImport.ambiguous", { count: result.ambiguous.length })}
              </p>
            ) : null}
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
      logger.warn(`TV Time import failed: ${importError instanceof Error ? importError.message : String(importError)}`);
      toast({ description: t("tvtimeImport.failed"), variant: "error" });
    } finally {
      setProgress(null);
    }
  };

  const preflightDescription = (() => {
    if (!pending) return "";
    const { data, unrecognizedFiles } = pending;
    const seriesCount = new Set(data.episodes.map((episode) => episode.seriesName)).size;
    const parts = [
      t("tvtimeImport.preflight.counts", {
        episodes: data.episodes.length,
        series: seriesCount,
        movies: data.movies.length,
        planned: data.watchlist.length,
      }),
    ];
    if (unrecognizedFiles.length) {
      // A full GDPR export routinely has 15-20+ files this feature has no
      // use for (account settings, quiz answers, friends, ...) — naming
      // every single one turned this into an unreadable wall of text.
      // Showing a handful of examples is enough to reassure a curious user
      // without doing that again.
      const shown = unrecognizedFiles.slice(0, MAX_LISTED_UNRECOGNIZED_FILES);
      const extra = unrecognizedFiles.length - shown.length;
      const names =
        extra > 0 ? t("tvtimeImport.preflight.namesTruncated", { names: shown.join(", "), extra }) : shown.join(", ");
      parts.push(t("tvtimeImport.preflight.unrecognized", { count: unrecognizedFiles.length, names }));
    }
    const skippedRows = data.skippedRows.episodes + data.skippedRows.movies;
    if (skippedRows > 0) {
      parts.push(t("tvtimeImport.preflight.skippedRows", { count: skippedRows }));
    }
    return parts.join(" ");
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tv className="size-5 text-primary" aria-hidden="true" />
          {t("tvtimeImport.title")}
        </CardTitle>
        <CardDescription>{t("tvtimeImport.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{t("tvtimeImport.hint")}</p>
        <p className="mt-2 text-xs text-muted-foreground">{t("tvtimeImport.rewatchNotice")}</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            isLoading={running || isPreparing}
            aria-busy={running || isPreparing}
            onClick={() => inputRef.current?.click()}
          >
            {!running && !isPreparing && <Upload className="size-4" />}
            {t("tvtimeImport.selectFiles")}
          </Button>
          <input
            ref={inputRef}
            className="hidden"
            type="file"
            accept=".csv,.zip,text/csv,application/zip"
            multiple
            onChange={(event) => void prepareImport(event.target.files)}
          />
          {progress && progress.total > 0 ? (
            <p role="status" aria-live="polite" className="text-sm tabular-nums text-muted-foreground">
              {t(`tvtimeImport.phase.${progress.phase}`)} · {progress.done}/{progress.total}
              {progress.label ? ` · ${progress.label}` : ""}
            </p>
          ) : null}
        </div>
      </CardContent>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={t("tvtimeImport.preflight.title")}
        description={preflightDescription}
        confirmLabel={t("tvtimeImport.preflight.confirm")}
        cancelLabel={t("common.cancel")}
        confirmVariant="default"
        onConfirm={() => void confirmImport()}
      />
    </Card>
  );
}
