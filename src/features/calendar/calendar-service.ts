import { addDays, endOfDay, isAfter, isBefore, parseISO, startOfDay } from "date-fns";
import { mediaRepository } from "@/features/media/media-repository";
import { progressRepository } from "@/features/progress/progress-repository";
import { mapWithConcurrency } from "@/shared/utils/concurrency";
import type { CalendarEntry, Season } from "@/types/media";

// How many per-series TMDB detail/season lookups run at once. Every tracked
// series is included (no arbitrary cap) — this only bounds how many of
// those lookups are in flight simultaneously, so a large tracked list takes
// longer rather than firing hundreds of requests at once.
const SERIES_LOOKUP_CONCURRENCY = 5;
// Upcoming movies beyond this many pages are not worth paginating into for
// a 60-day window — TMDB's "upcoming" list is sorted by release date, so
// this is a safety ceiling, not the normal stopping condition (build() stops
// as soon as a page's results move past `to`).
const MAX_UPCOMING_MOVIE_PAGES = 10;

export const calendarService = {
  async build(days = 60): Promise<CalendarEntry[]> {
    const from = startOfDay(new Date());
    const to = endOfDay(addDays(from, days));
    const entries: CalendarEntry[] = [];

    for (let page = 1; page <= MAX_UPCOMING_MOVIE_PAGES; page += 1) {
      const upcoming = await mediaRepository
        .getUpcomingMovies(page)
        .catch(() => ({ page, totalPages: page, totalResults: 0, results: [] }));
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

    const tracked = await progressRepository.listTrackedSeries();
    await mapWithConcurrency(
      tracked,
      async (trackedSeries) => {
        try {
          const details = await mediaRepository.getSeriesDetails(trackedSeries.seriesId);
          const recentSeasonNumbers = details.seasons
            .map((season) => season.seasonNumber)
            .filter((number) => number > 0)
            .slice(-2);
          const seasons = (
            await Promise.all(
              recentSeasonNumbers.map((number) =>
                mediaRepository.getSeasonDetails(details.id, number).catch(() => null)
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
        } catch {
          // A single unavailable series must not hide the rest of the calendar.
        }
      },
      SERIES_LOOKUP_CONCURRENCY
    );

    return entries.sort((left, right) => left.date.localeCompare(right.date));
  },
};
