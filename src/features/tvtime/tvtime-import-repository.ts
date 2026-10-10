import {
  tvTimeImportCommands,
  type CreatedLibraryItem,
  type ImportableEpisode,
  type ImportableMovie,
  type MovieImportOutcome,
  type SeriesImportOutcome,
  type UntouchedRemoval,
} from "@/features/tvtime/tvtime-import-commands";
import { invokeTypedCommand } from "@/shared/lib/invoke";
import type { Series } from "@/types/media";

export type {
  CreatedLibraryItem,
  ImportableEpisode,
  ImportableMovie,
  MovieImportOutcome,
  SeriesImportOutcome,
  UntouchedRemoval,
} from "@/features/tvtime/tvtime-import-commands";

// The batch upsert/rollup logic (reusing the same Rust code as the
// interactive progress toggles) now lives in Rust (see
// src-tauri/src/integrations/tvtime/) — this repository is a thin invoke()
// wrapper. Active-profile resolution moved there too, so callers no longer
// pass a profile explicitly.
export const tvTimeImportRepository = {
  // Returns the ids of the episodes this call actually inserted —
  // already-watched ones are silently excluded (idempotent re-import), so
  // callers can tell "newly imported" from "already tracked" instead of
  // only getting a count back — and the library entry it created, if any.
  async importSeriesProgress(series: Series, episodes: ImportableEpisode[]): Promise<SeriesImportOutcome> {
    return invokeTypedCommand(tvTimeImportCommands.importSeriesProgress, { series, episodes });
  },

  async importMovieSeen(movie: ImportableMovie): Promise<MovieImportOutcome> {
    return invokeTypedCommand(tvTimeImportCommands.importMovieSeen, { movie });
  },

  // Removes the given library entries — those an import created — that were
  // not edited since, in one transaction on the active profile. Idempotent.
  async undoLibraryItems(items: CreatedLibraryItem[]): Promise<UntouchedRemoval> {
    return invokeTypedCommand(tvTimeImportCommands.undoLibraryItems, { items });
  },
};
