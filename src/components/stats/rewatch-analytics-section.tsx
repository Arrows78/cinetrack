import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Repeat } from "lucide-react";
import { useRewatchStats } from "@/features/stats/use-stats";
import { Panel } from "@/components/ui/panel";
import { Tile } from "@/components/ui/tile";
import { ActivityBarChart } from "@/components/media/activity/activity-bar-chart";
import { logger } from "@/shared/lib/logger";

/**
 * Rewatch analytics panel — builds beyond the existing "most rewatched"
 * record card (see stats-page.tsx's Records section) with a total count, a
 * share of all watches, a ranked comfort-title list, and a monthly trend.
 * Every figure here is deliberately event-log-based, not deduped to
 * current state: a rewatch is itself a historical action, so it stays
 * counted even if the title was later unwatched.
 */
export function RewatchAnalyticsSection() {
  const { t } = useTranslation();
  const rewatch = useRewatchStats();

  useEffect(() => {
    if (rewatch.isError) {
      logger.warn(
        `Rewatch stats failed to load: ${rewatch.error instanceof Error ? rewatch.error.message : String(rewatch.error)}`
      );
    }
  }, [rewatch.isError, rewatch.error]);

  if (rewatch.isError || !rewatch.data) return null;

  const data = rewatch.data;

  return (
    <Panel>
      <h2 className="text-heading-sm">{t("stats.rewatch.title")}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Tile className="p-3">
          <Repeat className="size-4 text-primary" aria-hidden="true" />
          <p className="mt-2 text-xs text-muted-foreground">{t("stats.rewatch.totalRewatches")}</p>
          <p className="mt-1 font-display text-2xl font-bold">{data.totalRewatches}</p>
        </Tile>
        <Tile className="p-3">
          <p className="text-xs text-muted-foreground">{t("stats.rewatch.rewatchShare")}</p>
          <p className="mt-1 font-display text-2xl font-bold">{data.rewatchSharePercent}%</p>
        </Tile>
      </div>
      {data.favouriteComfortTitles.length ? (
        <div className="mt-4">
          <p className="text-sm font-medium">{t("stats.rewatch.comfortTitles")}</p>
          <div className="mt-2 grid gap-2">
            {data.favouriteComfortTitles.map((title) => (
              <Tile key={title.title} className="flex justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{title.title}</span>
                <strong className="shrink-0 text-muted-foreground">
                  {t("stats.rewatchCount", { count: title.count })}
                </strong>
              </Tile>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-4">
        <p className="text-sm font-medium">{t("stats.rewatch.activityTitle")}</p>
        <ActivityBarChart
          data={data.rewatchActivity.map((bucket) => ({ label: bucket.month.slice(5), value: bucket.count }))}
          tooltipLabel={t("stats.rewatch.rewatches")}
          highlightLast
        />
      </div>
    </Panel>
  );
}
