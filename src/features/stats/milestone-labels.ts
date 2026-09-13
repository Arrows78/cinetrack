import type { MilestoneCategory } from "@/types/media";

// Single source of truth for category -> i18n key, shared by the Stats page's
// WatchMilestonesSection and MilestoneCelebrationController (layout) so the
// two never drift on which key backs which category.
export const MILESTONE_THRESHOLD_KEY: Record<MilestoneCategory, string> = {
  episodes: "stats.milestones.episodesThreshold",
  movies: "stats.milestones.moviesThreshold",
  hours: "stats.milestones.hoursThreshold",
  series: "stats.milestones.seriesThreshold",
};
