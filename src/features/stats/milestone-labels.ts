import { Clapperboard, Clock, ListVideo, Tv } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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

// Gives each milestone category its own badge identity — every threshold
// within a category previously rendered the exact same generic trophy/lock
// glyph, telling "10 movies" and "500 episodes" apart only by their text.
export const MILESTONE_CATEGORY_ICON: Record<MilestoneCategory, LucideIcon> = {
  episodes: ListVideo,
  movies: Clapperboard,
  hours: Clock,
  series: Tv,
};
