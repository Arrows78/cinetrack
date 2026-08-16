import { parseCsv } from "./csv";

export interface TvTimeEpisode {
  seriesName: string;
  seasonNumber: number;
  episodeNumber: number;
  watchedAt: string;
  runtimeMinutes: number | null;
}

export interface TvTimeMovie {
  title: string;
  year: number | null;
  watchedAt: string;
  runtimeMinutes: number | null;
}

export interface TvTimeWatchlistEntry {
  title: string;
  mediaType: "movie" | "series";
  year: number | null;
}

export interface TvTimeExport {
  episodes: TvTimeEpisode[];
  movies: TvTimeMovie[];
  watchlist: TvTimeWatchlistEntry[];
  /** TheTVDB ids keyed by lowercase series name (from followed_tv_show.csv). */
  tvdbIdsByName: Map<string, number>;
  /**
   * Otherwise-well-formed watch rows dropped because `created_at` was
   * missing or unparseable. Never backfilled with today's date — a fake
   * watch date would silently corrupt anything date-bucketed (monthly
   * activity, streaks, wrapped) — so these are just excluded and counted
   * here for the pre-import summary to surface instead.
   */
  skippedRows: { episodes: number; movies: number };
}

// TV Time timestamps are "YYYY-MM-DD HH:mm:ss" in UTC.
const toIso = (value: string): string | null => {
  if (!value) return null;
  const date = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toYear = (releaseDate: string): number | null => {
  const year = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isFinite(year) && year > 1880 ? year : null;
};

const secondsToMinutes = (value: string): number | null => {
  const seconds = Number.parseInt(value, 10);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds / 60) : null;
};

export type TvTimeFileKind = "records-v2" | "records-v1" | "followed" | "special-status" | "unknown";

/** Identifies a GDPR export file by its header row. */
export function detectFileKind(text: string): TvTimeFileKind {
  const header = text.slice(0, text.indexOf("\n")).trim();
  if (header.includes("series_name") && header.includes("ep_no")) return "records-v2";
  if (header.includes("entity_type") && header.includes("movie_name")) return "records-v1";
  if (header.includes("tv_show_id") && header.includes("notification_type")) return "followed";
  if (header.includes("tv_show_id") && header.includes("status")) return "special-status";
  return "unknown";
}

export function emptyExport(): TvTimeExport {
  return { episodes: [], movies: [], watchlist: [], tvdbIdsByName: new Map(), skippedRows: { episodes: 0, movies: 0 } };
}

/**
 * Parses one export file into the accumulator. Files can be provided in any
 * order and any subset; episodes are deduplicated on (series, season,
 * episode), keeping the earliest watch date.
 */
export function parseTvTimeFile(text: string, into: TvTimeExport): TvTimeFileKind {
  const kind = detectFileKind(text);
  if (kind === "unknown") return kind;

  const rows = parseCsv(text);

  if (kind === "records-v2") {
    for (const row of rows) {
      if (!row.key?.startsWith("watch-episode") && !row.key?.startsWith("rewatch-episode")) continue;
      const seriesName = row.series_name?.trim();
      const seasonNumber = Number.parseInt(row.s_no ?? "", 10);
      const episodeNumber = Number.parseInt(row.ep_no ?? "", 10);
      if (!seriesName || !Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) continue;
      const watchedAt = toIso(row.created_at ?? "");
      if (!watchedAt) {
        into.skippedRows.episodes += 1;
        continue;
      }
      into.episodes.push({
        seriesName,
        seasonNumber,
        episodeNumber,
        watchedAt,
        runtimeMinutes: secondsToMinutes(row.runtime ?? ""),
      });
    }
  }

  if (kind === "records-v1") {
    for (const row of rows) {
      const isMovie = row.entity_type === "movie";
      const title = row.movie_name?.trim();
      if (!isMovie || !title) continue;
      if (row.type === "watch") {
        const watchedAt = toIso(row.created_at ?? "");
        if (!watchedAt) {
          into.skippedRows.movies += 1;
          continue;
        }
        into.movies.push({
          title,
          year: toYear(row.release_date ?? ""),
          watchedAt,
          runtimeMinutes: secondsToMinutes(row.runtime ?? ""),
        });
      } else if (row.type === "towatch") {
        into.watchlist.push({ title, mediaType: "movie", year: toYear(row.release_date ?? "") });
      }
    }
  }

  if (kind === "followed") {
    for (const row of rows) {
      const name = row.tv_show_name?.trim();
      const tvdbId = Number.parseInt(row.tv_show_id ?? "", 10);
      if (name && Number.isFinite(tvdbId)) into.tvdbIdsByName.set(name.toLowerCase(), tvdbId);
    }
  }

  if (kind === "special-status") {
    for (const row of rows) {
      const name = row.tv_show_name?.trim();
      if (name && row.status === "for_later") {
        into.watchlist.push({ title: name, mediaType: "series", year: null });
      }
    }
  }

  return kind;
}

/** Deduplicates episodes and movies, keeping the earliest watch date. */
export function normalizeExport(data: TvTimeExport): TvTimeExport {
  const episodeMap = new Map<string, TvTimeEpisode>();
  for (const episode of data.episodes) {
    const key = `${episode.seriesName.toLowerCase()}|${episode.seasonNumber}|${episode.episodeNumber}`;
    const existing = episodeMap.get(key);
    if (!existing || episode.watchedAt < existing.watchedAt) episodeMap.set(key, episode);
  }

  const movieMap = new Map<string, TvTimeMovie>();
  for (const movie of data.movies) {
    const key = movie.title.toLowerCase();
    const existing = movieMap.get(key);
    if (!existing || movie.watchedAt < existing.watchedAt) movieMap.set(key, movie);
  }

  const watchlistMap = new Map<string, TvTimeWatchlistEntry>();
  for (const entry of data.watchlist) {
    watchlistMap.set(`${entry.mediaType}|${entry.title.toLowerCase()}`, entry);
  }

  return {
    episodes: [...episodeMap.values()],
    movies: [...movieMap.values()],
    watchlist: [...watchlistMap.values()],
    tvdbIdsByName: data.tvdbIdsByName,
    skippedRows: data.skippedRows,
  };
}

export interface TvTimeFile {
  name: string;
  text: string;
}

export interface ParsedTvTimeFiles {
  data: TvTimeExport;
  /** Selected files whose header didn't match any known export CSV. */
  unrecognizedFiles: string[];
}

/**
 * Parses every selected/extracted file (in any order, any subset) into one
 * normalized export, tracking which ones weren't recognized at all — a
 * GDPR export .zip has far more files in it than the 4 this feature reads,
 * and silently ignoring an unrecognized selection left users with no way to
 * tell why nothing happened for a given file.
 */
export function parseTvTimeFiles(files: TvTimeFile[]): ParsedTvTimeFiles {
  const accumulator = emptyExport();
  const unrecognizedFiles: string[] = [];
  for (const file of files) {
    const kind = parseTvTimeFile(file.text, accumulator);
    if (kind === "unknown") unrecognizedFiles.push(file.name);
  }
  return { data: normalizeExport(accumulator), unrecognizedFiles };
}
