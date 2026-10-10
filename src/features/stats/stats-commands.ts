import { defineCommand } from "@/shared/lib/invoke";
import type {
  ActivityStats,
  LibraryExtras,
  MonthlyRecap,
  RatingDistribution,
  RewatchStats,
  StatsOverview,
  ViewingEvent,
  WatchForecast,
  WatchMilestone,
  YearlyActivityBucket,
} from "@/types/media";

export type { YearlyActivityBucket, StatsOverview };

type SinceArgs = { since: string };
type YearRangeArgs = { rangeStart: string; rangeEnd: string };
// `tzOffsetMinutes` is JS's getTimezoneOffset(): every month/year/day
// bucket is the viewer's local calendar one, not UTC's.
type StatsOverviewArgs = { windowStart: string; monthLabels: string[]; tzOffsetMinutes: number };
type OnThisDayArgs = { today: string; tzOffsetMinutes: number };
type YearlyActivityArgs = { tzOffsetMinutes: number };
type MonthlyRecapArgs = {
  month: string;
  rangeStart: string;
  rangeEnd: string;
  tzOffsetMinutes: number;
};
type RewatchStatsArgs = { windowStart: string; monthLabels: string[]; tzOffsetMinutes: number };
type RatingDistributionArgs = { windowStart: string; tzOffsetMinutes: number };
type ActivityStatsArgs = { since: string; today: string; tzOffsetMinutes: number };
type WatchForecastArgs = { since: string; paceWindowStart: string; now: string };

export const statsCommands = {
  listRecentViewingEvents: defineCommand<SinceArgs, ViewingEvent[]>("list_recent_viewing_events"),
  getOverview: defineCommand<StatsOverviewArgs, StatsOverview>("get_stats_overview"),
  listViewingEventsForYear: defineCommand<YearRangeArgs, ViewingEvent[]>("list_viewing_events_for_year"),
  listYearlyActivity: defineCommand<YearlyActivityArgs, YearlyActivityBucket[]>("list_yearly_activity"),
  listOnThisDayEvents: defineCommand<OnThisDayArgs, ViewingEvent[]>("list_on_this_day_events"),
  getMonthlyRecap: defineCommand<MonthlyRecapArgs, MonthlyRecap>("get_monthly_recap"),
  getRewatchStats: defineCommand<RewatchStatsArgs, RewatchStats>("get_rewatch_stats"),
  getRatingDistribution: defineCommand<RatingDistributionArgs, RatingDistribution>("get_rating_distribution"),
  getWatchMilestones: defineCommand<undefined, WatchMilestone[]>("get_watch_milestones"),
  getActivityStats: defineCommand<ActivityStatsArgs, ActivityStats>("get_activity_stats"),
  getLibraryExtras: defineCommand<undefined, LibraryExtras>("get_library_extras"),
  getWatchForecast: defineCommand<WatchForecastArgs, WatchForecast>("get_watch_forecast"),
} as const;
