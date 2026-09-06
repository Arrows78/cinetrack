import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { TrackingEntryRow } from "@/components/media/tracking/tracking-entry-row";
import { useWeeklyAgenda } from "@/features/tracking/use-weekly-agenda";
import { logger } from "@/shared/lib/logger";
import { errorMessage } from "@/shared/lib/errors";

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
          <TrackingEntryRow key={entry.id} entry={entry} showCountdown dashboardRail />
        ))}
      </div>
    </section>
  );
}
