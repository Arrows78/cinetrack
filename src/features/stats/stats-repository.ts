import { addDays, eachMonthOfInterval, endOfMonth, format, parseISO, startOfMonth, subDays, subMonths } from "date-fns";
import { invokeCommand } from "@/shared/lib/invoke";
import { libraryRepository } from "@/features/library/library-repository";
import { progressRepository } from "@/features/progress/progress-repository";
import type { LibraryItem, LibraryStats, TrackedSeriesItem, ViewingEvent } from "@/types/media";

export interface WatchForecast {
  /** Unwatched episodes across all tracked series. */
  backlogEpisodes: number;
  /** Estimated minutes to catch up, from the viewer's own average episode runtime. */
  backlogMinutes: number;
  /** Episodes watched per week over the last 60 days. */
  episodesPerWeek: number;
  /** Projected catch-up date (ISO), or null when there is no backlog or no recent pace. */
  catchUpDate: string | null;
}

const FALLBACK_EPISODE_MINUTES = 40;
const PACE_WINDOW_DAYS = 60;

interface YearSummary {
  year: number;
  movies: number;
  episodes: number;
  minutes: number;
  topTitles: Array<{ title: string; count: number }>;
  favouriteGenre: string | null;
  activeDays: number;
}

const localDay = (timestamp: string) => format(parseISO(timestamp), "yyyy-MM-dd");

function currentStreak(events: ViewingEvent[]): number {
  const days = new Set(
    events.filter((event) => event.eventType !== "unwatched").map((event) => localDay(event.watchedAt))
  );
  const cursor = new Date();
  if (!days.has(format(cursor, "yyyy-MM-dd"))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(format(cursor, "yyyy-MM-dd"))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function compute(library: LibraryItem[], events: ViewingEvent[]): LibraryStats {
  const watched = events.filter((event) => event.eventType === "watched" || event.eventType === "rewatched");
  const genres = new Map<string, number>();
  for (const item of library) for (const genre of item.genres) genres.set(genre, (genres.get(genre) ?? 0) + 1);
  const ratings = library
    .map((item) => item.userRating)
    .filter((rating): rating is number => rating !== null && rating !== undefined);
  const interval = { start: startOfMonth(subMonths(new Date(), 11)), end: endOfMonth(new Date()) };
  const months = eachMonthOfInterval(interval).map((date) => format(date, "yyyy-MM"));
  return {
    moviesWatched: watched.filter((event) => event.mediaType === "movie").length,
    episodesWatched: watched.filter((event) => event.episodeId !== null && event.episodeId !== undefined).length,
    minutesWatched: watched.reduce((sum, event) => sum + (event.durationMinutes ?? 0), 0),
    completedSeries: library.filter((item) => item.mediaType === "series" && item.status === "completed").length,
    averageUserRating: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null,
    favouriteGenres: [...genres.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count })),
    monthlyActivity: months.map((month) => {
      const monthEvents = watched.filter((event) => event.watchedAt.startsWith(month));
      return {
        month,
        count: monthEvents.length,
        minutes: monthEvents.reduce((sum, event) => sum + (event.durationMinutes ?? 0), 0),
      };
    }),
    currentStreakDays: currentStreak(watched),
    watchlistCompletionPercent: library.length
      ? Math.round((library.filter((item) => item.status === "completed").length / library.length) * 100)
      : 0,
  };
}

function computeForecast(tracked: TrackedSeriesItem[], events: ViewingEvent[], now = new Date()): WatchForecast {
  const episodeEvents = events.filter(
    (event) =>
      (event.eventType === "watched" || event.eventType === "rewatched") &&
      event.episodeId !== null &&
      event.episodeId !== undefined
  );

  const runtimes = episodeEvents
    .map((event) => event.durationMinutes)
    .filter((minutes): minutes is number => typeof minutes === "number" && minutes > 0);
  const averageEpisodeMinutes = runtimes.length
    ? runtimes.reduce((sum, minutes) => sum + minutes, 0) / runtimes.length
    : FALLBACK_EPISODE_MINUTES;

  const backlogEpisodes = tracked.reduce(
    (sum, series) => sum + Math.max(0, series.totalEpisodes - series.watchedEpisodes),
    0
  );

  const windowStart = subDays(now, PACE_WINDOW_DAYS).toISOString();
  const recentCount = episodeEvents.filter((event) => event.watchedAt >= windowStart).length;
  const episodesPerWeek = recentCount / (PACE_WINDOW_DAYS / 7);

  const catchUpDate =
    backlogEpisodes > 0 && episodesPerWeek > 0
      ? addDays(now, Math.ceil((backlogEpisodes / episodesPerWeek) * 7)).toISOString()
      : null;

  return {
    backlogEpisodes,
    backlogMinutes: Math.round(backlogEpisodes * averageEpisodeMinutes),
    episodesPerWeek: Math.round(episodesPerWeek * 10) / 10,
    catchUpDate,
  };
}

async function loadData(): Promise<{ library: LibraryItem[]; events: ViewingEvent[] }> {
  const [library, events] = await Promise.all([
    libraryRepository.list(),
    invokeCommand<ViewingEvent[]>("list_viewing_events"),
  ]);
  return { library, events };
}

export const statsRepository = {
  async getStats(): Promise<LibraryStats> {
    const data = await loadData();
    return compute(data.library, data.events);
  },
  async getYearSummary(year = new Date().getFullYear()): Promise<YearSummary> {
    const { library, events } = await loadData();
    const selected = events.filter(
      (event) => event.eventType !== "unwatched" && event.watchedAt.startsWith(String(year))
    );
    const titleCounts = new Map<string, number>();
    for (const event of selected) titleCounts.set(event.title, (titleCounts.get(event.title) ?? 0) + 1);
    const genreCounts = new Map<string, number>();
    for (const item of library)
      if (selected.some((event) => event.mediaId === item.mediaId && event.mediaType === item.mediaType))
        for (const genre of item.genres) genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    return {
      year,
      movies: selected.filter((event) => event.mediaType === "movie").length,
      episodes: selected.filter((event) => event.episodeId !== null && event.episodeId !== undefined).length,
      minutes: selected.reduce((sum, event) => sum + (event.durationMinutes ?? 0), 0),
      topTitles: [...titleCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([title, count]) => ({ title, count })),
      favouriteGenre: [...genreCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      activeDays: new Set(selected.map((event) => localDay(event.watchedAt))).size,
    };
  },
  async getForecast(): Promise<WatchForecast> {
    const [tracked, { events }] = await Promise.all([progressRepository.listTrackedSeries(), loadData()]);
    return computeForecast(tracked, events);
  },
  _compute: compute,
  _computeForecast: computeForecast,
};
