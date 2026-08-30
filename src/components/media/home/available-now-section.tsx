import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tile } from "@/components/ui/tile";
import { SectionHeader } from "@/components/media/primitives/section-header";
import type { AlertStatus } from "@/features/availability/use-availability-alerts";

function AvailableNowRow({ status }: { status: AlertStatus }) {
  const { t } = useTranslation();
  const { alert } = status;

  return (
    <Tile asChild className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-foreground/[0.04]">
      <Link
        to={alert.mediaType === "movie" ? "/movies/$movieId" : "/series/$seriesId"}
        params={alert.mediaType === "movie" ? { movieId: String(alert.mediaId) } : { seriesId: String(alert.mediaId) }}
      >
        <Bell className="size-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{alert.title}</p>
        <Badge variant="success">{t("tracking.availableNow")}</Badge>
      </Link>
    </Tile>
  );
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
          <AvailableNowRow key={status.alert.id} status={status} />
        ))}
      </div>
    </div>
  );
}
