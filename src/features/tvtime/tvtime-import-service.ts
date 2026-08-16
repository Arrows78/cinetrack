import i18n from "@/i18n";
import { TmdbRequestError } from "@/features/media/api/client";
import { mediaRepository } from "@/features/media/media-repository";
import { libraryRepository } from "@/features/library/library-repository";
import { mapWithConcurrency } from "@/shared/utils/concurrency";
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
const pickBestMatch = (results: MediaSummary[], title: string, year: number | null): MatchResult => {
  if (!results.length) return NO_MATCH;
  const normalized = normalizeTitle(title);
  const titled = results.filter((result) => normalizeTitle(result.title) === normalized);
  if (!titled.length) return NO_MATCH;
  if (year !== null) {
    const exact = titled.find((result) => result.year === year);
    if (exact) return { match: exact, ambiguous: false };
  }
  return { match: titled[0]!, ambiguous: titled.length > 1 };
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
  if (!match) return { series: null, ambiguous: false };
  return { series: await withRateLimitRetry(() => mediaRepository.getSeriesDetails(match.id)), ambiguous };
}

async function importOneSeries(
  seriesName: string,
  episodes: TvTimeEpisode[],
  data: TvTimeExport,
  summary: TvTimeImportSummary
): Promise<void> {
  const resolved = await resolveSeries(seriesName, data.tvdbIdsByName);
  if (!resolved.series) {
    summary.unmatched.push(seriesName);
    return;
  }
  if (resolved.ambiguous) summary.ambiguous.push(seriesName);
  const series = resolved.series;

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
      // Season unavailable on TMDB — its episodes are reported unmatched below.
    }
  }

  const importable: ImportableEpisode[] = [];
  let unresolved = 0;
  for (const episode of episodes) {
    const resolvedEpisode = episodeIdByCode.get(`${episode.seasonNumber}|${episode.episodeNumber}`);
    if (!resolvedEpisode) {
      unresolved += 1;
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
  if (unresolved > 0) {
    summary.unmatched.push(`${seriesName} (${i18n.t("tvtimeImport.unresolvedEpisodeCount", { count: unresolved })})`);
  }

  const inserted = await tvTimeImportRepository.importSeriesProgress(series, importable);
  if (inserted > 0) {
    summary.seriesImported += 1;
    summary.episodesImported += inserted;
  }
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
        if (!match) {
          summary.unmatched.push(movie.title);
        } else {
          if (ambiguous) summary.ambiguous.push(movie.title);
          const inserted = await tvTimeImportRepository.importMovieSeen({
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
          if (inserted) summary.moviesImported += 1;
        }
      } catch {
        summary.unmatched.push(movie.title);
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
        if (!match) {
          summary.unmatched.push(entry.title);
        } else {
          if (ambiguous) summary.ambiguous.push(entry.title);
          await libraryRepository.save(match, { status: "planned" });
          summary.plannedImported += 1;
        }
      } catch {
        summary.unmatched.push(entry.title);
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
