import i18n from "@/i18n";
import { libraryRepository } from "@/features/library/library-repository";
import { mapWithConcurrency } from "@/shared/utils/concurrency";
import { logger } from "@/shared/lib/logger";
import { errorMessage } from "@/shared/lib/errors";
import type { MediaSummary, Series } from "@/types/media";
import {
  seriesKeyOf,
  type TvTimeEpisode,
  type TvTimeExport,
  type TvTimeMovie,
  type TvTimeWatchlistEntry,
} from "./parse-export";
import {
  tvTimeImportRepository,
  type CreatedLibraryItem,
  type ImportableEpisode,
  type MovieImportOutcome,
} from "./tvtime-import-repository";
import {
  pickBestMatch,
  resolveSeries,
  searchWithFallback,
  splitTitleYear,
  withRateLimitRetry,
  type ThrottleReporter,
} from "./tvtime-import-matching";
import { mediaRepository } from "@/features/media/media-repository";
import { createdItem, emptyTvTimeImportUndo } from "./tvtime-import-undo";
import {
  TVTIME_IMPORT_CONCURRENCY,
  type RetryableMovie,
  type RetryableSeries,
  type RetryableWatchlistEntry,
  type TvTimeImportProgress,
  type TvTimeImportSummary,
  type TvTimeImportUndo,
  type TvTimeLibraryPatch,
} from "./tvtime-import-types";

// How long a onProgress payload keeps reporting `throttled: true` after the
// last observed 429 — long enough to stay visible across the gap between two
// progress ticks, short enough to clear once TMDB is actually keeping up
// again.
const THROTTLE_DISPLAY_WINDOW_MS = 4000;

const emptyUndo = emptyTvTimeImportUndo;

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

