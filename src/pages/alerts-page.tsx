import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { BellRing, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tile } from "@/components/ui/tile";
import { EmptyState } from "@/components/states/empty-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { SectionHeader } from "@/components/media/section-header";
import { useAvailabilityAlerts } from "@/features/availability/use-availability-alerts";
import { PLATFORMS } from "@/shared/constants/discover";
import type { AvailabilityAlert } from "@/types/media";

function providerNames(providerIds: number[]): string[] {
  return providerIds.map((id) => PLATFORMS.find((platform) => platform.id === id)?.label ?? String(id));
}

export function AlertsPage() {
  const { t } = useTranslation();
  const alerts = useAvailabilityAlerts();
  const [pendingRemoval, setPendingRemoval] = useState<AvailabilityAlert | null>(null);

  return (
    <div className="space-y-8">
      <SectionHeader title={t("alerts.title")} subtitle={t("alerts.subtitle")} index={1} />

      {alerts.isError ? (
        <RemoteErrorState error={alerts.error} onRetry={() => void alerts.refetch()} />
      ) : alerts.data?.length ? (
        <div className="grid gap-3">
          {alerts.data.map((alert) => (
            <Tile key={alert.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <Link
                  to={alert.mediaType === "movie" ? "/movies/$movieId" : "/series/$seriesId"}
                  params={
                    alert.mediaType === "movie"
                      ? { movieId: String(alert.mediaId) }
                      : { seriesId: String(alert.mediaId) }
                  }
                  className="font-semibold hover:underline"
                >
                  {alert.title}
                </Link>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {t("alerts.region", { region: alert.region })}
                  {alert.providerIds.length ? ` · ${providerNames(alert.providerIds).join(", ")}` : ""}
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t("alerts.remove", { title: alert.title })}
                onClick={() => setPendingRemoval(alert)}
              >
                <Trash2 className="size-4" />
              </Button>
            </Tile>
          ))}
        </div>
      ) : (
        <EmptyState icon={BellRing} title={t("alerts.emptyTitle")} description={t("alerts.emptyDesc")} />
      )}

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
        title={t("alerts.removeConfirmTitle", { title: pendingRemoval?.title })}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (!pendingRemoval) return;
          void alerts.remove(pendingRemoval.id);
          setPendingRemoval(null);
        }}
      />
    </div>
  );
}
