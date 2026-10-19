import type { Series, MediaSummary } from "@/types/media";
import type { TvTimeEpisode, TvTimeMovie, TvTimeWatchlistEntry } from "./parse-export";
import type { CreatedLibraryItem } from "./tvtime-import-repository";

/** How many titles one import phase works on at once. */
export const TVTIME_IMPORT_CONCURRENCY = 3;

export interface TvTimeImportProgress {
  phase: "series" | "movies" | "watchlist";
  done: number;
  total: number;
  label: string;
  /** TMDB rate-limited a request recently — a stall here is expected, not stuck. */
  throttled: boolean;
}

// Carries enough of the original TV Time row(s) to retry a match by hand —
// unlike `unmatched` (display strings only, for the completion toast), this
// is what the manual-resolution panel (tvtime-unmatched-resolver.tsx) reads
// to let the user search TMDB themselves and finish the import for that
// title once they pick a result. Not populated for the separate "series
// matched, but some of its episodes aren't on TMDB" case — re-searching
// can't fix a season that genuinely isn't there.
export interface RetryableSeries {
  kind: "series";
  label: string;
  searchTitle: string;
  searchYear: number | null;
  episodes: TvTimeEpisode[];
  /** The export's favourite/rating for this show — applied once the user picks its TMDB match, like the automatic pass does. */
  libraryPatch: TvTimeLibraryPatch | null;
}
export interface RetryableMovie {
  kind: "movie";
  label: string;
  searchTitle: string;
  searchYear: number | null;
  movie: TvTimeMovie;
  /** TMDB results already in hand from the initial attempt (empty when it threw before ever searching) — shown immediately in the resolver panel, before the user types a new search of their own. */
  initialCandidates: MediaSummary[];
}
export interface RetryableWatchlistEntry {
  kind: "watchlist";
  label: string;
  searchTitle: string;
  searchYear: number | null;
  entry: TvTimeWatchlistEntry;
  /** See RetryableMovie.initialCandidates. */
  initialCandidates: MediaSummary[];
}
export type RetryableUnmatched = RetryableSeries | RetryableMovie | RetryableWatchlistEntry;

export interface TvTimeLibraryPatch {
  favourite?: boolean;
  userRating?: number;
}

/** Minimal per-episode identity — enough to build the `Episode` shape `progressRepository.toggleEpisodesWatched` needs when undoing, without carrying every TMDB detail field around in the undo descriptor. */
export interface TvTimeImportUndoEpisode {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
}

export interface TvTimeImportUndoSeries {
  series: Series;
  /** Only the episodes this import run actually inserted — never one that was already tracked before this run, which undo must leave alone. */
  episodes: TvTimeImportUndoEpisode[];
}

export interface TvTimeImportUndo {
  /** Movies this run newly marked seen — never one that was already seen, which undo must leave alone. */
  movies: MediaSummary[];
  series: TvTimeImportUndoSeries[];
  /**
   * Library entries this run created — by the import itself, by the
   * auto-sync a watched episode/movie triggers, or by a watchlist add —
   * never a title that was in the library before. Each carries when the run
   * finished writing to it: undo keeps one the user edited since.
   */
  createdLibraryItems: CreatedLibraryItem[];
}

/** What undoing an import left in place on purpose. */
export interface TvTimeUndoResult {
  /** Created library entries kept because they were edited after the import. */
  keptLibraryItems: number;
}

export interface TvTimeImportSummary {
  seriesImported: number;
  episodesImported: number;
  moviesImported: number;
  plannedImported: number;
  /** Matched fine, but already seen — the import skipped it rather than duplicating it (see import_movie_seen_impl's idempotency guard). */
  moviesAlreadyInLibrary: number;
  /** Matched fine, but already tracked as watched — same idempotency guard, per episode (see import_series_progress_impl). */
  episodesAlreadyWatched: number;
  /** Matched fine, but already in the library in some status — the watchlist add was skipped, not duplicated. */
  plannedAlreadyInLibrary: number;
  unmatched: string[];
  /**
   * Matched, but only by picking the most likely of several same-titled
   * TMDB results with no year in the export to confirm the pick — worth a
   * second look, unlike a confident single/year-exact match.
   */
  ambiguous: string[];
  /** Structured version of the `unmatched` titles a user can actually retry. */
  retryable: RetryableUnmatched[];
  /**
   * Exactly what this run newly wrote — feeds undoTvTimeImport(). Kept only
   * for the lifetime of this one import call (never persisted), so "undo"
   * is only ever offered for the import that just finished, not a past one
   * from an earlier session. Includes the ids of the library entries it
   * created, whether directly or through auto-sync.
   */
  undo: TvTimeImportUndo;
}