// Season lookups + the actual write, given an already-resolved series —
// shared by the automatic pass below and resolveRetryableSeries (the manual
// panel's entry point once the user has picked a series themselves).
async function attachEpisodesToSeries(
  series: Series,
  episodes: TvTimeEpisode[],
  onThrottled?: ThrottleReporter
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
      const season = await withRateLimitRetry(
        () => mediaRepository.getSeasonDetails(series.id, seasonNumber),
        onThrottled
      );
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

/** One show of the export: its episodes grouped by TV Time show id (name only when a row has no id). */
interface SeriesGroup {
  seriesName: string;
  seriesId: number | null;
  episodes: TvTimeEpisode[];
}

/**
 * Groups the episodes per show. The key is the TV Time show id whenever the
 * row carries one, the lowercase name otherwise: two different shows that
 * share a name ("The Office") have different ids and stay apart, instead of
 * being merged into one series whose episodes then match a single TMDB show.
 */
function groupEpisodesBySeries(episodes: TvTimeEpisode[]): SeriesGroup[] {
  const groups = new Map<string, SeriesGroup>();
  for (const episode of episodes) {
    const key = seriesKeyOf(episode.seriesId, episode.seriesName);
    const group = groups.get(key);
    if (group) group.episodes.push(episode);
    else groups.set(key, { seriesName: episode.seriesName, seriesId: episode.seriesId ?? null, episodes: [episode] });
  }
  return [...groups.values()];
}

// Favourite/rating apply to the show itself, independent of whether any of
// its specific episodes ended up matched on TMDB (e.g. a season TMDB has no
// data for) — so this only needs the show to have resolved to a real TMDB
// series at all, not a successful episode count. A show with an id is looked
// up by that id only (a homonym's favourite/rating must not leak onto it by
// name); one without falls back to its name. `undefined` fields are omitted
// rather than sent as `false`/absent so a series with only a rating (no
// favourite) never has its favourite flag reset by this patch — see
// upsert_impl's per-field fallback-to-current semantics in
// src-tauri/src/library/repository.rs.
function libraryPatchFromTvTimeSignals(group: SeriesGroup, data: TvTimeExport): TvTimeLibraryPatch | null {
  const nameKey = group.seriesName.toLowerCase();
  const favourite =
    group.seriesId !== null ? data.favouriteSeriesIds.has(group.seriesId) : data.favouriteSeriesNames.has(nameKey);
  const userRating =
    group.seriesId !== null ? data.seriesRatingsById.get(group.seriesId) : data.seriesRatingsByName.get(nameKey);
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
  group: SeriesGroup,
  data: TvTimeExport,
  summary: TvTimeImportSummary,
  onThrottled: ThrottleReporter
): Promise<void> {
  const { seriesName, episodes } = group;
  // The show's own id is its TheTVDB id (the same one followed.csv lists);
  // the name only stands in for a row that has none.
  const tvdbId = group.seriesId ?? data.tvdbIdsByName.get(seriesName.toLowerCase());
  const resolved = await resolveSeries(seriesName, tvdbId, onThrottled);
  if (resolved.ambiguous) summary.ambiguous.push(seriesName);
  const libraryPatch = libraryPatchFromTvTimeSignals(group, data);
  if (!resolved.series) {
    summary.unmatched.push(seriesName);
    summary.retryable.push(retryableSeriesFrom(seriesName, episodes, libraryPatch));
    return;
  }

  const { insertedEpisodes, attemptedCount, unresolvedCount, createdLibraryItemId } = await attachEpisodesToSeries(
    resolved.series,
    episodes,
    onThrottled
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
  const hasWrites = undo.movies.length > 0 || undo.series.length > 0 || undo.createdLibraryItems.length > 0;
  return { episodesImported: insertedEpisodes.length, undo: hasWrites ? undo : null };
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
 * One import phase: `work` over every item with bounded concurrency, a
 * progress tick before and after each, and the same failure policy for all of
 * them — a throw is logged, and `onFailure` records the item as unmatched and
 * retryable so one bad title never aborts the run or disappears silently.
 * (The three phases used to each carry their own copy of this.)
 */
async function runPhase<T>(options: {
  phase: TvTimeImportProgress["phase"];
  items: T[];
  labelOf: (item: T) => string;
  work: (item: T) => Promise<void>;
  onFailure: (item: T) => void;
  reportProgress: (progress: Omit<TvTimeImportProgress, "throttled">) => void;
}): Promise<void> {
  const { phase, items, labelOf, work, onFailure, reportProgress } = options;
  let done = 0;
  await mapWithConcurrency(
    items,
    async (item) => {
      const label = labelOf(item);
      reportProgress({ phase, done, total: items.length, label });
      try {
        await work(item);
      } catch (error) {
        logger.warn(`TV Time import: ${phase} "${label}" failed: ${errorMessage(error)}`);
        onFailure(item);
      }
      done += 1;
      reportProgress({ phase, done, total: items.length, label });
    },
    TVTIME_IMPORT_CONCURRENCY
  );
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

  // Local to this call: a 429 seen by any lookup of this import is reported
  // through the progress ticks of this import only.
  let lastThrottledAt = 0;
  const onThrottled: ThrottleReporter = () => {
    lastThrottledAt = Date.now();
  };
  const reportProgress = (progress: Omit<TvTimeImportProgress, "throttled">) => {
    onProgress?.({ ...progress, throttled: Date.now() - lastThrottledAt < THROTTLE_DISPLAY_WINDOW_MS });
  };

  // Episodes and movies touch disjoint parts of `summary` (each owns its own
  // counters and undo bucket) and only share append-only arrays
  // (unmatched/ambiguous/retryable) — safe to run together rather than one
  // full phase after another, which used to make a large export take several
  // minutes end to end for no reason other than the code awaiting in sequence.
  await Promise.all([
    runPhase({
      phase: "series",
      items: groupEpisodesBySeries(data.episodes),
      labelOf: (group) => group.seriesName,
      work: (group) => importOneSeries(group, data, summary, onThrottled),
      onFailure: (group) => {
        summary.unmatched.push(group.seriesName);
        summary.retryable.push(
          retryableSeriesFrom(group.seriesName, group.episodes, libraryPatchFromTvTimeSignals(group, data))
        );
      },
      reportProgress,
    }),
    runPhase({
      phase: "movies",
      items: data.movies,
      labelOf: (movie) => movie.title,
      work: async (movie) => {
        const { results, queriedTitle } = await searchWithFallback(movie.title, "movie", onThrottled);
        const { match, ambiguous } = pickBestMatch(results, queriedTitle, movie.year);
        if (ambiguous) summary.ambiguous.push(movie.title);
        if (!match) {
          summary.unmatched.push(movie.title);
          summary.retryable.push(retryableMovieFrom(movie, results));
          return;
        }
        const undo = undoForMovie(match, await importMatchedMovie(movie, match));
        if (undo) {
          summary.moviesImported += 1;
          summary.undo.movies.push(...undo.movies);
          summary.undo.createdLibraryItems.push(...undo.createdLibraryItems);
        } else {
          summary.moviesAlreadyInLibrary += 1;
        }
      },
      onFailure: (movie) => {
        summary.unmatched.push(movie.title);
        summary.retryable.push(retryableMovieFrom(movie));
      },
      reportProgress,
    }),
  ]);

  // Only once the episodes and movies are written: a watchlist add never
  // overwrites a title already in the library (see addPlannedIfAbsent), so
  // whether a title is "created by the import" — and therefore removed again
  // by an undo — has to be decided after the phases that can create it, not
  // by which of them happened to get there first.
  await runPhase({
    phase: "watchlist",
    items: data.watchlist,
    labelOf: (entry) => entry.title,
    work: async (entry) => {
      const { results, queriedTitle } = await searchWithFallback(
        entry.title,
        entry.mediaType === "movie" ? "movie" : "series",
        onThrottled
      );
      const { match, ambiguous } = pickBestMatch(results, queriedTitle, entry.year);
      if (ambiguous) summary.ambiguous.push(entry.title);
      if (!match) {
        summary.unmatched.push(entry.title);
        summary.retryable.push(retryableWatchlistFrom(entry, results));
        return;
      }
      const created = await addPlannedIfAbsent(match);
      if (!created) {
        summary.plannedAlreadyInLibrary += 1;
      } else {
        summary.plannedImported += 1;
        summary.undo.createdLibraryItems.push(created);
      }
    },
    onFailure: (entry) => {
      summary.unmatched.push(entry.title);
      summary.retryable.push(retryableWatchlistFrom(entry));
    },
    reportProgress,
  });

  return summary;
}
