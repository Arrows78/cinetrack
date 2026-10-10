import type { QueryClient } from "@tanstack/react-query";
import i18n from "@/i18n";
import { TmdbRequestError, mediaRepository } from "@/features/media/media-repository";
import { libraryRepository } from "@/features/library/library-repository";
import { progressRepository } from "@/features/progress/progress-repository";
import { mapWithConcurrency } from "@/shared/utils/concurrency";
import { logger } from "@/shared/lib/logger";
import { errorMessage } from "@/shared/lib/errors";
import { normalizeTitle } from "@/shared/utils/text";
import type { Episode, MediaSummary, Series } from "@/types/media";
import {
  emptyExport,
  normalizeExport,
  parseTvTimeFile,
  parseTvTimeFiles,
  type ParsedTvTimeFiles,
  type TvTimeEpisode,
  type TvTimeExport,
  type TvTimeFile,
  type TvTimeMovie,
  type TvTimeWatchlistEntry,
} from "./parse-export";
import {
  tvTimeImportRepository,
  type CreatedLibraryItem,
  type ImportableEpisode,
  type MovieImportOutcome,
} from "./tvtime-import-repository";

const RATE_LIMIT_MAX_ATTEMPTS = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1000;
// How long a onProgress payload keeps reporting `throttled: true` after the
// last observed 429 — long enough to stay visible across the gap between two
// progress ticks, short enough to clear once TMDB is actually keeping up
// again.
const THROTTLE_DISPLAY_WINDOW_MS = 4000;

const isRateLimitError = (error: unknown): boolean => error instanceof TmdbRequestError && error.status === 429;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Set for the duration of one applyTvTimeImport() call (see below) so
// withRateLimitRetry — called from several nested helpers (searchWithFallback,
// resolveSeries, attachEpisodesToSeries) with no onProgress of their own —
// can still report a 429 back up to the UI without every one of those
// helpers threading a callback through. Only one import runs at a time in
// practice, same assumption CONCURRENCY's own module-level constant makes.
let onThrottled: (() => void) | null = null;

// TMDB rate-limits (429) under sustained load, and a bulk TV Time import can
// fire hundreds of lookups through mapWithConcurrency. Without this, a 429
// burst gets recorded as "title could not be matched" for every lookup
// still in flight — indistinguishable from a title that genuinely doesn't
// exist on TMDB. Retries only 429 specifically: a real 404/network error
// still fails immediately and counts as unmatched, same as before.
async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (!isRateLimitError(error) || attempt >= RATE_LIMIT_MAX_ATTEMPTS) throw error;
      onThrottled?.();
      await delay(RATE_LIMIT_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
}

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

const emptyUndo = emptyTvTimeImportUndo;

