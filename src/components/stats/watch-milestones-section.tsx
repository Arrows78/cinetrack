import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Lock, Trophy } from "lucide-react";
import { useWatchMilestones } from "@/features/stats/use-stats";
import { Panel } from "@/components/ui/panel";
import { Tile } from "@/components/ui/tile";
import { Badge } from "@/components/ui/badge";
import { logger } from "@/features/diagnostics/logger";
import { formatDate } from "@/shared/utils/format";
import { cn } from "@/shared/lib/cn";
import type { MilestoneCategory } from "@/types/media";

const THRESHOLD_KEY: Record<MilestoneCategory, string> = {
  episodes: "stats.milestones.episodesThreshold",
  movies: "stats.milestones.moviesThreshold",
  hours: "stats.milestones.hoursThreshold",
  series: "stats.milestones.seriesThreshold",
};

/**
 * Watch milestones — threshold-crossing achievements, computed from the
 * same current-state semantics as get_stats_overview's headline totals
 * (episodes/movies/hours read the latest event per title, not a raw
 * event-log sum; completed series reads library_items' current status), so
 * unwatching something can un-achieve a milestone exactly like it reduces
 * the Stats page's own totals above.
 */
export function WatchMilestonesSection() {
  const { t } = useTranslation();
  const milestones = useWatchMilestones();

  useEffect(() => {
    if (milestones.isError) {
      logger.warn(
        `Watch milestones failed to load: ${
          milestones.error instanceof Error ? milestones.error.message : String(milestones.error)
        }`
      );
    }
  }, [milestones.isError, milestones.error]);

  if (milestones.isError || !milestones.data) return null;

  return (
    <Panel>
      <h2 className="font-semibold">{t("stats.milestones.title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("stats.milestones.description")}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {milestones.data.map((milestone) => (
          <Tile
            key={milestone.id}
            className={cn("flex items-start gap-3 p-3", milestone.achieved && "border-primary/30 bg-primary/5")}
          >
            {milestone.achieved ? (
              <Trophy className="size-5 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <Lock className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {t(THRESHOLD_KEY[milestone.category], { count: milestone.threshold })}
              </p>
              {milestone.achieved ? (
                <Badge variant="success" className="mt-1">
                  {milestone.achievedAt ? formatDate(milestone.achievedAt) : t("stats.milestones.achieved")}
                </Badge>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("stats.milestones.progress", { current: milestone.currentValue, target: milestone.threshold })}
                </p>
              )}
            </div>
          </Tile>
        ))}
      </div>
    </Panel>
  );
}
