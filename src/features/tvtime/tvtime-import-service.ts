import type { QueryClient } from "@tanstack/react-query";
import i18n from "@/i18n";
import { TmdbRequestError, mediaRepository } from "@/features/media/media-repository";
import { libraryRepository } from "@/features/library/library-repository";
import { mapWithConcurrency } from "@/shared/utils/concurrency";
import { queryKeys } from "@/shared/constants/query-keys";
import type { MediaSummary, Series } from "@/types/media";
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
import { tvTimeImportRepository, type ImportableEpisode } from "./tvtime-import-repository";

const RATE_LIMIT_MAX_ATTEMPTS = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1000;

const isRateLimitError = (error: unknown): boolean => error instanceof TmdbRequestError && error.status === 429;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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
      await delay(RATE_LIMIT_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
}

export interface TvTimeImportProgress {
  phase: "series" | "movies" | "watchlist";
  done: number;
  total: number;
  label: string;
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
}
export interface RetryableMovie {
  kind: "movie";
  label: string;
  searchTitle: string;
  searchYear: number | null;
  movie: TvTimeMovie;
}
export interface RetryableWatchlistEntry {
  kind: "watchlist";
  label: string;
  searchTitle: string;
  searchYear: number | null;
  entry: TvTimeWatchlistEntry;
}
export type RetryableUnmatched = RetryableSeries | RetryableMovie | RetryableWatchlistEntry;

export interface TvTimeImportSummary {
  seriesImported: number;
  episodesImported: number;
  moviesImported: number;
  plannedImported: number;
  unmatched: string[];
  /**
   * Matched, but only by picking the most likely of several same-titled
   * TMDB results with no year in the export to confirm the pick — worth a
   * second look, unlike a confident single/year-exact match.
   */
  ambiguous: string[];
  /** Structured version of the `unmatched` titles a user can actually retry. */
  retryable: RetryableUnmatched[];
}

const CONCURRENCY = 3;

// A TV Time GDPR export is 4 CSVs at most (see tvtimeImport.hint). These
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

const retryableSeriesFrom = (seriesName: string, episodes: TvTimeEpisode[]): RetryableSeries => {
  const { title, year } = splitTitleYear(seriesName);
  return { kind: "series", label: seriesName, searchTitle: title, searchYear: year, episodes };
};
const retryableMovieFrom = (movie: TvTimeMovie): RetryableMovie => ({
  kind: "movie",
  label: movie.title,
  searchTitle: movie.title,
  searchYear: movie.year,
  movie,
});
const retryableWatchlistFrom = (entry: TvTimeWatchlistEntry): RetryableWatchlistEntry => ({
  kind: "watchlist",
  label: entry.title,
  searchTitle: entry.title,
  searchYear: entry.year,
  entry,
});

// Loosens title comparison past exact-string equality — TV Time and TMDB
// don't always agree on punctuation/diacritics/a leading article for the
// same title ("Marvel's Daredevil" vs "Daredevil", "Cafe" vs "Café") — so a
// search result that's really the same title wasn't being recognized as
// one, and fell through to "unmatched" instead.
const normalizeTitle = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|an?)\s+/, "");

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
    } catch {
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
): Promise<{ episodesImported: number; unresolvedCount: number }> {
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
    } catch {
      // Season unavailable on TMDB — its episodes are reported unresolved below.
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

  const inserted = await tvTimeImportRepository.importSeriesProgress(series, importable);
  return { episodesImported: inserted, unresolvedCount };
}

async function importOneSeries(
  seriesName: string,
  episodes: TvTimeEpisode[],
  data: TvTimeExport,
  summary: TvTimeImportSummary
): Promise<void> {
  const resolved = await resolveSeries(seriesName, data.tvdbIdsByName);
  if (resolved.ambiguous) summary.ambiguous.push(seriesName);
  if (!resolved.series) {
    summary.unmatched.push(seriesName);
    summary.retryable.push(retryableSeriesFrom(seriesName, episodes));
    return;
  }

  const { episodesImported, unresolvedCount } = await attachEpisodesToSeries(resolved.series, episodes);
  if (unresolvedCount > 0) {
    summary.unmatched.push(
      `${seriesName} (${i18n.t("tvtimeImport.unresolvedEpisodeCount", { count: unresolvedCount })})`
    );
  }
  if (episodesImported > 0) {
    summary.seriesImported += 1;
    summary.episodesImported += episodesImported;
  }
}

/** Manual-panel entry point: attaches a user-picked series to a retryable item's episodes. */
export async function resolveRetryableSeries(
  item: RetryableSeries,
  series: Series
): Promise<{ episodesImported: number }> {
  const { episodesImported } = await attachEpisodesToSeries(series, item.episodes);
  return { episodesImported };
}

