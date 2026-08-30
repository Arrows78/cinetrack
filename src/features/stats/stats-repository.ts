import { eachMonthOfInterval, endOfMonth, format, parseISO, startOfMonth, subDays, subMonths } from "date-fns";
import { statsCommands, type YearlyActivityBucket } from "@/features/stats/stats-commands";
import { invokeTypedCommand } from "@/shared/lib/invoke";
import { libraryRepository } from "@/features/library/library-repository";
import type {
  LibraryStats,
  MonthlyRecap,
  RatingDistribution,
  RewatchStats,
  ViewingEvent,
  WatchForecast,
  WatchMilestone,
} from "@/types/media";

export type { WatchForecast } from "@/types/media";

const PACE_WINDOW_DAYS = 60;
// A streak or a catch-up pace never needs to look back further than this —
// bounds list_recent_viewing_events()/get_activity_stats/get_watch_forecast
// so they stay a cheap recent-window fetch instead of a profile's entire
// lifetime of events, no matter how long the app has been in use.
const RECENT_EVENTS_WINDOW_DAYS = 400;

/** Filter out "unwatched" rollbacks — only active watch events count. */
function activeEvents(events: ViewingEvent[]): ViewingEvent[] {
  return events.filter((event) => event.eventType !== "unwatched");
}

interface YearSummary {
  year: number;
  movies: number;
  episodes: number;
  minutes: number;
  topTitles: Array<{ title: string; count: number }>;
  favouriteGenre: string | null;
  activeDays: number;
}

export type { YearlyActivityBucket } from "@/features/stats/stats-commands";

const localDay = (timestamp: string) => format(parseISO(timestamp), "yyyy-MM-dd");

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

function recentEventsSince(now: Date): string {
  return subDays(now, RECENT_EVENTS_WINDOW_DAYS).toISOString();
}

/**
 * The trailing-12-months window `get_stats_overview` already scopes its own
 * `monthlyActivity` to — reused as-is by the rewatch-analytics and
 * rating-evolution commands below so they zero-fill the exact same 12 months
 * the "Activity over 12 months" chart does. Exported for tests only — not
 * part of the statsRepository public surface.
 */
export function trailing12MonthsWindow(now = new Date()): { windowStart: Date; monthLabels: string[] } {
  const windowStart = startOfMonth(subMonths(now, 11));
  const monthLabels = eachMonthOfInterval({ start: windowStart, end: endOfMonth(now) }).map((date) =>
    format(date, "yyyy-MM")
  );
  return { windowStart, monthLabels };
}

export const statsRepository = {
  async getStats(): Promise<LibraryStats> {
    const now = new Date();
    const { windowStart, monthLabels } = trailing12MonthsWindow(now);
    const since = recentEventsSince(now);

    const [overview, activity, extras] = await Promise.all([
      invokeTypedCommand(statsCommands.getOverview, {
        windowStart: windowStart.toISOString(),
        monthLabels,
      }),
      invokeTypedCommand(statsCommands.getActivityStats, {
        since,
        today: now.toISOString(),
        tzOffsetMinutes: now.getTimezoneOffset(),
      }),
      invokeTypedCommand(statsCommands.getLibraryExtras),
    ]);

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
      currentStreakDays: activity.currentStreakDays,
      longestStreakDays: activity.longestStreakDays,
      biggestBingeDay: activity.biggestBingeDay,
      libraryCompletionPercent: overview.totals.libraryCompletionPercent,
      heatmap: activity.heatmap,
    };
  },
  async getYearSummary(year = new Date().getFullYear()): Promise<YearSummary> {
    const [library, selected] = await Promise.all([
      libraryRepository.list(),
      invokeTypedCommand(statsCommands.listViewingEventsForYear, {
        rangeStart: `${year}-01-01T00:00:00.000Z`,
        rangeEnd: `${year + 1}-01-01T00:00:00.000Z`,
      }).then(activeEvents),
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
    const now = new Date();
    return invokeTypedCommand(statsCommands.getWatchForecast, {
      since: recentEventsSince(now),
      paceWindowStart: subDays(now, PACE_WINDOW_DAYS).toISOString(),
      now: now.toISOString(),
    });
  },
  // One bucket per calendar year with at least one watch — powers the Stats
  // page's year-over-year chart and bounds its year switcher, in one query
  // instead of probing getYearSummary one year at a time.
  async getYearlyActivity(): Promise<YearlyActivityBucket[]> {
    return invokeTypedCommand(statsCommands.listYearlyActivity);
  },
  // Powers the opt-in "On this day" Home card — every past-year watch whose
  // watched_at falls on today's month-day, most recent year first. `today`
  // is passed explicitly (defaulting to right now) rather than letting the
  // Rust side read its own clock, mirroring getYearSummary's rangeStart/
  // rangeEnd above, so a fixed reference date stays trivial to test.
  async getOnThisDayEvents(today = new Date().toISOString()): Promise<ViewingEvent[]> {
    return invokeTypedCommand(statsCommands.listOnThisDayEvents, { today });
  },
  // `month` is a "YYYY-MM" label; rangeStart/rangeEnd are built as literal
  // UTC-midnight boundaries — like getYearSummary's rangeStart/rangeEnd
  // above, deliberately NOT routed through a local `Date`/`toISOString()`
  // round trip, which would shift the boundary by the caller's UTC offset
  // and no longer line up with the UTC month buckets `watched_at` is stored
  // and grouped in on the Rust side.
  async getMonthlyRecap(month: string): Promise<MonthlyRecap> {
    const year = Number(month.slice(0, 4));
    const monthNumber = Number(month.slice(5, 7));
    const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
    const nextYear = monthNumber === 12 ? year + 1 : year;
    return invokeTypedCommand(statsCommands.getMonthlyRecap, {
      month,
      rangeStart: `${month}-01T00:00:00.000Z`,
      rangeEnd: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00.000Z`,
    });
  },
  async getRewatchStats(): Promise<RewatchStats> {
    const { windowStart, monthLabels } = trailing12MonthsWindow();
    return invokeTypedCommand(statsCommands.getRewatchStats, {
      windowStart: windowStart.toISOString(),
      monthLabels,
    });
  },
  async getRatingDistribution(): Promise<RatingDistribution> {
    const { windowStart } = trailing12MonthsWindow();
    return invokeTypedCommand(statsCommands.getRatingDistribution, {
      windowStart: windowStart.toISOString(),
    });
  },
  async getWatchMilestones(): Promise<WatchMilestone[]> {
    return invokeTypedCommand(statsCommands.getWatchMilestones);
  },
};
