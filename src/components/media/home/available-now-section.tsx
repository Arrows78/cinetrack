import { useTranslation } from "react-i18next";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { TrackingEntryRow } from "@/components/media/tracking/tracking-entry-row";
import type { AlertStatus } from "@/features/availability/use-availability-alerts";
import type { TrackingEntry } from "@/types/media";

// TrackingEntryRow expects a TrackingEntry — an AvailabilityAlert carries a
// subset of the same fields (see AvailabilityAlert.ts vs TrackingEntry in
// types/media.ts), so this adapts it rather than duplicating the row's
// markup for a second, near-identical shape.
function toTrackingEntry(status: AlertStatus): TrackingEntry {
  const { alert } = status;
  return {
    id: alert.id,
    mediaId: alert.mediaId,
    mediaType: alert.mediaType,
    title: alert.title,
    type: "availability",
    scope: "mine",
    date: null,
    available: true,
  };
}

/** Today Hub's "Désormais disponible sur tes services" card — alerts that just matched a provider. */
export function AvailableNowSection({ statuses }: { statuses: AlertStatus[] }) {
  const { t } = useTranslation();
  if (!statuses.length) return null;

  return (
    <div>
      <SectionHeader title={t("home.availableNow")} subtitle={t("home.availableNowSubtitle")} size="sub" />
      <div className="grid gap-2 lg:grid-cols-2">
        {statuses.map((status) => (
          <TrackingEntryRow key={status.alert.id} entry={toTrackingEntry(status)} dashboardRail />
        ))}
      </div>
    </div>
  );
}
