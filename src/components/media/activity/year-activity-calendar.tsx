import { eachDayOfInterval, endOfYear, format, getDay, isSameMonth, startOfYear } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";

function intensityClass(count: number, max: number): string {
  if (count === 0) return "bg-foreground/[0.04]";
  const ratio = count / max;
  if (ratio > 0.75) return "bg-primary";
  if (ratio > 0.5) return "bg-primary/70";
  if (ratio > 0.25) return "bg-primary/45";
  return "bg-primary/25";
}

/**
 * GitHub/GitLab-style full-year contribution calendar: one column per week,
 * one row per weekday (Sunday first, matching ViewingHeatmap's convention),
 * colored by watch count that day. `dailyCounts` only needs entries for
 * days with at least one watch — see stats-repository.ts's getYearSummary.
 */
export function YearActivityCalendar({
  year,
  dailyCounts,
  className,
}: {
  year: number;
  dailyCounts: Record<string, number>;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("fr") ? fr : enUS;
  const yearStart = startOfYear(new Date(year, 0, 1));
  const days = eachDayOfInterval({ start: yearStart, end: endOfYear(yearStart) });
  // Sunday = 0, matching ViewingHeatmap's own day-of-week convention — blank
  // cells so January 1st lands in its real weekday row, not always row 0.
  const leadingBlanks = getDay(yearStart);
  const cells: Array<Date | null> = [...Array<null>(leadingBlanks).fill(null), ...days];
  const weekCount = Math.ceil(cells.length / 7);
  const max = Math.max(1, ...Object.values(dailyCounts));
  const countFor = (day: Date) => dailyCounts[format(day, "yyyy-MM-dd")] ?? 0;

  // One label per month, placed above the week-column its 1st falls in.
  const monthLabels = Array.from({ length: 12 }, (_, month) => {
    const firstOfMonth = new Date(year, month, 1);
    const dayIndex = days.findIndex((day) => isSameMonth(day, firstOfMonth));
    return {
      key: month,
      label: format(firstOfMonth, "MMM", { locale }),
      column: Math.floor((leadingBlanks + dayIndex) / 7) + 1,
    };
  });

  return (
    <div className={cn("overflow-x-auto", className)}>
      <div
        aria-hidden="true"
        className="inline-grid gap-1 text-[0.65rem] leading-none text-muted-foreground"
        style={{ gridTemplateColumns: `repeat(${weekCount}, minmax(0.65rem, 1fr))` }}
      >
        {monthLabels.map(({ key, label, column }) => (
          <div key={key} style={{ gridColumn: column, gridRow: 1 }}>
            {label}
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="mt-1 inline-grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${weekCount}, minmax(0.65rem, 1fr))`,
          gridTemplateRows: "repeat(7, minmax(0.65rem, 1fr))",
          gridAutoFlow: "column",
        }}
      >
        {cells.map((day, index) =>
          day ? (
            <div
              key={day.toISOString()}
              title={t("stats.yearCalendar.cellTitle", { date: format(day, "PP", { locale }), count: countFor(day) })}
              className={cn(
                "aspect-square rounded-sm transition-shadow hover:ring-2 hover:ring-inset hover:ring-foreground/50",
                intensityClass(countFor(day), max)
              )}
            />
          ) : (
            <div key={`blank-${index}`} />
          )
        )}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-xs text-muted-foreground" aria-hidden="true">
        <span>{t("stats.heatmap.less")}</span>
        <div className="flex gap-1">
          <span className="size-3 rounded-sm bg-foreground/[0.04]" />
          <span className="size-3 rounded-sm bg-primary/25" />
          <span className="size-3 rounded-sm bg-primary/45" />
          <span className="size-3 rounded-sm bg-primary/70" />
          <span className="size-3 rounded-sm bg-primary" />
        </div>
        <span>{t("stats.heatmap.more")}</span>
      </div>
      {/* Same rationale as ViewingHeatmap's own sr-only table: a wrapping
          div (not the table itself) carries sr-only, since a table's
          default auto layout ignores width/height:0 and would otherwise
          size to its 365-ish rows regardless. */}
      <div className="sr-only">
        <table>
          <caption>{t("stats.yearCalendar.title", { year })}</caption>
          <thead>
            <tr>
              <th scope="col">{t("stats.heatmap.day")}</th>
              <th scope="col">{t("stats.watches")}</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.toISOString()}>
                <td>{format(day, "PP", { locale })}</td>
                <td>{countFor(day)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