/** A library entry this run created, stamped now: call it once the run is done writing to that title. */
function createdItem(id: string): CreatedLibraryItem {
  return { id, importedAt: new Date().toISOString() };
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

const CONCURRENCY = 3;

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

// "Bodyguard (2018)" → { title: "Bodyguard", year: 2018 }
const splitTitleYear = (name: string): { title: string; year: number | null } => {
  const match = /^(.*)\s+\((\d{4})\)$/.exec(name.trim());
  if (!match) return { title: name.trim(), year: null };
  return { title: match[1]!.trim(), year: Number(match[2]) };
};

const retryableSeriesFrom = (
  seriesName: string,
  episodes: TvTimeEpisode[],
  libraryPatch: TvTimeLibraryPatch | null
): RetryableSeries => {
  const { title, year } = splitTitleYear(seriesName);
  return { kind: "series", label: seriesName, searchTitle: title, searchYear: year, episodes, libraryPatch };
};
const retryableMovieFrom = (movie: TvTimeMovie, initialCandidates: MediaSummary[] = []): RetryableMovie => ({
  kind: "movie",
  label: movie.title,
  searchTitle: movie.title,
  searchYear: movie.year,
  movie,
  initialCandidates,
});
const retryableWatchlistFrom = (
  entry: TvTimeWatchlistEntry,
  initialCandidates: MediaSummary[] = []
): RetryableWatchlistEntry => ({
  kind: "watchlist",
  label: entry.title,
  searchTitle: entry.title,
  searchYear: entry.year,
  entry,
  initialCandidates,
});

// "Show Name: Subtitle" → "Show Name" — retried only when the exact title
// returns zero TMDB results, never as the first attempt, so a title that
// already matches fine is never weakened into a broader, riskier query.
const simplifyTitle = (value: string): string | null => {
  const match = /^(.+?)\s*[:\-–—]\s+.+$/.exec(value.trim());
  const simplified = match?.[1]?.trim();
  return simplified && simplified !== value.trim() ? simplified : null;
};

interface MatchResult {
  match: MediaSummary | null;
  /** True when the pick came from several same-titled results with no year to confirm it. */
  ambiguous: boolean;
}

const NO_MATCH: MatchResult = { match: null, ambiguous: false };

// Only ever returns a result whose title actually matches — never the
// first search hit just because nothing better was found. Falling back to
// an unrelated top result would silently attach the wrong movie/series to
// the imported history instead of surfacing it as unmatched for review.
//
// A single title-matching candidate is auto-accepted even without a year to
// confirm it (there's nothing to be ambiguous *between*). Several
// same-titled candidates with no year in the export to pick among them
// (e.g. a remake, a regional franchise reuse of the same title) used to
// fall back to `titled[0]` — TMDB's own popularity-sorted order, not an
// actual match confidence signal — and get auto-imported anyway, flagged
// `ambiguous` only for a post-import summary line nobody had to act on.
// That's exactly the "confident-looking but not actually confirmed" import
// this function's own contract says not to produce. Returning `match: null`
// here instead routes it through the same unmatched/retryable path a
// title TMDB has nothing for already goes through — no new UI needed, see
// tvtime-unmatched-resolver.tsx.
const pickBestMatch = (results: MediaSummary[], title: string, year: number | null): MatchResult => {
  if (!results.length) return NO_MATCH;
  const normalized = normalizeTitle(title);
  const titled = results.filter((result) => normalizeTitle(result.title) === normalized);
  if (!titled.length) return NO_MATCH;
  if (year !== null) {
    const exact = titled.find((result) => result.year === year);
    if (exact) return { match: exact, ambiguous: false };
  }
  if (titled.length > 1) return { match: null, ambiguous: true };
  return { match: titled[0]!, ambiguous: false };
};

// Runs the exact-title search, and — only if that comes back empty — one
// retry against a simplified title (see simplifyTitle). Centralizes that
// fallback so series/movie/watchlist matching all get it identically.
async function searchWithFallback(
  title: string,
  scope: "movie" | "series"
): Promise<{ results: MediaSummary[]; queriedTitle: string }> {
  const page = await withRateLimitRetry(() => mediaRepository.search(title, scope));
  if (page.results.length > 0) return { results: page.results, queriedTitle: title };

  const simplified = simplifyTitle(title);
  if (!simplified) return { results: [], queriedTitle: title };
  const retried = await withRateLimitRetry(() => mediaRepository.search(simplified, scope));
  return { results: retried.results, queriedTitle: simplified };
}

interface MatchSeriesResult {
  series: Series | null;
  ambiguous: boolean;
}

async function resolveSeries(name: string, tvdbIdsByName: Map<string, number>): Promise<MatchSeriesResult> {
  const tvdbId = tvdbIdsByName.get(name.toLowerCase());
  if (tvdbId !== undefined) {
    try {
      const found = await withRateLimitRetry(() => mediaRepository.findSeriesByTvdbId(tvdbId));
      if (found) return { series: found, ambiguous: false };
    } catch (error) {
      logger.warn(`TV Time import: TVDB lookup failed for "${name}": ${errorMessage(error)}`);
      // Fall through to name search.
    }
  }
  const { title, year } = splitTitleYear(name);
  const { results, queriedTitle } = await searchWithFallback(title, "series");
  const { match, ambiguous } = pickBestMatch(results, queriedTitle, year);
  if (!match) return { series: null, ambiguous };
  return { series: await withRateLimitRetry(() => mediaRepository.getSeriesDetails(match.id)), ambiguous };
}

// Season lookups + the actual write, given an already-resolved series —
// shared by the automatic pass below and resolveRetryableSeries (the manual
// panel's entry point once the user has picked a series themselves).
async function attachEpisodesToSeries(
  series: Series,
  episodes: TvTimeEpisode[]
): Promise<{
  insertedEpisodes: ImportableEpisode[];
  attemptedCount: number;
  unresolvedCount: number;
  createdLibraryItemId: string | null;
}> {
  const seasonNumbers = [...new Set(episodes.map((episode) => episode.seasonNumber))];
  const episodeIdByCode = new Map<string, { id: number; runtime: number | null }>();
  for (const seasonNumber of seasonNumbers) {
    try {
      const season = await withRateLimitRetry(() => mediaRepository.getSeasonDetails(series.id, seasonNumber));
      for (const episode of season.episodes) {
        episodeIdByCode.set(`${episode.seasonNumber}|${episode.episodeNumber}`, {
          id: episode.id,
          runtime: episode.runtime ?? null,
        });
      }
    } catch (error) {
      // Season unavailable on TMDB (or the lookup failed) — its episodes are
      // reported unresolved below.
      logger.warn(`TV Time import: season ${seasonNumber} of "${series.title}" unavailable: ${errorMessage(error)}`);
    }
  }

  const importable: ImportableEpisode[] = [];
  let unresolvedCount = 0;
  for (const episode of episodes) {
    const resolvedEpisode = episodeIdByCode.get(`${episode.seasonNumber}|${episode.episodeNumber}`);
    if (!resolvedEpisode) {
      unresolvedCount += 1;
      continue;
    }
    importable.push({
      episodeId: resolvedEpisode.id,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      watchedAt: episode.watchedAt,
      runtimeMinutes: episode.runtimeMinutes ?? resolvedEpisode.runtime,
    });
  }

  const outcome = await tvTimeImportRepository.importSeriesProgress(series, importable);
  const insertedIds = new Set(outcome.insertedEpisodeIds);
  const insertedEpisodes = importable.filter((episode) => insertedIds.has(episode.episodeId));
  return {
    insertedEpisodes,
    attemptedCount: importable.length,
    unresolvedCount,
    createdLibraryItemId: outcome.createdLibraryItemId,
  };
}

// Favourite/rating apply to the show itself, independent of whether any of
// its specific episodes ended up matched on TMDB (e.g. a season TMDB has no
// data for) — so this only needs `seriesName` to have resolved to a real
// TMDB series at all, not a successful episode count. `undefined` fields are
// omitted rather than sent as `false`/absent so a series with only a rating
// (no favourite) never has its favourite flag reset by this patch — see
// upsert_impl's per-field fallback-to-current semantics in
// src-tauri/src/library/repository.rs.
function libraryPatchFromTvTimeSignals(seriesName: string, data: TvTimeExport): TvTimeLibraryPatch | null {
  const key = seriesName.toLowerCase();
  const favourite = data.favouriteSeriesNames.has(key);
  const userRating = data.seriesRatingsByName.get(key);
  if (!favourite && userRating === undefined) return null;
  return {
    ...(favourite ? { favourite: true } : {}),
    ...(userRating !== undefined ? { userRating } : {}),
  };
}

// Best-effort, after the episode import: a failure here shouldn't undo
// progress that already succeeded. Never overwrites a rating already set in
// CineTrack (a re-import must not put an older TV Time rating back over a
// newer one) — the favourite flag only ever turns on. Resolves to the id of
// the library entry this save created when the series was not in the library
// yet (a favourite/rating alone brings it in), null otherwise.
async function applyLibraryPatch(series: Series, patch: TvTimeLibraryPatch | null): Promise<string | null> {
  if (!patch) return null;
  try {
    const existing = await libraryRepository.get(series.id, "series");
    const { userRating, ...rest } = patch;
    const effective: TvTimeLibraryPatch = {
      ...rest,
      ...(userRating !== undefined && existing?.userRating == null ? { userRating } : {}),
    };
    if (Object.keys(effective).length === 0) return null;
    const saved = await libraryRepository.save(series, effective);
    return existing === null ? saved.id : null;
  } catch (error) {
    logger.warn(`TV Time import: could not save library signals for "${series.title}": ${errorMessage(error)}`);
    return null;
  }
}

async function importOneSeries(
  seriesName: string,
  episodes: TvTimeEpisode[],
  data: TvTimeExport,
  summary: TvTimeImportSummary
): Promise<void> {
  const resolved = await resolveSeries(seriesName, data.tvdbIdsByName);
  if (resolved.ambiguous) summary.ambiguous.push(seriesName);
  const libraryPatch = libraryPatchFromTvTimeSignals(seriesName, data);
  if (!resolved.series) {
    summary.unmatched.push(seriesName);
    summary.retryable.push(retryableSeriesFrom(seriesName, episodes, libraryPatch));
    return;
  }

  const { insertedEpisodes, attemptedCount, unresolvedCount, createdLibraryItemId } = await attachEpisodesToSeries(
    resolved.series,
    episodes
  );
  if (unresolvedCount > 0) {
    summary.unmatched.push(
      `${seriesName} (${i18n.t("tvtimeImport.unresolvedEpisodeCount", { count: unresolvedCount })})`
    );
  }
  summary.episodesAlreadyWatched += attemptedCount - insertedEpisodes.length;
  if (insertedEpisodes.length > 0) {
    summary.seriesImported += 1;
    summary.episodesImported += insertedEpisodes.length;
    summary.undo.series.push({
      series: resolved.series,
      episodes: insertedEpisodes.map((episode) => ({
        id: episode.episodeId,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
      })),
    });
  }

  const patchCreatedId = await applyLibraryPatch(resolved.series, libraryPatch);
  // Stamped after every write to this title, the favourite/rating save included.
  const createdId = createdLibraryItemId ?? patchCreatedId;
  if (createdId) summary.undo.createdLibraryItems.push(createdItem(createdId));
}

/** Manual-panel entry point: attaches a user-picked series to a retryable item's episodes. `undo` is `null` when this call wrote nothing that undo would need to revert (every episode was already tracked and no library entry was created). */
export async function resolveRetryableSeries(
  item: RetryableSeries,
  series: Series
): Promise<{ episodesImported: number; undo: TvTimeImportUndo | null }> {
  const { insertedEpisodes, createdLibraryItemId } = await attachEpisodesToSeries(series, item.episodes);
  const patchCreatedId = await applyLibraryPatch(series, item.libraryPatch);
  const undo = emptyUndo();
  if (insertedEpisodes.length) {
    undo.series.push({
      series,
      episodes: insertedEpisodes.map((episode) => ({
        id: episode.episodeId,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
      })),
    });
  }
  const createdId = createdLibraryItemId ?? patchCreatedId;
  if (createdId) undo.createdLibraryItems.push(createdItem(createdId));
  return { episodesImported: insertedEpisodes.length, undo: hasTvTimeImportUndo(undo) ? undo : null };
}

async function importMatchedMovie(movie: TvTimeMovie, match: MediaSummary): Promise<MovieImportOutcome> {
  return tvTimeImportRepository.importMovieSeen({
    movieId: match.id,
    title: match.title,
    posterPath: match.posterPath,
    backdropPath: match.backdropPath,
    runtime: movie.runtimeMinutes ?? match.runtime ?? null,
    watchedAt: movie.watchedAt,
    year: match.year,
    rating: match.rating,
    genres: match.genres,
  });
}

/** What undo needs to revert after a movie write; null when it wrote nothing (already seen). */
function undoForMovie(match: MediaSummary, outcome: MovieImportOutcome): TvTimeImportUndo | null {
  if (!outcome.inserted) return null;
  const undo = emptyUndo();
  undo.movies.push(match);
  if (outcome.createdLibraryItemId) undo.createdLibraryItems.push(createdItem(outcome.createdLibraryItemId));
  return undo;
}

/** Adds the title as "planned" unless it is in the library already; resolves to the entry it created, null when it existed. */
async function addPlannedIfAbsent(match: MediaSummary): Promise<CreatedLibraryItem | null> {
  const added = await libraryRepository.addIfAbsent(match);
  if (!added) return null;
  const item = await libraryRepository.get(match.id, match.mediaType);
  return item ? createdItem(item.id) : null;
}

/** Manual-panel entry point: writes a retryable movie item once the user has picked its TMDB match. Resolves to what undo needs to revert, null when the movie was already seen and nothing was written. */
export async function resolveRetryableMovie(
  item: RetryableMovie,
  match: MediaSummary
): Promise<TvTimeImportUndo | null> {
  return undoForMovie(match, await importMatchedMovie(item.movie, match));
}

/** Manual-panel entry point: adds a retryable watchlist item to the library once matched. Resolves to what undo needs to revert, null when the title was already in the library in some status. */
export async function resolveRetryableWatchlist(
  _item: RetryableWatchlistEntry,
  match: MediaSummary
): Promise<TvTimeImportUndo | null> {
  const created = await addPlannedIfAbsent(match);
  return created ? { ...emptyUndo(), createdLibraryItems: [created] } : null;
}

/**
 * Runs TMDB matching and writes the already-parsed export (see
 * parseTvTimeFiles) — the network-bound, potentially-slow half of an
 * import. Split from parsing so the UI can show a fast, local pre-import
 * summary (counts, unrecognized files) and let the user confirm before any
 * of this runs.
 */
export async function applyTvTimeImport(
  data: TvTimeExport,
  onProgress?: (progress: TvTimeImportProgress) => void
): Promise<TvTimeImportSummary> {
  const summary: TvTimeImportSummary = {
    seriesImported: 0,
    episodesImported: 0,
    moviesImported: 0,
    plannedImported: 0,
    moviesAlreadyInLibrary: 0,
    episodesAlreadyWatched: 0,
    plannedAlreadyInLibrary: 0,
    unmatched: [],
    ambiguous: [],
    retryable: [],
    undo: emptyUndo(),
  };

  let lastThrottledAt = 0;
  onThrottled = () => {
    lastThrottledAt = Date.now();
  };
  const reportProgress = (progress: Omit<TvTimeImportProgress, "throttled">) => {
    onProgress?.({ ...progress, throttled: Date.now() - lastThrottledAt < THROTTLE_DISPLAY_WINDOW_MS });
  };

  const episodesBySeries = new Map<string, TvTimeEpisode[]>();
  for (const episode of data.episodes) {
    const list = episodesBySeries.get(episode.seriesName) ?? [];
    list.push(episode);
    episodesBySeries.set(episode.seriesName, list);
  }

  const seriesEntries = [...episodesBySeries.entries()];

  // The three phases touch disjoint parts of `summary` (series/movies/
  // watchlist each own their own counters and undo bucket) and only ever
  // share append-only arrays (unmatched/ambiguous/retryable) — safe to run
  // concurrently rather than one full phase after another, which used to
  // make a large export take several minutes end to end for no reason other
  // than the code happening to await them in sequence.
  try {
    await Promise.all([
      (async () => {
        let seriesDone = 0;
        await mapWithConcurrency(
          seriesEntries,
          async ([seriesName, episodes]) => {
            reportProgress({ phase: "series", done: seriesDone, total: seriesEntries.length, label: seriesName });
            try {
              await importOneSeries(seriesName, episodes, data, summary);
            } catch (error) {
              logger.warn(`TV Time import: series "${seriesName}" failed: ${errorMessage(error)}`);
              summary.unmatched.push(seriesName);
              summary.retryable.push(
                retryableSeriesFrom(seriesName, episodes, libraryPatchFromTvTimeSignals(seriesName, data))
              );
            }
            seriesDone += 1;
            reportProgress({ phase: "series", done: seriesDone, total: seriesEntries.length, label: seriesName });
          },
          CONCURRENCY
        );
      })(),
      (async () => {
        let moviesDone = 0;
        await mapWithConcurrency(
          data.movies,
          async (movie) => {
            reportProgress({ phase: "movies", done: moviesDone, total: data.movies.length, label: movie.title });
            try {
              const { results, queriedTitle } = await searchWithFallback(movie.title, "movie");
              const { match, ambiguous } = pickBestMatch(results, queriedTitle, movie.year);
              if (ambiguous) summary.ambiguous.push(movie.title);
              if (!match) {
                summary.unmatched.push(movie.title);
                summary.retryable.push(retryableMovieFrom(movie, results));
              } else {
                const undo = undoForMovie(match, await importMatchedMovie(movie, match));
                if (undo) {
                  summary.moviesImported += 1;
                  summary.undo.movies.push(...undo.movies);
                  summary.undo.createdLibraryItems.push(...undo.createdLibraryItems);
                } else {
                  summary.moviesAlreadyInLibrary += 1;
                }
              }
            } catch (error) {
              logger.warn(`TV Time import: movie "${movie.title}" failed: ${errorMessage(error)}`);
              summary.unmatched.push(movie.title);
              summary.retryable.push(retryableMovieFrom(movie));
            }
            moviesDone += 1;
            reportProgress({ phase: "movies", done: moviesDone, total: data.movies.length, label: movie.title });
          },
          CONCURRENCY
        );
      })(),
      (async () => {
        let watchlistDone = 0;
        await mapWithConcurrency(
          data.watchlist,
          async (entry) => {
            reportProgress({
              phase: "watchlist",
              done: watchlistDone,
              total: data.watchlist.length,
              label: entry.title,
            });
            try {
              const { results, queriedTitle } = await searchWithFallback(
                entry.title,
                entry.mediaType === "movie" ? "movie" : "series"
              );
              const { match, ambiguous } = pickBestMatch(results, queriedTitle, entry.year);
              if (ambiguous) summary.ambiguous.push(entry.title);
              if (!match) {
                summary.unmatched.push(entry.title);
                summary.retryable.push(retryableWatchlistFrom(entry, results));
              } else {
                // Never overwrites a title already there: the series pass
                // above may just have marked it watching or completed.
                const created = await addPlannedIfAbsent(match);
                if (!created) {
                  summary.plannedAlreadyInLibrary += 1;
                } else {
                  summary.plannedImported += 1;
                  summary.undo.createdLibraryItems.push(created);
                }
              }
            } catch (error) {
              logger.warn(`TV Time import: watchlist entry "${entry.title}" failed: ${errorMessage(error)}`);
              summary.unmatched.push(entry.title);
              summary.retryable.push(retryableWatchlistFrom(entry));
            }
            watchlistDone += 1;
            reportProgress({
              phase: "watchlist",
              done: watchlistDone,
              total: data.watchlist.length,
              label: entry.title,
            });
          },
          CONCURRENCY
        );
      })(),
    ]);
  } finally {
    onThrottled = null;
  }

  return summary;
}

export { parseTvTimeFiles };
export type { ParsedTvTimeFiles, TvTimeFile };

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
    CONCURRENCY
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
    CONCURRENCY
  );
  return { keptLibraryItems: libraryOutcome.kept };
}

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
