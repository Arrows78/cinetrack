import { addDays, endOfDay, isAfter, isBefore, parseISO, startOfDay } from "date-fns";
import { mediaRepository } from "@/features/media/media-repository";
import { progressRepository } from "@/features/progress/progress-repository";
import type { CalendarEntry, Season } from "@/types/media";

export const calendarService = {
  async build(days = 60): Promise<CalendarEntry[]> {
    const from = startOfDay(new Date());
    const to = endOfDay(addDays(from, days));
    const entries: CalendarEntry[] = [];

    const upcoming = await mediaRepository
      .getUpcomingMovies(1)
      .catch(() => ({ page: 1, totalPages: 0, totalResults: 0, results: [] }));
    for (const movie of upcoming.results) {
      if (!movie.releaseDate) continue;
      const date = parseISO(movie.releaseDate);
      if (isBefore(date, from) || isAfter(date, to)) continue;
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

    const tracked = (await progressRepository.listTrackedSeries()).slice(0, 20);
    await Promise.all(
      tracked.map(async (trackedSeries) => {
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
      })
    );

    return entries.sort((left, right) => left.date.localeCompare(right.date));
  },
};
