import { addDays, endOfDay, isAfter, isBefore, parseISO, startOfDay } from "date-fns";
import { queryClient } from "@/app/query-client";
import { mediaRepository } from "@/features/media/media-repository";
import { libraryRepository } from "@/features/library/library-repository";
import { progressRepository } from "@/features/progress/progress-repository";
import { errorMessage } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";
import { mapWithConcurrency } from "@/shared/utils/concurrency";
import { queryKeys } from "@/shared/constants/query-keys";
import { STALE_1_HOUR, STALE_5_MIN } from "@/shared/constants/query";
import type { CalendarEntry, Season } from "@/types/media";

// How many per-series TMDB detail/season lookups run at once. Every tracked
// series is included (no arbitrary cap) — this only bounds how many of
// those lookups are in flight simultaneously, so a large tracked list takes
// longer rather than firing hundreds of requests at once. Bumped from 5 to
// 8: lookups now go through queryClient.fetchQuery (see below), which
// dedupes identical in-flight requests and short-circuits on a cache hit, so
// a higher fan-out no longer means proportionally more real TMDB calls.
const SERIES_LOOKUP_CONCURRENCY = 8;
// Upcoming movies beyond this many pages are not worth paginating into for
// a 60-day window. The feed is sorted by popularity, so dates on one page
// cannot tell us whether later pages contain releases inside the window.
const MAX_UPCOMING_MOVIE_PAGES = 10;

// A source's entries plus the error that made it unreachable, when none of
// its lookups succeeded (as opposed to "fetched, nothing in the window").
interface SourceResult {
  entries: CalendarEntry[];
  failure?: { error: unknown };
}

async function fetchUpcomingMovieEntries(from: Date, to: Date): Promise<SourceResult> {
  const entries: CalendarEntry[] = [];
  let failure: SourceResult["failure"];

  for (let page = 1; page <= MAX_UPCOMING_MOVIE_PAGES; page += 1) {
    const upcoming = await mediaRepository.getUpcomingMovies(page).catch((error: unknown) => {
      logger.warn(`Failed to fetch upcoming movies page ${page}: ${errorMessage(error)}`);
      if (page === 1) failure = { error };
      return { page, totalPages: page, totalResults: 0, results: [] };
    });
    if (!upcoming.results.length) break;

    for (const movie of upcoming.results) {
      if (!movie.releaseDate) continue;
      const date = parseISO(movie.releaseDate);
      if (isAfter(date, to)) {
        continue;
      }
      if (isBefore(date, from)) continue;
      entries.push({
        id: `movie-${movie.id}-${movie.releaseDate}`,
        mediaId: movie.id,
        mediaType: "movie",
        title: movie.title,
        date: movie.releaseDate,
        kind: "movie-release",
        posterPath: movie.posterPath,
      });
    }
    if (page >= upcoming.totalPages) break;
  }

  return { entries, failure };
}

// The upcoming feed is a popularity ranking, so a film the user saved can sit
// beyond its last page. Looking the library's unseen films up directly puts
// them on the calendar whatever their rank. Films from past years are skipped:
// they cannot release inside the window.
async function fetchLibraryMovieEntries(from: Date, to: Date): Promise<SourceResult> {
  const entries: CalendarEntry[] = [];
  const errors: unknown[] = [];
  const items = (await libraryRepository.list("movie")).filter(
    (item) =>
      item.status !== "completed" &&
      item.status !== "dropped" &&
      (item.year === null || item.year >= from.getFullYear())
  );

  await mapWithConcurrency(
    items,
    async (item) => {
      try {
        const movie = await queryClient.fetchQuery({
          queryKey: queryKeys.remote.movieDetails(item.mediaId),
          queryFn: () => mediaRepository.getMovieDetails(item.mediaId),
          staleTime: STALE_1_HOUR,
          retry: false,
        });
        if (!movie.releaseDate) return;
        const date = parseISO(movie.releaseDate);
        if (isBefore(date, from) || isAfter(date, to)) return;
        entries.push({
          id: `movie-${movie.id}-${movie.releaseDate}`,
          mediaId: movie.id,
          mediaType: "movie",
          title: movie.title,
          date: movie.releaseDate,
          kind: "movie-release",
          posterPath: movie.posterPath,
        });
      } catch (error) {
        logger.warn(`Failed to fetch details for library movie ${item.mediaId}: ${errorMessage(error)}`);
        errors.push(error);
      }
    },
    SERIES_LOOKUP_CONCURRENCY
  );

  return { entries, failure: errors.length > 0 && errors.length === items.length ? { error: errors[0] } : undefined };
}

