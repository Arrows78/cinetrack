import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { enUS, fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { cn } from "@/shared/lib/cn";
import type { TrackingEntry } from "@/types/media";

const MAX_VISIBLE_PER_DAY = 3;

/**
 * Monthly grid view of "dated" tracking entries (releases/episodes — see
 * TrackingEntry.date's own comment; "availability" entries have no fixed
 * date and never appear here), an alternative to TrackingList's default
 * chronological list grouped by date. Own month navigation state, not
 * URL-persisted — a display mode, not a filter that changes what's tracked.
 */
export function TrackingCalendar({ entries }: { entries: TrackingEntry[] }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("fr") ? fr : enUS;
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const entriesByDay = useMemo(() => {
    const map = new Map<string, TrackingEntry[]>();
    for (const entry of entries) {
      if (!entry.date) continue;
      const list = map.get(entry.date) ?? [];
      list.push(entry);
      map.set(entry.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.title.localeCompare(b.title));
    return map;
  }, [entries]);

  // Monday-first grid, matching the app's fr-first locale convention.
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weekdayLabels = days.slice(0, 7).map((day) => format(day, "EEEEEE", { locale }));
  const monthLabel = format(month, "MMMM yyyy", { locale });
  // Named outside the returned JSX (rather than inlined in days.map below) so
  // eslint's i18next/no-literal-string check reads these as date-fns format
  // patterns, not user-facing copy — same pattern as YearActivityCalendar's
  // own countFor/monthLabelForWeek helpers.
  const dayKey = (day: Date) => format(day, "yyyy-MM-dd");
  const dayNumber = (day: Date) => format(day, "d");

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold capitalize">{monthLabel}</p>
        <div className="flex items-center gap-1">
          <IconTooltip label={t("stats.previousMonth")}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("stats.previousMonth")}
              onClick={() => setMonth((current) => subMonths(current, 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
          </IconTooltip>
          <IconTooltip label={t("stats.nextMonth")}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("stats.nextMonth")}
              onClick={() => setMonth((current) => addMonths(current, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </IconTooltip>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-caption text-muted-foreground">
        {weekdayLabels.map((label, index) => (
          <div key={index} className="capitalize">
            {label}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = dayKey(day);
          const dayEntries = entriesByDay.get(key) ?? [];
          const visible = dayEntries.slice(0, MAX_VISIBLE_PER_DAY);
          const overflow = dayEntries.length - visible.length;
          return (
            <div
              key={key}
              className={cn(
                "min-h-24 rounded-lg border border-border/60 p-1.5",
                !isSameMonth(day, month) && "bg-foreground/[0.02] text-muted-foreground/50",
                isToday(day) && "border-primary"
              )}
            >
              <p className={cn("text-caption font-medium", isToday(day) && "text-primary")}>{dayNumber(day)}</p>
              <div className="mt-1 space-y-0.5">
                {visible.map((entry) => (
                  <Link
                    key={entry.id}
                    to={entry.mediaType === "movie" ? "/movies/$movieId" : "/series/$seriesId"}
                    params={
                      entry.mediaType === "movie"
                        ? { movieId: String(entry.mediaId) }
                        : { seriesId: String(entry.mediaId) }
                    }
                    title={entry.title}
                    className="block truncate rounded bg-primary/10 px-1 py-0.5 text-caption text-primary hover:bg-primary/20"
                  >
                    {entry.title}
                  </Link>
                ))}
                {overflow > 0 ? (
                  <p className="text-caption text-muted-foreground">
                    {t("tracking.calendarMoreEntries", { count: overflow })}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
