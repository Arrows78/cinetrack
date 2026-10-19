import type { Episode } from "@/types/media";
import { progressRepository } from "@/features/progress/progress-repository";
import { mapWithConcurrency } from "@/shared/utils/concurrency";
import { tvTimeImportRepository, type CreatedLibraryItem } from "./tvtime-import-repository";
import { TVTIME_IMPORT_CONCURRENCY, type TvTimeImportUndo, type TvTimeUndoResult } from "./tvtime-import-types";

export function emptyTvTimeImportUndo(): TvTimeImportUndo {
  return { movies: [], series: [], createdLibraryItems: [] };
}

export function hasTvTimeImportUndo(undo: TvTimeImportUndo): boolean {
  return undo.movies.length > 0 || undo.series.length > 0 || undo.createdLibraryItems.length > 0;
}

/** Adds `extra` (a manual resolution's writes) to what is already pending, so one undo covers the whole session. */
export function mergeTvTimeImportUndo(current: TvTimeImportUndo | null, extra: TvTimeImportUndo): TvTimeImportUndo {
  return {
    movies: [...(current?.movies ?? []), ...extra.movies],
    series: [...(current?.series ?? []), ...extra.series],
    createdLibraryItems: [...(current?.createdLibraryItems ?? []), ...extra.createdLibraryItems],
  };
}

/** A library entry this run created, stamped now: call it once the run is done writing to that title. */
export function createdItem(id: string): CreatedLibraryItem {
  return { id, importedAt: new Date().toISOString() };
}

/**
 * Reverts exactly what one `applyTvTimeImport` call wrote — nothing else.
 *
 * Library entries first, in one transactional Rust command: it removes the
 * entries the import created (`undo.createdLibraryItems`) that nobody has
 * edited since. A title that was in the library before the import is never
 * in that list, and one edited afterwards (status, rating, favourite, notes,
 * tags, a later watch) is kept and counted in the result so the UI can say
 * so. This runs before the unmarking below so nothing that unmarking writes
 * can make an untouched entry look edited. Safe to run twice: a removed
 * entry no longer matches, and a kept one is kept again.
 *
 * Then the watched marks, with the same commands the interactive UI uses to
 * mark something unwatched (`progressRepository.toggleMovieSeen`/
 * `toggleEpisodesWatched` with `watched: false`), so undoing produces the
 * state of a user unmarking each title by hand — no bespoke rollback logic
 * to keep in sync. Those are idempotent as well.
 */
export async function undoTvTimeImport(undo: TvTimeImportUndo): Promise<TvTimeUndoResult> {
  const libraryOutcome =
    undo.createdLibraryItems.length > 0
      ? await tvTimeImportRepository.undoLibraryItems(undo.createdLibraryItems)
      : { removed: 0, kept: 0 };

  await mapWithConcurrency(
    undo.movies,
    async (movie) => {
      await progressRepository.toggleMovieSeen(movie, false);
    },
    TVTIME_IMPORT_CONCURRENCY
  );
  await mapWithConcurrency(
    undo.series,
    async (item) => {
      const episodes: Episode[] = item.episodes.map((episode) => ({
        id: episode.id,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        title: "",
        overview: "",
      }));
      await progressRepository.toggleEpisodesWatched(item.series, episodes, false);
    },
    TVTIME_IMPORT_CONCURRENCY
  );
  return { keptLibraryItems: libraryOutcome.kept };
}
