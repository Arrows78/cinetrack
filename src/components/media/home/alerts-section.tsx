import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tile } from "@/components/ui/tile";
import { SectionHeader } from "@/components/media/primitives/section-header";
import type { AlertStatus } from "@/features/availability/use-availability-alerts";

/** Today Hub's "Alertes" card — opted-in availability alerts still waiting for a match. */
export function AlertsSection({ statuses }: { statuses: AlertStatus[] }) {
  const { t } = useTranslation();
  if (!statuses.length) return null;

  return (
    <div>
      <SectionHeader
        title={t("home.pendingAlerts")}
        subtitle={t("home.pendingAlertsSubtitle", { count: statuses.length })}
        size="sub"
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/tracking">{t("home.pendingAlertsManageCta")}</Link>
          </Button>
        }
      />
      <div className="grid gap-2 lg:grid-cols-2">
        {statuses.map(({ alert }) => (
          <Tile key={alert.id} className="flex items-center gap-3 px-3 py-2.5">
            <BellRing className="size-4 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{alert.title}</p>
          </Tile>
        ))}
      </div>
    </div>
  );
}
