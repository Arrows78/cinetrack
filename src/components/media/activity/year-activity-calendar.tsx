import { Fragment } from "react";
import { eachDayOfInterval, endOfYear, format, getDay, startOfYear } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
// A Sunday-first reference week (2023-01-01 was a Sunday) purely so Intl/
// date-fns can derive a localized weekday label per index — matches
// ViewingHeatmap's own REFERENCE_SUNDAY, so both grids label weekdays the
// same way.
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
 * GitHub/GitLab-style full-year contribution calendar: one column per week,
 * one row per weekday (Sunday first, matching ViewingHeatmap's own
 * convention and visual language — same cell size/rounding/intensity scale,
 * same leading label column/row structure, same legend), colored by watch
 * count that day. `dailyCounts` only needs entries for days with at least
 * one watch — see stats-repository.ts's getYearSummary.
 *
 * Weeks and weekdays share one CSS grid (not two separately-sized grids for
 * cells vs. month labels) so a month label's column always lines up with
 * the week column it actually labels — a `grid-auto-flow: column` layout
 * split across two independently-sized `inline-grid` elements can't
 * guarantee that.
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
  // Sunday = 0 — days before the year's first weekday stay blank in week 0.
  const leadingBlanks = getDay(yearStart);
  const weekCount = Math.ceil((leadingBlanks + days.length) / 7);

  // weeks[weekIndex][weekday] — a real Date, or null for a blank leading/
  // trailing cell. Built once so weekday-rows and month-label lookups both
  // read from the same week→weekday→date mapping the grid renders from.
  const weeks: (Date | null)[][] = Array.from({ length: weekCount }, () => Array<Date | null>(7).fill(null));
  days.forEach((day, index) => {
    const cellIndex = leadingBlanks + index;
    weeks[Math.floor(cellIndex / 7)]![cellIndex % 7] = day;
  });

  const max = Math.max(1, ...Object.values(dailyCounts));
  const countFor = (day: Date) => dailyCounts[format(day, "yyyy-MM-dd")] ?? 0;
  // A week gets a month label only when it's the week containing that
  // month's 1st — one label per month, never a repeat down the row.
  const monthLabelForWeek = (weekIndex: number) => {
    const firstOfMonth = weeks[weekIndex]!.find((day) => day?.getDate() === 1);
    return firstOfMonth ? format(firstOfMonth, "MMM", { locale }) : "";
  };
  const weekdayLabel = (weekday: number) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: "short" }).format(
      new Date(REFERENCE_SUNDAY.getFullYear(), REFERENCE_SUNDAY.getMonth(), REFERENCE_SUNDAY.getDate() + weekday)
    );

  return (
    <div className={cn("mt-5 overflow-x-auto", className)}>
      <div
        aria-hidden="true"
        className="inline-grid gap-1"
        style={{ gridTemplateColumns: `2rem repeat(${weekCount}, minmax(0.65rem, 1fr))` }}
      >
        <div />
        {weeks.map((_, weekIndex) => (
          <div key={weekIndex} className="text-left text-[0.6rem] leading-none text-muted-foreground">
            {monthLabelForWeek(weekIndex)}
          </div>
        ))}
        {WEEKDAYS.map((weekday) => (
          <Fragment key={weekday}>
            <div className="flex items-center pr-2 text-caption text-muted-foreground">{weekdayLabel(weekday)}</div>
            {weeks.map((week, weekIndex) => {
              const day = week[weekday];
              if (!day) return <div key={weekIndex} />;
              return (
                <div
                  key={weekIndex}
                  title={t("stats.yearCalendar.cellTitle", {
                    date: format(day, "PP", { locale }),
                    count: countFor(day),
                  })}
                  className={cn(
                    "aspect-square rounded-sm transition-shadow hover:ring-2 hover:ring-inset hover:ring-foreground/50",
                    intensityClass(countFor(day), max)
                  )}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-caption text-muted-foreground" aria-hidden="true">
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
