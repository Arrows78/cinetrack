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
// A streak or a catch-up pace never needs to look back further than this —
// bounds list_recent_viewing_events() so it stays a cheap recent-window
// fetch instead of a profile's entire lifetime of events, no matter how
// long the app has been in use.
const RECENT_EVENTS_WINDOW_DAYS = 400;

interface YearSummary {
  year: number;
  movies: number;
  episodes: number;
  minutes: number;
  topTitles: Array<{ title: string; count: number }>;
  favouriteGenre: string | null;
  activeDays: number;
}

export interface YearlyActivityBucket {
  year: number;
  moviesWatched: number;
  episodesWatched: number;
  minutesWatched: number;
}

interface StatsOverviewDto {
  totals: {
    moviesWatched: number;
    episodesWatched: number;
    minutesWatched: number;
    movieMinutesWatched: number;
    episodeMinutesWatched: number;
    completedSeries: number;
    libraryCompletionPercent: number;
  };
  monthlyActivity: Array<{ month: string; count: number; minutes: number }>;
}

const localDay = (timestamp: string) => format(parseISO(timestamp), "yyyy-MM-dd");

/** Exported for tests only — not part of the statsRepository public surface. */
export function currentStreak(events: ViewingEvent[]): number {
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

/**
 * The longest run of consecutive watch-days within the same bounded window
 * `events` was fetched over (see RECENT_EVENTS_WINDOW_DAYS) — a streak
 * longer than that window can't be observed without an unbounded events
 * fetch, which the "record" isn't worth the extra query for.
 * Exported for tests only — not part of the statsRepository public surface.
 */
export function longestStreak(events: ViewingEvent[]): number {
  const days = [
    ...new Set(events.filter((event) => event.eventType !== "unwatched").map((event) => localDay(event.watchedAt))),
  ].sort();
  let longest = 0;
  let current = 0;
  let previous: Date | null = null;
  for (const day of days) {
    const date = parseISO(day);
    current = previous && addDays(previous, 1).getTime() === date.getTime() ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = date;
  }
  return longest;
}

/**
 * The single calendar day (within the same bounded window as
 * currentStreak/longestStreak) with the most watched movies/episodes — a
 * "biggest binge" record, distinct from the total-time-watched figures
 * elsewhere on the page. Exported for tests only — not part of the
 * statsRepository public surface.
 */
export function biggestBingeDay(events: ViewingEvent[]): { day: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.eventType === "unwatched") continue;
    const day = localDay(event.watchedAt);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const [day, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  return day && count ? { day, count } : null;
}

const HEATMAP_HOURS = 24;
const HEATMAP_DAYS = 7;

/**
 * One bucket per (day-of-week, hour) pair with at least one watch, over the
 * same bounded window as currentStreak/longestStreak. `day` is JS's
 * Sunday-first 0-6. Exported for tests only — not part of the
 * statsRepository public surface.
 */
export function viewingHeatmap(events: ViewingEvent[]): Array<{ day: number; hour: number; count: number }> {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.eventType === "unwatched") continue;
    const date = parseISO(event.watchedAt);
    const key = `${date.getDay()}-${date.getHours()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const buckets: Array<{ day: number; hour: number; count: number }> = [];
  for (let day = 0; day < HEATMAP_DAYS; day += 1) {
    for (let hour = 0; hour < HEATMAP_HOURS; hour += 1) {
      buckets.push({ day, hour, count: counts.get(`${day}-${hour}`) ?? 0 });
    }
  }
  return buckets;
}

/**
 * The two figures only the (much smaller, slower-growing) library table can
 * answer. Exported for tests only — not part of the statsRepository public
 * surface.
 */
export function libraryExtras(library: LibraryItem[]): {
  favouriteGenres: Array<{ name: string; count: number }>;
  averageUserRating: number | null;
  favouriteGenreByRating: string | null;
  mostRewatchedTitle: { title: string; count: number } | null;
} {
  const genres = new Map<string, number>();
  for (const item of library) for (const genre of item.genres) genres.set(genre, (genres.get(genre) ?? 0) + 1);
  const ratings = library
    .map((item) => item.userRating)
    .filter((rating): rating is number => rating !== null && rating !== undefined);

  // Sum + count per genre from rated items only, so an unrated item can't
  // silently drag a genre's average down to a misleading number.
  const genreRatingSums = new Map<string, { sum: number; count: number }>();
  for (const item of library) {
    if (item.userRating === null || item.userRating === undefined) continue;
    for (const genre of item.genres) {
      const entry = genreRatingSums.get(genre) ?? { sum: 0, count: 0 };
      entry.sum += item.userRating;
      entry.count += 1;
      genreRatingSums.set(genre, entry);
    }
  }
  const favouriteGenreByRating =
    [...genreRatingSums.entries()].sort((a, b) => b[1].sum / b[1].count - a[1].sum / a[1].count)[0]?.[0] ?? null;

  const mostRewatched = library
    .filter((item) => item.rewatchCount > 0)
    .sort((a, b) => b.rewatchCount - a.rewatchCount)[0];

  return {
    favouriteGenres: [...genres.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count })),
    averageUserRating: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null,
    favouriteGenreByRating,
    mostRewatchedTitle: mostRewatched ? { title: mostRewatched.title, count: mostRewatched.rewatchCount } : null,
  };
}

export interface MonthComparison {
  current: { count: number; minutes: number };
  previous: { count: number; minutes: number };
  countDelta: number;
  minutesDelta: number;
}

/**
 * The current month vs. the one before it, both already present in
 * `monthlyActivity`'s trailing entries — no extra fetch needed. Returns
 * `null` for a profile too new to have two months of data yet.
 * Exported for tests only — not part of the statsRepository public surface.
 */
export function monthOverMonthComparison(
  monthlyActivity: Array<{ month: string; count: number; minutes: number }>
): MonthComparison | null {
  if (monthlyActivity.length < 2) return null;
  const current = monthlyActivity[monthlyActivity.length - 1]!;
  const previous = monthlyActivity[monthlyActivity.length - 2]!;
  return {
    current: { count: current.count, minutes: current.minutes },
    previous: { count: previous.count, minutes: previous.minutes },
    countDelta: current.count - previous.count,
    minutesDelta: current.minutes - previous.minutes,
  };
}

/** Exported for tests only — not part of the statsRepository public surface. */
export function computeForecast(tracked: TrackedSeriesItem[], events: ViewingEvent[], now = new Date()): WatchForecast {
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

function recentEventsSince(): string {
  return subDays(new Date(), RECENT_EVENTS_WINDOW_DAYS).toISOString();
}

async function loadRecentEvents(): Promise<ViewingEvent[]> {
  return invokeCommand<ViewingEvent[]>("list_recent_viewing_events", { since: recentEventsSince() });
}

export const statsRepository = {
  async getStats(): Promise<LibraryStats> {
    const now = new Date();
    const windowStart = startOfMonth(subMonths(now, 11));
    const monthLabels = eachMonthOfInterval({ start: windowStart, end: endOfMonth(now) }).map((date) =>
      format(date, "yyyy-MM")
    );

    const [library, overview, recentEvents] = await Promise.all([
      libraryRepository.list(),
      invokeCommand<StatsOverviewDto>("get_stats_overview", {
        windowStart: windowStart.toISOString(),
        monthLabels,
      }),
      loadRecentEvents(),
    ]);

    const extras = libraryExtras(library);

    return {
      moviesWatched: overview.totals.moviesWatched,
      episodesWatched: overview.totals.episodesWatched,
      minutesWatched: overview.totals.minutesWatched,
      movieMinutesWatched: overview.totals.movieMinutesWatched,
      episodeMinutesWatched: overview.totals.episodeMinutesWatched,
      completedSeries: overview.totals.completedSeries,
      averageUserRating: extras.averageUserRating,
      favouriteGenres: extras.favouriteGenres,
      favouriteGenreByRating: extras.favouriteGenreByRating,
      mostRewatchedTitle: extras.mostRewatchedTitle,
      monthlyActivity: overview.monthlyActivity,
      currentStreakDays: currentStreak(recentEvents),
      longestStreakDays: longestStreak(recentEvents),
      biggestBingeDay: biggestBingeDay(recentEvents),
      libraryCompletionPercent: overview.totals.libraryCompletionPercent,
      heatmap: viewingHeatmap(recentEvents),
    };
  },
  async getYearSummary(year = new Date().getFullYear()): Promise<YearSummary> {
    const [library, selected] = await Promise.all([
      libraryRepository.list(),
      invokeCommand<ViewingEvent[]>("list_viewing_events_for_year", {
        rangeStart: `${year}-01-01T00:00:00.000Z`,
        rangeEnd: `${year + 1}-01-01T00:00:00.000Z`,
      }).then((events) => events.filter((event) => event.eventType !== "unwatched")),
    ]);
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
    const [tracked, events] = await Promise.all([progressRepository.listTrackedSeries(), loadRecentEvents()]);
    return computeForecast(tracked, events);
  },
  // One bucket per calendar year with at least one watch — powers the Stats
  // page's year-over-year chart and bounds its year switcher, in one query
  // instead of probing getYearSummary one year at a time.
  async getYearlyActivity(): Promise<YearlyActivityBucket[]> {
    return invokeCommand<YearlyActivityBucket[]>("list_yearly_activity");
  },
};
