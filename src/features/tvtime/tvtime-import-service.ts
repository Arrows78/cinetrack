import i18n from "@/i18n";
import { mediaRepository } from "@/features/media/media-repository";
import { watchlistRepository } from "@/features/watchlist/watchlist-repository";
import { newUuid } from "@/shared/lib/id";
import type { MediaSummary, Series } from "@/types/media";
import { emptyExport, normalizeExport, parseTvTimeFile, type TvTimeEpisode, type TvTimeExport } from "./parse-export";
import { tvTimeImportRepository, type ImportableEpisode } from "./tvtime-import-repository";

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
  watchlistImported: number;
  unmatched: string[];
}

const CONCURRENCY = 3;

// "Bodyguard (2018)" → { title: "Bodyguard", year: 2018 }
const splitTitleYear = (name: string): { title: string; year: number | null } => {
  const match = /^(.*)\s+\((\d{4})\)$/.exec(name.trim());
  if (!match) return { title: name.trim(), year: null };
  return { title: match[1]!.trim(), year: Number(match[2]) };
};

const pickBestMatch = (results: MediaSummary[], title: string, year: number | null): MediaSummary | null => {
  if (!results.length) return null;
  const lowered = title.toLowerCase();
  const titled = results.filter((result) => result.title.toLowerCase() === lowered);
  if (year !== null) {
    const exact = titled.find((result) => result.year === year) ?? results.find((result) => result.year === year);
    if (exact) return exact;
  }
  return titled[0] ?? results[0] ?? null;
};

async function mapWithConcurrency<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]!);
    }
  });
  await Promise.all(runners);
}

async function resolveSeries(name: string, tvdbIdsByName: Map<string, number>): Promise<Series | null> {
  const tvdbId = tvdbIdsByName.get(name.toLowerCase());
  if (tvdbId !== undefined) {
    try {
      const found = await mediaRepository.findSeriesByTvdbId(tvdbId);
      if (found) return found;
    } catch {
      // Fall through to name search.
    }
  }
  const { title, year } = splitTitleYear(name);
  const page = await mediaRepository.search(title, "series");
  const match = pickBestMatch(page.results, title, year);
  return match ? mediaRepository.getSeriesDetails(match.id) : null;
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
      const season = await mediaRepository.getSeasonDetails(series.id, seasonNumber);
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
    watchlistImported: 0,
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
  await mapWithConcurrency(seriesEntries, async ([seriesName, episodes]) => {
    onProgress?.({ phase: "series", done: seriesDone, total: seriesEntries.length, label: seriesName });
    try {
      await importOneSeries(seriesName, episodes, data, summary);
    } catch {
      summary.unmatched.push(seriesName);
    }
    seriesDone += 1;
    onProgress?.({ phase: "series", done: seriesDone, total: seriesEntries.length, label: seriesName });
  });

  let moviesDone = 0;
  await mapWithConcurrency(data.movies, async (movie) => {
    onProgress?.({ phase: "movies", done: moviesDone, total: data.movies.length, label: movie.title });
    try {
      const page = await mediaRepository.search(movie.title, "movie");
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
  });

  let watchlistDone = 0;
  await mapWithConcurrency(data.watchlist, async (entry) => {
    onProgress?.({ phase: "watchlist", done: watchlistDone, total: data.watchlist.length, label: entry.title });
    try {
      const page = await mediaRepository.search(entry.title, entry.mediaType === "movie" ? "movie" : "series");
      const match = pickBestMatch(page.results, entry.title, entry.year);
      if (!match) {
        summary.unmatched.push(entry.title);
      } else {
        const now = new Date().toISOString();
        await watchlistRepository.save({
          id: newUuid(),
          mediaId: match.id,
          mediaType: entry.mediaType,
          title: match.title,
          posterPath: match.posterPath,
          backdropPath: match.backdropPath,
          year: match.year,
          rating: match.rating,
          createdAt: now,
          updatedAt: now,
        });
        summary.watchlistImported += 1;
      }
    } catch {
      summary.unmatched.push(entry.title);
    }
    watchlistDone += 1;
    onProgress?.({ phase: "watchlist", done: watchlistDone, total: data.watchlist.length, label: entry.title });
  });

  return summary;
}
