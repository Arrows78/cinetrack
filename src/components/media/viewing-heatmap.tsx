import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";

export interface ViewingHeatmapBucket {
  day: number;
  hour: number;
  count: number;
}

const DAYS = [0, 1, 2, 3, 4, 5, 6];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
// A Sunday-first reference week (matches JS's Date#getDay(), which
// viewingHeatmap() buckets by) purely so Intl can derive a localized
// weekday label per index — the actual date is otherwise meaningless.
const REFERENCE_SUNDAY = new Date(2023, 0, 1);

function intensityClass(count: number, max: number): string {
  if (count === 0) return "bg-foreground/[0.04]";
  const ratio = count / max;
  if (ratio > 0.75) return "bg-primary";
  if (ratio > 0.5) return "bg-primary/70";
  if (ratio > 0.25) return "bg-primary/45";
  return "bg-primary/25";
}

/**
 * Day-of-week × hour-of-day grid of watch activity. Horizontally scrollable
 * on its own (rather than the page) since 24 hourly columns don't fit the
 * app's 360px minimum window width — see tauri.conf.json's `minWidth`.
 */
export function ViewingHeatmap({ data, className }: { data: ViewingHeatmapBucket[]; className?: string }) {
  const { t, i18n } = useTranslation();
  const max = Math.max(1, ...data.map((bucket) => bucket.count));
  const countFor = (day: number, hour: number) =>
    data.find((bucket) => bucket.day === day && bucket.hour === hour)?.count ?? 0;
  const dayLabel = (day: number) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: "short" }).format(
      new Date(REFERENCE_SUNDAY.getFullYear(), REFERENCE_SUNDAY.getMonth(), REFERENCE_SUNDAY.getDate() + day)
    );

  return (
    <div className={cn("mt-5 overflow-x-auto", className)}>
      <div
        aria-hidden="true"
        className="inline-grid w-full min-w-[36rem] gap-1"
        style={{ gridTemplateColumns: "2.5rem repeat(24, minmax(0.9rem, 1fr))" }}
      >
        <div />
        {HOURS.map((hour) => (
          <div key={hour} className="text-center text-[0.6rem] leading-none text-muted-foreground">
            {hour % 3 === 0 ? hour : ""}
          </div>
        ))}
        {DAYS.map((day) => (
          <Fragment key={day}>
            <div className="flex items-center pr-2 text-xs text-muted-foreground">{dayLabel(day)}</div>
            {HOURS.map((hour) => {
              const count = countFor(day, hour);
              return (
                <div
                  key={hour}
                  title={t("stats.heatmap.cellTitle", { count })}
                  className={cn("aspect-square rounded-sm", intensityClass(count, max))}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
      <table className="sr-only">
        <caption>{t("stats.heatmap.title")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("stats.heatmap.day")}</th>
            <th scope="col">{t("stats.heatmap.hour")}</th>
            <th scope="col">{t("stats.watches")}</th>
          </tr>
        </thead>
        <tbody>
          {DAYS.flatMap((day) =>
            HOURS.map((hour) => (
              <tr key={`${day}-${hour}`}>
                <td>{dayLabel(day)}</td>
                <td>{hour}</td>
                <td>{countFor(day, hour)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
