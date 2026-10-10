import { addDays, endOfDay, isAfter, isBefore, parseISO, startOfDay } from "date-fns";
import { queryClient } from "@/app/query-client";
import { mediaRepository } from "@/features/media/media-repository";
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
// a 60-day window — TMDB's "upcoming" list is sorted by release date, so
// this is a safety ceiling, not the normal stopping condition (build() stops
// as soon as a page's results move past `to`).
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

    let sawEntryPastWindow = false;
    for (const movie of upcoming.results) {
      if (!movie.releaseDate) continue;
      const date = parseISO(movie.releaseDate);
      if (isAfter(date, to)) {
        sawEntryPastWindow = true;
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
    // TMDB's upcoming list is sorted by ascending release date, so once a
    // page starts returning dates past the window, later pages only would too.
    if (sawEntryPastWindow || page >= upcoming.totalPages) break;
  }

  return { entries, failure };
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
          .slice(-2);
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
                  logger.warn(`Failed to fetch season ${number} details for series ${details.id}: ${error}`);
                  return null;
                })
            )
          )
        ).filter((season): season is Season => Boolean(season));
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

export const calendarService = {
  async build(days = 60): Promise<CalendarEntry[]> {
    const from = startOfDay(new Date());
    const to = endOfDay(addDays(from, days));

    // The upcoming-movies pagination loop and the tracked-series fetch loop
    // populate independent parts of the final list and don't depend on each
    // other's results — running them concurrently instead of sequentially
    // roughly halves the wall-clock time on a profile with both a sizeable
    // tracked-series list and several pages of upcoming movies.
    const [movies, episodes] = await Promise.all([
      fetchUpcomingMovieEntries(from, to),
      fetchTrackedSeriesEntries(from, to),
    ]);

    // A partial failure degrades to a shorter calendar. When nothing could
    // be fetched at all the caller must see an error (so the page shows its
    // retry state) rather than an empty calendar reading as "nothing coming
    // up": the upcoming feed is down and no tracked series could be reached
    // either (or none is tracked, so there is nothing else to show).
    if (movies.failure && (episodes.failure || episodes.entries.length === 0)) {
      throw movies.failure.error;
    }

    return [...movies.entries, ...episodes.entries].sort((left, right) => left.date.localeCompare(right.date));
  },
};
