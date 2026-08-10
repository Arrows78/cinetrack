import { useTranslation } from "react-i18next";
import { CalendarDays, Film, Tv } from "lucide-react";
import { useEffect } from "react";
import { useCalendar } from "@/features/calendar/use-calendar";
import type { CalendarEntry } from "@/types/media";
import { usePreferences } from "@/features/preferences/use-preferences";
import { notificationService } from "@/features/desktop/notification-service";
import { EmptyState } from "@/components/states/empty-state";
import { LoadingState } from "@/components/states/loading-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { Panel } from "@/components/ui/panel";
import { Tile } from "@/components/ui/tile";
import { staggerDelayMs } from "@/shared/utils/animation";
import { formatEpisodeCode, formatFullDate } from "@/shared/utils/format";

export function CalendarPage() {
  const { t } = useTranslation();
  const calendar = useCalendar();
  const preferences = usePreferences();
  useEffect(() => {
    if (calendar.data && preferences.data) void notificationService.notifyDue(calendar.data, preferences.data);
  }, [calendar.data, preferences.data]);
  const groups = (calendar.data ?? []).reduce<Record<string, CalendarEntry[]>>((acc, entry) => {
    (acc[entry.date] ??= []).push(entry);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <header className="animate-in" style={{ animationDelay: `${staggerDelayMs(0)}ms` }}>
        <div className="flex items-center gap-3">
          <CalendarDays className="size-7 text-primary" />
          <h1 className="font-display text-3xl font-bold">{t("calendar.title")}</h1>
        </div>
        <p className="mt-1 text-muted-foreground">{t("calendar.description")}</p>
      </header>
      {calendar.isLoading ? <LoadingState label={t("calendar.loading")} /> : null}
      {calendar.isError ? <RemoteErrorState error={calendar.error} onRetry={() => void calendar.refetch()} /> : null}
      {Object.entries(groups).map(([date, entries], index) => (
        <Panel key={date} className="animate-in" style={{ animationDelay: `${staggerDelayMs(index + 1)}ms` }}>
          <h2 className="font-semibold capitalize">{formatFullDate(date)}</h2>
          <div className="mt-3 grid gap-2">
            {entries?.map((entry) => (
              <Tile key={entry.id} className="flex items-center gap-3 px-3 py-3">
                {entry.kind === "episode" ? (
                  <Tv className="size-4 text-primary" />
                ) : (
                  <Film className="size-4 text-primary" />
                )}
                <div>
                  <p className="font-medium">{entry.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {entry.kind === "episode"
                      ? `${formatEpisodeCode(entry.seasonNumber ?? 0, entry.episodeNumber ?? 0)} · ${entry.episodeTitle ?? t("calendar.newEpisode")}`
                      : t("calendar.theatricalRelease")}
                  </p>
                </div>
              </Tile>
            ))}
          </div>
        </Panel>
      ))}
      {!calendar.isLoading && !calendar.isError && !calendar.data?.length ? (
        <EmptyState icon={CalendarDays} title={t("calendar.noUpcomingTitle")} description={t("calendar.noUpcoming")} />
      ) : null}
    </div>
  );
}
