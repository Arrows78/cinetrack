import {
  tvTimeImportCommands,
  type ImportableEpisode,
  type ImportableMovie,
} from "@/features/tvtime/tvtime-import-commands";
import { invokeTypedCommand } from "@/shared/lib/invoke";
import type { Series } from "@/types/media";

export type { ImportableEpisode, ImportableMovie } from "@/features/tvtime/tvtime-import-commands";

// The batch upsert/rollup logic (reusing the same Rust code as the
// interactive progress toggles) now lives in Rust (see
// src-tauri/src/integrations/tvtime/) — this repository is a thin invoke()
// wrapper. Active-profile resolution moved there too, so callers no longer
// pass a profile explicitly.
export const tvTimeImportRepository = {
  // Returns the ids of the episodes this call actually inserted —
  // already-watched ones are silently excluded (idempotent re-import), so
  // callers can tell "newly imported" from "already tracked" instead of
  // only getting a count back.
  async importSeriesProgress(series: Series, episodes: ImportableEpisode[]): Promise<number[]> {
    return invokeTypedCommand(tvTimeImportCommands.importSeriesProgress, { series, episodes });
  },

  async importMovieSeen(movie: ImportableMovie): Promise<boolean> {
    return invokeTypedCommand(tvTimeImportCommands.importMovieSeen, { movie });
  },
};
