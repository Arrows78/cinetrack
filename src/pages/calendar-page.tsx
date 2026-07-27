import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { CalendarDays, Film, Tv } from "lucide-react";
import { useEffect } from "react";
import { useCalendar } from "@/features/calendar/use-calendar";
import type { CalendarEntry } from "@/types/media";
import { usePreferences } from "@/features/preferences/use-preferences";
import { notificationService } from "@/features/desktop/notification-service";

export function CalendarPage() {
  const { t } = useTranslation();
  const calendar = useCalendar();
  const preferences = usePreferences();
  useEffect(() => { if (calendar.data && preferences.data) void notificationService.notifyDue(calendar.data, preferences.data); }, [calendar.data, preferences.data]);
  const groups = (calendar.data ?? []).reduce<Record<string, CalendarEntry[]>>((acc, entry) => {
    (acc[entry.date] ??= []).push(entry);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <header><div className="flex items-center gap-3"><CalendarDays className="size-7 text-primary" /><h1 className="font-display text-3xl font-bold">{t("calendar.title")}</h1></div><p className="mt-1 text-muted-foreground">{t("calendar.description")}</p></header>
      {calendar.isLoading ? <p className="text-muted-foreground">{t("calendar.loading")}</p> : null}
      {Object.entries(groups).map(([date, entries]) => (
        <section key={date} className="rounded-3xl border border-border bg-card/60 p-5">
          <h2 className="font-semibold capitalize">{format(parseISO(date), "EEEE d MMMM yyyy")}</h2>
          <div className="mt-3 grid gap-2">
            {entries?.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-3">
                {entry.kind === "episode" ? <Tv className="size-4 text-primary" /> : <Film className="size-4 text-primary" />}
                <div><p className="font-medium">{entry.title}</p><p className="text-sm text-muted-foreground">{entry.kind === "episode" ? `S${entry.seasonNumber}E${entry.episodeNumber} · ${entry.episodeTitle ?? t("calendar.newEpisode")}` : t("calendar.theatricalRelease")}</p></div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {!calendar.isLoading && !calendar.data?.length ? <p className="rounded-3xl border border-dashed border-border p-8 text-center text-muted-foreground">{t("calendar.noUpcoming")}</p> : null}
    </div>
  );
}
