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
type StatsOverviewArgs = { windowStart: string; monthLabels: string[] };
type OnThisDayArgs = { today: string };
type MonthlyRecapArgs = {
  month: string;
  rangeStart: string;
  rangeEnd: string;
};
type RewatchStatsArgs = { windowStart: string; monthLabels: string[] };
type RatingDistributionArgs = { windowStart: string };
type ActivityStatsArgs = { since: string; today: string; tzOffsetMinutes: number };
type WatchForecastArgs = { since: string; paceWindowStart: string; now: string };

export const statsCommands = {
  listRecentViewingEvents: defineCommand<SinceArgs, ViewingEvent[]>("list_recent_viewing_events"),
  getOverview: defineCommand<StatsOverviewArgs, StatsOverview>("get_stats_overview"),
  listViewingEventsForYear: defineCommand<YearRangeArgs, ViewingEvent[]>("list_viewing_events_for_year"),
  listYearlyActivity: defineCommand<undefined, YearlyActivityBucket[]>("list_yearly_activity"),
  listOnThisDayEvents: defineCommand<OnThisDayArgs, ViewingEvent[]>("list_on_this_day_events"),
  getMonthlyRecap: defineCommand<MonthlyRecapArgs, MonthlyRecap>("get_monthly_recap"),
  getRewatchStats: defineCommand<RewatchStatsArgs, RewatchStats>("get_rewatch_stats"),
  getRatingDistribution: defineCommand<RatingDistributionArgs, RatingDistribution>("get_rating_distribution"),
  getWatchMilestones: defineCommand<undefined, WatchMilestone[]>("get_watch_milestones"),
  getActivityStats: defineCommand<ActivityStatsArgs, ActivityStats>("get_activity_stats"),
  getLibraryExtras: defineCommand<undefined, LibraryExtras>("get_library_extras"),
  getWatchForecast: defineCommand<WatchForecastArgs, WatchForecast>("get_watch_forecast"),
} as const;
