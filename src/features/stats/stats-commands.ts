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
// Every month/year/day/hour bucket is the viewer's local calendar one, not
// UTC's. `timeZone` is the viewer's IANA identifier (`Europe/Paris`), which
// Rust applies per event so daylight saving is right all year round (an
// unknown identifier is rejected, not ignored); `tzOffsetMinutes` is JS's
// getTimezoneOffset() of one instant, the fixed-offset fallback used only
// when `timeZone` is null.
type ZoneArgs = { tzOffsetMinutes: number; timeZone: string | null };
type StatsOverviewArgs = ZoneArgs & { windowStart: string; monthLabels: string[] };
type OnThisDayArgs = ZoneArgs & { today: string };
type YearlyActivityArgs = ZoneArgs;
type MonthlyRecapArgs = ZoneArgs & {
  month: string;
  rangeStart: string;
  rangeEnd: string;
};
type RewatchStatsArgs = ZoneArgs & { windowStart: string; monthLabels: string[] };
type RatingDistributionArgs = ZoneArgs & { windowStart: string };
type ActivityStatsArgs = ZoneArgs & { since: string; today: string };
type WatchForecastArgs = { since: string; paceWindowStart: string; now: string };

export const statsCommands = {
  listRecentViewingEvents: defineCommand<SinceArgs, ViewingEvent[]>("list_recent_viewing_events"),
  getOverview: defineCommand<StatsOverviewArgs, StatsOverview>("get_stats_overview"),
  listViewingEventsForYear: defineCommand<YearRangeArgs, ViewingEvent[]>("list_viewing_events_for_year"),
  getYearFavouriteGenre: defineCommand<YearRangeArgs, string | null>("get_year_favourite_genre"),
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
