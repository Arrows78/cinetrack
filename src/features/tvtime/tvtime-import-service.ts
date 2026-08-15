import i18n from "@/i18n";
import { TmdbRequestError } from "@/features/media/api/client";
import { mediaRepository } from "@/features/media/media-repository";
import { libraryRepository } from "@/features/library/library-repository";
import { mapWithConcurrency } from "@/shared/utils/concurrency";
import type { MediaSummary, Series } from "@/types/media";
import { emptyExport, normalizeExport, parseTvTimeFile, type TvTimeEpisode, type TvTimeExport } from "./parse-export";
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
}

const CONCURRENCY = 3;

// A TV Time GDPR export is 4 files at most (see tvtimeImport.hint). These
// ceilings are well above that — generous enough for legitimate re-exports —
// but still catch an accidental folder-drop or a huge unrelated file before
// any file.text() call, which is where an unbounded selection would freeze
// the UI or spike memory.
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

// Only ever returns a result whose title actually matches — never the
// first search hit just because nothing better was found. Falling back to
// an unrelated top result would silently attach the wrong movie/series to
// the imported history instead of surfacing it as unmatched for review.
const pickBestMatch = (results: MediaSummary[], title: string, year: number | null): MediaSummary | null => {
  if (!results.length) return null;
  const lowered = title.toLowerCase();
  const titled = results.filter((result) => result.title.toLowerCase() === lowered);
  if (year !== null) {
    const exact = titled.find((result) => result.year === year);
    if (exact) return exact;
  }
  return titled[0] ?? null;
};

async function resolveSeries(name: string, tvdbIdsByName: Map<string, number>): Promise<Series | null> {
  const tvdbId = tvdbIdsByName.get(name.toLowerCase());
  if (tvdbId !== undefined) {
    try {
      const found = await withRateLimitRetry(() => mediaRepository.findSeriesByTvdbId(tvdbId));
      if (found) return found;
    } catch {
      // Fall through to name search.
    }
  }
  const { title, year } = splitTitleYear(name);
  const page = await withRateLimitRetry(() => mediaRepository.search(title, "series"));
  const match = pickBestMatch(page.results, title, year);
  return match ? withRateLimitRetry(() => mediaRepository.getSeriesDetails(match.id)) : null;
}

async function importOneSeries(
  seriesName: string,
  episodes: TvTimeEpisode[],
  data: TvTimeExport,
  summary: TvTimeImportSummary
): Promise<void> {
  const series = await resolveSeries(seriesName, data.tvdbIdsByName);
  if (!series) {
    summary.unmatched.push(seriesName);
    return;
  }

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
    const resolved = episodeIdByCode.get(`${episode.seasonNumber}|${episode.episodeNumber}`);
    if (!resolved) {
      unresolved += 1;
      continue;
    }
    importable.push({
      episodeId: resolved.id,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      watchedAt: episode.watchedAt,
      runtimeMinutes: episode.runtimeMinutes ?? resolved.runtime,
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

export async function importTvTimeExport(
  fileContents: string[],
  onProgress?: (progress: TvTimeImportProgress) => void
): Promise<TvTimeImportSummary> {
  const accumulator = emptyExport();
  for (const content of fileContents) parseTvTimeFile(content, accumulator);
  const data = normalizeExport(accumulator);

  const summary: TvTimeImportSummary = {
    seriesImported: 0,
    episodesImported: 0,
    moviesImported: 0,
    plannedImported: 0,
    unmatched: [],
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
        const page = await withRateLimitRetry(() => mediaRepository.search(movie.title, "movie"));
        const match = pickBestMatch(page.results, movie.title, movie.year);
        if (!match) {
          summary.unmatched.push(movie.title);
        } else {
          const inserted = await tvTimeImportRepository.importMovieSeen({
            movieId: match.id,
            title: match.title,
            posterPath: match.posterPath,
            backdropPath: match.backdropPath,
            runtime: movie.runtimeMinutes ?? match.runtime ?? null,
            watchedAt: movie.watchedAt,
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
        const page = await withRateLimitRetry(() =>
          mediaRepository.search(entry.title, entry.mediaType === "movie" ? "movie" : "series")
        );
        const match = pickBestMatch(page.results, entry.title, entry.year);
        if (!match) {
          summary.unmatched.push(entry.title);
        } else {
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
