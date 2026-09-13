import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { useAuth } from "@/features/auth/use-auth";
import { useSyncStatus } from "@/features/sync/use-sync-status";
import { isTauriApp } from "@/shared/lib/platform";
import { formatRelativeDate } from "@/shared/utils/format";

/**
 * Read-only status for the background sync loop App.tsx already starts on
 * sign-in — this never runs sync itself except via the explicit "Sync now"
 * button, which reuses that same syncService.run() rather than a second
 * engine. Rendered only where sync is actually possible: inside the Tauri
 * webview, with an active Supabase session (see syncService.initialize's
 * own gating).
 */
export function SyncStatusCard() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const status = useSyncStatus();

  if (!isTauriApp() || !session) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.sync.title")}</CardTitle>
        <CardDescription>{t("settings.sync.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {status.isError ? (
          <RemoteErrorState error={status.error} onRetry={() => void status.refetch()} />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-body-sm text-muted-foreground">
                {status.isLoading
                  ? t("settings.sync.checking")
                  : status.data && status.data.failedCount > 0
                    ? t("settings.sync.failed", { count: status.data.failedCount })
                    : status.data && status.data.pendingCount > 0
                      ? t("settings.sync.pending", { count: status.data.pendingCount })
                      : t("settings.sync.upToDate")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                isLoading={status.isFetching}
                onClick={() => void status.syncNow()}
              >
                <RefreshCw className="mr-2 size-4" aria-hidden="true" />
                {t("settings.sync.syncNow")}
              </Button>
            </div>
            {!status.isLoading && status.data && (
              <div className="flex flex-wrap items-center gap-2">
                {status.data.conflictCount > 0 && (
                  <Badge variant="destructive">
                    {t("settings.sync.conflicts", { count: status.data.conflictCount })}
                  </Badge>
                )}
                <span className="text-caption text-muted-foreground">
                  {status.data.lastSyncedAt
                    ? t("settings.sync.lastSynced", { date: formatRelativeDate(status.data.lastSyncedAt) })
                    : t("settings.sync.neverSynced")}
                  {status.nextCheckInMinutes !== null
                    ? ` · ${t("settings.sync.nextCheck", { count: status.nextCheckInMinutes })}`
                    : ""}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