async function fetchTrackedSeriesEntries(from: Date, to: Date): Promise<SourceResult> {
  const entries: CalendarEntry[] = [];
  const errors: unknown[] = [];
  const tracked = await progressRepository.listTrackedSeries();

  await mapWithConcurrency(
    tracked,
    async (trackedSeries) => {
      try {
        // Routed through the shared queryClient instead of calling
        // mediaRepository directly: a series/season the user just viewed on
        // its detail page (useSeriesDetails/useSeriesSeasons in use-media.ts)
        // is already sitting in cache under this exact key, so fetchQuery
        // returns it instantly instead of re-hitting TMDB — and it dedupes
        // concurrent identical requests app-wide, populating the cache for
        // other consumers too.
        // retry: false overrides the queryClient's default retry-once
        // behavior — this call already has its own catch-and-skip below, so
        // a query-level retry would only add backoff delay before reaching
        // the same "skip this series" outcome.
        const details = await queryClient.fetchQuery({
          queryKey: queryKeys.remote.seriesDetails(trackedSeries.seriesId),
          queryFn: () => mediaRepository.getSeriesDetails(trackedSeries.seriesId),
          staleTime: STALE_5_MIN,
          retry: false,
        });
        const recentSeasonNumbers = details.seasons
          .map((season) => season.seasonNumber)
          .filter((number) => number > 0)
          .sort((a, b) => a - b)
          .slice(-2);
        const seasonErrors: unknown[] = [];
        const seasons = (
          await Promise.all(
            recentSeasonNumbers.map((number) =>
              queryClient
                .fetchQuery({
                  queryKey: queryKeys.remote.seasonDetails(details.id, number),
                  queryFn: () => mediaRepository.getSeasonDetails(details.id, number),
                  staleTime: STALE_1_HOUR,
                  retry: false,
                })
                .catch((error) => {
                  seasonErrors.push(error);
                  logger.warn(`Failed to fetch season ${number} details for series ${details.id}: ${error}`);
                  return null;
                })
            )
          )
        ).filter((season): season is Season => Boolean(season));
        if (seasonErrors.length > 0 && seasons.length === 0) throw seasonErrors[0];
        for (const episode of seasons.flatMap((season) => season.episodes)) {
          if (!episode.airDate) continue;
          const date = parseISO(episode.airDate);
          if (isBefore(date, from) || isAfter(date, to)) continue;
          entries.push({
            id: `episode-${episode.id}-${episode.airDate}`,
            mediaId: details.id,
            mediaType: "series",
            title: details.title,
            date: episode.airDate,
            kind: "episode",
            posterPath: details.posterPath,
            seasonNumber: episode.seasonNumber,
            episodeNumber: episode.episodeNumber,
            episodeTitle: episode.title,
          });
        }
      } catch (error) {
        // A single unavailable series must not hide the rest of the calendar.
        logger.warn(`Failed to fetch details for tracked series ${trackedSeries.seriesId}: ${errorMessage(error)}`);
        errors.push(error);
      }
    },
    SERIES_LOOKUP_CONCURRENCY
  );

  // No tracked series means nothing was attempted, which is not a failure.
  return { entries, failure: errors.length > 0 && errors.length === tracked.length ? { error: errors[0] } : undefined };
}

function compareCalendarEntries(left: CalendarEntry, right: CalendarEntry): number {
  return (
    left.date.localeCompare(right.date) ||
    left.title.localeCompare(right.title) ||
    (left.seasonNumber ?? 0) - (right.seasonNumber ?? 0) ||
    (left.episodeNumber ?? 0) - (right.episodeNumber ?? 0) ||
    left.id.localeCompare(right.id)
  );
}

export const calendarService = {
  async build(days = 60): Promise<CalendarEntry[]> {
    const from = startOfDay(new Date());
    const to = endOfDay(addDays(from, days));

    // The upcoming-movies pagination loop and the tracked-series fetch loop
    // populate independent parts of the final list and don't depend on each
    // other's results — running them concurrently instead of sequentially
    // roughly halves the wall-clock time on a profile with both a sizeable
    // tracked-series list and several pages of upcoming movies.
    const [movies, episodes, libraryMovies] = await Promise.all([
      fetchUpcomingMovieEntries(from, to),
      fetchTrackedSeriesEntries(from, to),
      fetchLibraryMovieEntries(from, to),
    ]);

    // Keep entries from working sources. If the calendar is empty and a
    // source failed, offer a retry: an empty movie feed cannot prove there
    // are no upcoming episodes when those episodes could not be fetched.
    const failure = movies.failure ?? episodes.failure ?? libraryMovies.failure;
    if (movies.entries.length === 0 && episodes.entries.length === 0 && libraryMovies.entries.length === 0 && failure) {
      throw failure.error;
    }

    // The lookups finish in whatever order TMDB answers, and the upcoming feed
    // can repeat a movie across pages while it shifts: one entry per id, in a
    // fixed order — date, then title, then season and episode.
    const unique = new Map<string, CalendarEntry>();
    for (const entry of [...movies.entries, ...libraryMovies.entries, ...episodes.entries]) unique.set(entry.id, entry);
    return [...unique.values()].sort(compareCalendarEntries);
  },
};
