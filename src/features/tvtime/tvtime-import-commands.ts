import { defineCommand } from "@/shared/lib/invoke";
import type { Series } from "@/types/media";

export interface ImportableEpisode {
  episodeId: number;
  seasonNumber: number;
  episodeNumber: number;
  watchedAt: string;
  runtimeMinutes: number | null;
}

export interface ImportableMovie {
  movieId: number;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  runtime?: number | null;
  watchedAt: string;
  year?: number | null;
  rating?: number | null;
  genres?: string[];
}

/** Result of `import_series_progress`. */
export interface SeriesImportOutcome {
  /** The episodes this call really inserted — already-watched ones are left out. */
  insertedEpisodeIds: number[];
  /** uuid of the library entry this call created for the series; null when it was already in the library. */
  createdLibraryItemId: string | null;
}

/** Result of `import_movie_seen`. */
export interface MovieImportOutcome {
  /** False when the movie was already seen, which skips the import. */
  inserted: boolean;
  /** uuid of the library entry this call created for the movie; null when it was already in the library. */
  createdLibraryItemId: string | null;
}

/** A library entry an import created, with the moment the import finished writing to it. */
export interface CreatedLibraryItem {
  id: string;
  /** ISO timestamp; an entry whose `updatedAt` is later was edited since, and undo keeps it. */
  importedAt: string;
}

export interface UntouchedRemoval {
  removed: number;
  /** Entries kept because they were edited after the import. */
  kept: number;
}

type ImportSeriesProgressArgs = {
  series: Series;
  episodes: ImportableEpisode[];
};

type ImportMovieSeenArgs = {
  movie: ImportableMovie;
};

type UndoLibraryItemsArgs = {
  items: CreatedLibraryItem[];
};

export const tvTimeImportCommands = {
  importSeriesProgress: defineCommand<ImportSeriesProgressArgs, SeriesImportOutcome>("import_series_progress"),
  importMovieSeen: defineCommand<ImportMovieSeenArgs, MovieImportOutcome>("import_movie_seen"),
  undoLibraryItems: defineCommand<UndoLibraryItemsArgs, UntouchedRemoval>("undo_tvtime_import_library"),
} as const;
