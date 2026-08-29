import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Bell, Film, Tv } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tile } from "@/components/ui/tile";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { useWeeklyAgenda } from "@/features/tracking/use-weekly-agenda";
import { logger } from "@/shared/lib/logger";
import { errorMessage } from "@/shared/lib/errors";
import { formatEpisodeCode, formatRelativeCountdown } from "@/shared/utils/format";
import type { TrackingEntry } from "@/types/media";

function WeeklyAgendaRow({ entry }: { entry: TrackingEntry }) {
  const { t } = useTranslation();

  if (entry.type === "availability") {
    return (
      <Tile asChild className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-foreground/[0.04]">
        <Link
          to={entry.mediaType === "movie" ? "/movies/$movieId" : "/series/$seriesId"}
          params={
            entry.mediaType === "movie" ? { movieId: String(entry.mediaId) } : { seriesId: String(entry.mediaId) }
          }
        >
          <Bell className="size-4 shrink-0 text-primary" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{entry.title}</p>
          <Badge variant="success">{t("tracking.availableNow")}</Badge>
        </Link>
      </Tile>
    );
  }

  return (
    <Tile asChild className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-foreground/[0.04]">
      <Link
        to={entry.type === "episode" ? "/series/$seriesId/season/$seasonNumber" : "/movies/$movieId"}
        params={
          entry.type === "episode"
            ? { seriesId: String(entry.mediaId), seasonNumber: String(entry.seasonNumber ?? 1) }
            : { movieId: String(entry.mediaId) }
        }
      >
        {entry.type === "episode" ? (
          <Tv className="size-4 shrink-0 text-primary" />
        ) : (
          <Film className="size-4 shrink-0 text-primary" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{entry.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {entry.type === "episode"
              ? formatEpisodeCode(entry.seasonNumber ?? 0, entry.episodeNumber ?? 0)
              : t("tracking.theatricalRelease")}
          </p>
        </div>
        {entry.date ? <Badge variant="secondary">{formatRelativeCountdown(entry.date)}</Badge> : null}
      </Link>
    </Tile>
  );
}

/**
 * Compact "This week" agenda for the active profile — tracked movie
 * releases, season premieres, upcoming episodes, and availability alerts
 * that just turned on, all within the next 7 days (see
 * weekly-agenda-service.ts). Renders nothing when there's nothing to show,
 * same convention as WatchNextSection — an empty agenda isn't worth a
 * dedicated empty state on the home dashboard.
 */
export function WeeklyAgendaSection({ index }: { index: number }) {
  const { t } = useTranslation();
  const agenda = useWeeklyAgenda();
  const entries = agenda.data ?? [];

  // No dedicated RemoteErrorState UI here: this section sits alongside
  // several other best-effort home rails (WatchNextSection, "because you
  // liked" etc.) that quietly hide themselves rather than blocking the rest
  // of the dashboard, and the Tracking page (src/pages/tracking-page.tsx) is
  // where this same underlying data gets its full error-state treatment.
  // The failure is still logged rather than swallowed outright.
  useEffect(() => {
    if (agenda.error) logger.warn(`[home] Weekly agenda failed to load: ${errorMessage(agenda.error)}`);
  }, [agenda.error]);

  if (agenda.isLoading || agenda.isError || !entries.length) return null;

  return (
    <section>
      <SectionHeader title={t("home.thisWeekTitle")} subtitle={t("home.thisWeekSubtitle")} index={index} />
      <div className="grid gap-2 lg:grid-cols-2">
        {entries.map((entry) => (
          <WeeklyAgendaRow key={entry.id} entry={entry} />
        ))}
      </div>
    </section>
  );
}
