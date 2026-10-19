import type { QueryClient } from "@tanstack/react-query";
import { applyTvTimeImport } from "./tvtime-import-apply";
import {
  emptyExport,
  normalizeExport,
  parseTvTimeFile,
  parseTvTimeFiles,
  type ParsedTvTimeFiles,
  type TvTimeFile,
} from "./parse-export";
import type { TvTimeImportProgress, TvTimeImportSummary } from "./tvtime-import-types";

/**
 * TV Time import, in four modules behind this facade:
 * - `tvtime-import-matching.ts` — finding the TMDB title (rate-limit retry, title search, TVDB lookup);
 * - `tvtime-import-apply.ts` — the phases that write (series, movies, then the watchlist) and the manual resolutions;
 * - `tvtime-import-undo.ts` — the undo descriptor helpers and `undoTvTimeImport`;
 * - `tvtime-import-types.ts` — the shapes they share.
 */

// A TV Time GDPR export is 6 CSVs at most (see tvtimeImport.hint). These
// ceilings are well above that — generous enough for legitimate re-exports —
// but still catch an accidental folder-drop or a huge unrelated file before
// any file.text() call, which is where an unbounded selection would freeze
// the UI or spike memory. Applies per selected file, .zip or .csv alike —
// a .zip's own decompressed-content caps live in zip.ts.
export const MAX_TVTIME_FILES = 10;
export const MAX_TVTIME_FILE_BYTES = 50 * 1024 * 1024;
// The per-file cap alone still allows up to 10 × 50MB = 500MB read into
// memory at once (every file's .text() is awaited together, see
// tvtime-import-card.tsx). This bounds the sum instead.
export const MAX_TVTIME_TOTAL_BYTES = 150 * 1024 * 1024;

// A bulk import (or resolving one retryable/unmatched item afterwards) writes
// seen flags, episode progress, history, library and tracked series, so every
// reader keyed under the active profile is stale afterwards — scoped to that
// profile (index 2 of every `["local", <name>, <profileId>, ...]` key) rather
// than the whole ["local"] namespace, which would also evict every OTHER
// profile's unrelated cached data. Profile-less keys (preferences, profile
// list, availability snapshots) are untouched.
export async function invalidateTvTimeImportQueries(queryClient: QueryClient, profileId: string): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === "local" && query.queryKey[2] === profileId,
  });
}

/** Back-compat convenience: parses raw file contents, then applies them. */
export async function importTvTimeExport(
  fileContents: string[],
  onProgress?: (progress: TvTimeImportProgress) => void
): Promise<TvTimeImportSummary> {
  const accumulator = emptyExport();
  for (const content of fileContents) parseTvTimeFile(content, accumulator);
  const data = normalizeExport(accumulator);
  return applyTvTimeImport(data, onProgress);
}

export {
  applyTvTimeImport,
  resolveRetryableMovie,
  resolveRetryableSeries,
  resolveRetryableWatchlist,
} from "./tvtime-import-apply";
export {
  emptyTvTimeImportUndo,
  hasTvTimeImportUndo,
  mergeTvTimeImportUndo,
  undoTvTimeImport,
} from "./tvtime-import-undo";
export { parseTvTimeFiles };
export type { ParsedTvTimeFiles, TvTimeFile };
export type * from "./tvtime-import-types";