async function importMatchedMovie(movie: TvTimeMovie, match: MediaSummary): Promise<boolean> {
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

/** Manual-panel entry point: writes a retryable movie item once the user has picked its TMDB match. */
export async function resolveRetryableMovie(item: RetryableMovie, match: MediaSummary): Promise<boolean> {
  return importMatchedMovie(item.movie, match);
}

/** Manual-panel entry point: adds a retryable watchlist item to the library once matched. */
export async function resolveRetryableWatchlist(_item: RetryableWatchlistEntry, match: MediaSummary): Promise<void> {
  await libraryRepository.save(match, { status: "planned" });
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
    unmatched: [],
    ambiguous: [],
    retryable: [],
  };

  const episodesBySeries = new Map<string, TvTimeEpisode[]>();
  for (const episode of data.episodes) {
    const list = episodesBySeries.get(episode.seriesName) ?? [];
    list.push(episode);
    episodesBySeries.set(episode.seriesName, list);
  }

  const seriesEntries = [...episodesBySeries.entries()];
  let seriesDone = 0;
  await mapWithConcurrency(
    seriesEntries,
    async ([seriesName, episodes]) => {
      onProgress?.({ phase: "series", done: seriesDone, total: seriesEntries.length, label: seriesName });
      try {
        await importOneSeries(seriesName, episodes, data, summary);
      } catch {
        summary.unmatched.push(seriesName);
        summary.retryable.push(retryableSeriesFrom(seriesName, episodes));
      }
      seriesDone += 1;
      onProgress?.({ phase: "series", done: seriesDone, total: seriesEntries.length, label: seriesName });
    },
    CONCURRENCY
  );

  let moviesDone = 0;
  await mapWithConcurrency(
    data.movies,
    async (movie) => {
      onProgress?.({ phase: "movies", done: moviesDone, total: data.movies.length, label: movie.title });
      try {
        const { results, queriedTitle } = await searchWithFallback(movie.title, "movie");
        const { match, ambiguous } = pickBestMatch(results, queriedTitle, movie.year);
        if (ambiguous) summary.ambiguous.push(movie.title);
        if (!match) {
          summary.unmatched.push(movie.title);
          summary.retryable.push(retryableMovieFrom(movie));
        } else {
          const inserted = await importMatchedMovie(movie, match);
          if (inserted) summary.moviesImported += 1;
        }
      } catch {
        summary.unmatched.push(movie.title);
        summary.retryable.push(retryableMovieFrom(movie));
      }
      moviesDone += 1;
      onProgress?.({ phase: "movies", done: moviesDone, total: data.movies.length, label: movie.title });
    },
    CONCURRENCY
  );

  let watchlistDone = 0;
  await mapWithConcurrency(
    data.watchlist,
    async (entry) => {
      onProgress?.({ phase: "watchlist", done: watchlistDone, total: data.watchlist.length, label: entry.title });
      try {
        const { results, queriedTitle } = await searchWithFallback(
          entry.title,
          entry.mediaType === "movie" ? "movie" : "series"
        );
        const { match, ambiguous } = pickBestMatch(results, queriedTitle, entry.year);
        if (ambiguous) summary.ambiguous.push(entry.title);
        if (!match) {
          summary.unmatched.push(entry.title);
          summary.retryable.push(retryableWatchlistFrom(entry));
        } else {
          await libraryRepository.save(match, { status: "planned" });
          summary.plannedImported += 1;
        }
      } catch {
        summary.unmatched.push(entry.title);
        summary.retryable.push(retryableWatchlistFrom(entry));
      }
      watchlistDone += 1;
      onProgress?.({ phase: "watchlist", done: watchlistDone, total: data.watchlist.length, label: entry.title });
    },
    CONCURRENCY
  );

  return summary;
}

export { parseTvTimeFiles };
export type { ParsedTvTimeFiles, TvTimeFile };

// A bulk import (or resolving one retryable/unmatched item afterwards) can
// touch history, library, tracked series, stats, tracking/calendar and
// watch-tonight for the active profile — but nothing else, so this stays
// scoped instead of invalidating the entire ["local"] cache namespace
// (which would also evict every OTHER profile's unrelated cached data).
export async function invalidateTvTimeImportQueries(queryClient: QueryClient, profileId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.local.history(profileId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.local.library(profileId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.local.libraryPage(profileId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.local.trackedSeries(profileId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.local.stats(profileId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.local.tracking(profileId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.local.calendar(profileId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.local.watchTonight(profileId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.local.libraryMediaKeys(profileId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.local.completedLibraryCandidates(profileId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.local.bestRecommendationSeed(profileId) }),
  ]);
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
