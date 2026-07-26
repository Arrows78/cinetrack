import { addDays, endOfDay, isAfter, isBefore, parseISO, startOfDay } from "date-fns";
import { mediaRepository } from "@/services/repositories/media-repository";
import { progressRepository } from "@/services/local/progress-repository";
import type { CalendarEntry, Season } from "@/types/media";

export const calendarService = {
  async build(days = 60): Promise<CalendarEntry[]> {
    const from = startOfDay(new Date());
    const to = endOfDay(addDays(from, days));
    const entries: CalendarEntry[] = [];

    const upcoming = await mediaRepository.getUpcomingMovies(1);
    for (const movie of upcoming.results) {
      if (!movie.releaseDate) continue;
      const date = parseISO(movie.releaseDate);
      if (isBefore(date, from) || isAfter(date, to)) continue;
      entries.push({ id: `movie-${movie.id}-${movie.releaseDate}`, mediaId: movie.id, mediaType: "movie", title: movie.title, date: movie.releaseDate, kind: "movie-release", posterPath: movie.posterPath });
    }

    const tracked = (await progressRepository.listTrackedSeries()).slice(0, 20);
    await Promise.all(tracked.map(async (trackedSeries) => {
      const details = await mediaRepository.getSeriesDetails(trackedSeries.seriesId);
      const recentSeasonNumbers = details.seasons.map((season) => season.seasonNumber).filter((number) => number > 0).slice(-2);
      const seasons: Season[] = await Promise.all(recentSeasonNumbers.map((number) => mediaRepository.getSeasonDetails(details.id, number)));
      for (const episode of seasons.flatMap((season) => season.episodes)) {
        if (!episode.airDate) continue;
        const date = parseISO(episode.airDate);
        if (isBefore(date, from) || isAfter(date, to)) continue;
        entries.push({ id: `episode-${episode.id}-${episode.airDate}`, mediaId: details.id, mediaType: "series", title: details.title, date: episode.airDate, kind: "episode", posterPath: details.posterPath, seasonNumber: episode.seasonNumber, episodeNumber: episode.episodeNumber, episodeTitle: episode.title });
      }
    }));

    return entries.sort((left, right) => left.date.localeCompare(right.date));
  },
};
