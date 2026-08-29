import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useRatingDistribution } from "@/features/stats/use-stats";
import { Panel } from "@/components/ui/panel";
import { ActivityBarChart } from "@/components/media/activity/activity-bar-chart";
import { logger } from "@/shared/lib/logger";

const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10;

/**
 * Rating distribution & evolution panel. `distribution` reads
 * library_items.user_rating current-state — a changed rating is reflected
 * immediately, since the schema keeps no history of past values.
 * `averageByMonth`/`averageByYear` are historical breakdowns instead (same
 * exception as the Stats page's other monthly/yearly activity charts):
 * which month a title was watched in doesn't change in hindsight, even
 * though the rating read for it is always the title's current rating.
 */
export function RatingDistributionSection() {
  const { t } = useTranslation();
  const distribution = useRatingDistribution();

  useEffect(() => {
    if (distribution.isError) {
      logger.warn(
        `Rating distribution failed to load: ${
          distribution.error instanceof Error ? distribution.error.message : String(distribution.error)
        }`
      );
    }
  }, [distribution.isError, distribution.error]);

  if (distribution.isError || !distribution.data) return null;

  const data = distribution.data;
  if (!data.distribution.length) return null;

  return (
    <Panel>
      <h2 className="font-semibold">{t("stats.ratingDistribution.title")}</h2>
      <ActivityBarChart
        data={data.distribution.map((bucket) => ({ label: bucket.rating.toString(), value: bucket.count }))}
        tooltipLabel={t("stats.ratingDistribution.titlesLabel")}
      />
      {data.averageByMonth.length ? (
        <div className="mt-6">
          <p className="text-sm font-medium">{t("stats.ratingDistribution.byMonth")}</p>
          <ActivityBarChart
            data={data.averageByMonth.map((row) => ({
              label: row.period.slice(5),
              value: roundToOneDecimal(row.average),
            }))}
            tooltipLabel={t("stats.averageRating")}
            highlightLast
          />
        </div>
      ) : null}
      {data.averageByYear.length ? (
        <div className="mt-6">
          <p className="text-sm font-medium">{t("stats.ratingDistribution.byYear")}</p>
          <ActivityBarChart
            data={data.averageByYear.map((row) => ({ label: row.period, value: roundToOneDecimal(row.average) }))}
            tooltipLabel={t("stats.averageRating")}
            highlightLast
          />
        </div>
      ) : null}
    </Panel>
  );
}
