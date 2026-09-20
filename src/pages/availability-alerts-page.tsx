import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Bell, BellRing, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/states/empty-state";
import { LoadingState } from "@/components/states/loading-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { Panel } from "@/components/ui/panel";
import { Tile } from "@/components/ui/tile";
import { IconTooltip } from "@/components/ui/tooltip";
import { SectionHeader } from "@/components/media/primitives/section-header";
import {
  useAvailabilityAlerts,
  useAvailabilityStatus,
  type AlertStatus,
} from "@/features/availability/use-availability-alerts";
import { PLATFORMS } from "@/shared/constants/discover";
import { formatRelativeDate } from "@/shared/utils/format";
import type { AvailabilityAlert } from "@/types/media";

function providerNames(providerIds: number[]): string[] {
  return providerIds.map((id) => PLATFORMS.find((platform) => platform.id === id)?.label ?? String(id));
}

// Prefers the alert's own matched providers (the ones that actually
// triggered "available now") over its full stored provider selection — a
// pending alert has no matches yet, so it falls back to what it's watching
// for instead of showing nothing.
function AlertRow({ status, onRemove }: { status: AlertStatus; onRemove: () => void }) {
  const { t } = useTranslation();
  const { alert, matchedProviderIds, available } = status;
  const names = providerNames(matchedProviderIds.length ? matchedProviderIds : alert.providerIds);
  return (
    <Tile className="flex items-center justify-between gap-3 p-3">
      <Link
        to={alert.mediaType === "movie" ? "/movies/$movieId" : "/series/$seriesId"}
        params={alert.mediaType === "movie" ? { movieId: String(alert.mediaId) } : { seriesId: String(alert.mediaId) }}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        {available ? (
          <BellRing className="size-4 shrink-0 text-primary" />
        ) : (
          <Bell className="size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{alert.title}</p>
            {available ? <Badge variant="success">{t("tracking.availableNow")}</Badge> : null}
          </div>
          <p className="truncate text-body-sm text-muted-foreground">
            {t("tracking.region", { region: alert.region })}
            {names.length ? ` · ${names.join(", ")}` : ""}
            {` · ${t("tracking.alertSince", { date: formatRelativeDate(alert.createdAt) })}`}
          </p>
        </div>
      </Link>
      <IconTooltip label={t("tracking.remove", { title: alert.title })}>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t("tracking.remove", { title: alert.title })}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </IconTooltip>
    </Tile>
  );
}

/**
 * Every enabled availability alert in one place — previously only reachable
 * interleaved with releases/episodes on the Tracking page, with no way to
 * see or manage the full set at once.
 */
export function AvailabilityAlertsPage() {
  const { t } = useTranslation();
  const alerts = useAvailabilityAlerts();
  const status = useAvailabilityStatus();
  const [pendingRemoval, setPendingRemoval] = useState<AvailabilityAlert | null>(null);

  const isLoading = alerts.isLoading || status.isLoading;
  const isError = alerts.isError || status.isError;
  const isEmpty = !isLoading && !isError && status.availableNow.length === 0 && status.pending.length === 0;

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t("availabilityAlerts.title")}
        subtitle={t("availabilityAlerts.subtitle")}
        icon={Bell}
        isPageTitle
      />

      {isLoading ? <LoadingState label={t("tracking.loading")} /> : null}
      {isError ? <RemoteErrorState error={alerts.error} onRetry={() => void alerts.refetch()} /> : null}

      {!isLoading && !isError && status.availableNow.length ? (
        <Panel>
          <h2 className="font-semibold">{t("tracking.availableNow")}</h2>
          <div className="mt-3 grid gap-2">
            {status.availableNow.map((item) => (
              <AlertRow key={item.alert.id} status={item} onRemove={() => setPendingRemoval(item.alert)} />
            ))}
          </div>
        </Panel>
      ) : null}

      {!isLoading && !isError && status.pending.length ? (
        <Panel>
          <h2 className="font-semibold text-muted-foreground">{t("tracking.awaitingAvailability")}</h2>
          <div className="mt-3 grid gap-2">
            {status.pending.map((item) => (
              <AlertRow key={item.alert.id} status={item} onRemove={() => setPendingRemoval(item.alert)} />
            ))}
          </div>
        </Panel>
      ) : null}

      {isEmpty ? (
        <EmptyState
          icon={Bell}
          title={t("availabilityAlerts.emptyTitle")}
          description={t("availabilityAlerts.emptyDesc")}
        />
      ) : null}

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => !open && !alerts.isRemoving && setPendingRemoval(null)}
        title={t("tracking.removeConfirmTitle", { title: pendingRemoval?.title })}
        description={t("tracking.removeConfirmDescription")}
        confirmLabel={t("common.remove")}
        cancelLabel={t("common.cancel")}
        isConfirming={alerts.isRemoving}
        onConfirm={() => {
          if (!pendingRemoval) return;
          // Failure toast is handled by the app-wide MutationCache error
          // handler (see query-client.ts) — the dialog stays open (and
          // isConfirming clears) so the user can retry.
          void alerts
            .remove(pendingRemoval.id)
            .then(() => setPendingRemoval(null))
            .catch(() => {});
        }}
      />
    </div>
  );
}
