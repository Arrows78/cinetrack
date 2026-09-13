import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { LoadingState } from "@/components/states/loading-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { UpcomingEntryRow } from "@/components/media/tracking/upcoming-entry-row";
import { useTracking } from "@/features/tracking/use-tracking";
import { staggerDelayMs } from "@/shared/utils/animation";
import { formatFullDate } from "@/shared/utils/format";
import type { TrackingEntry } from "@/types/media";

// Deliberately narrower than the full /tracking page: only the titles the
// user actually tracks (never a "discovery" catalogue entry), and never
// availability alerts — those already have their own dedicated sections on
// /tracking. This is a glanceable "what's next for what I follow" feed,
// TV-Time-style, not a second management view for the same data.
function relevantEntries(entries: TrackingEntry[]): TrackingEntry[] {
  return entries.filter((entry) => entry.scope === "mine" && entry.type !== "availability" && entry.date);
}

export function UpcomingPage() {
  const { t } = useTranslation();
  const tracking = useTracking();

  const groups = useMemo(() => {
    const entries = relevantEntries(tracking.data ?? []);
    return entries.reduce<Record<string, TrackingEntry[]>>((acc, entry) => {
      (acc[entry.date as string] ??= []).push(entry);
      return acc;
    }, {});
  }, [tracking.data]);
  const dateGroups = Object.entries(groups);

  return (
    <div className="space-y-8">
      <SectionHeader
        title={t("upcoming.title")}
        subtitle={t("upcoming.subtitle")}
        icon={CalendarClock}
        isPageTitle
      />

      {tracking.isLoading ? <LoadingState label={t("tracking.loading")} /> : null}
      {tracking.isError ? <RemoteErrorState error={tracking.error} onRetry={() => void tracking.refetch()} /> : null}

      {!tracking.isLoading && !tracking.isError
        ? dateGroups.map(([date, entries], index) => (
            <Panel key={date} className="animate-in" style={{ animationDelay: `${staggerDelayMs(index + 1)}ms` }}>
              <h2 className="font-semibold capitalize">{formatFullDate(date)}</h2>
              <div className="mt-3 grid gap-2">
                {entries.map((entry) => (
                  <UpcomingEntryRow key={entry.id} entry={entry} />
                ))}
              </div>
            </Panel>
          ))
        : null}

      {!tracking.isLoading && !tracking.isError && dateGroups.length === 0 ? (
        <EmptyState icon={CalendarClock} title={t("upcoming.emptyTitle")} description={t("upcoming.emptyDesc")} />
      ) : null}
    </div>
  );
}
