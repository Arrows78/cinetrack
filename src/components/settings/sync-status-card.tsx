import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tile } from "@/components/ui/tile";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { useAuth } from "@/features/auth/use-auth";
import { useSyncConflicts, useSyncStatus } from "@/features/sync/use-sync-status";
import { isTauriApp } from "@/shared/lib/platform";
import { formatRelativeDate } from "@/shared/utils/format";

function ConflictHistory({ open }: { open: boolean }) {
  const { t } = useTranslation();
  const conflicts = useSyncConflicts(open);

  if (!open) return null;

  return (
    <div className="flex flex-col gap-2">
      {conflicts.isLoading ? (
        <p className="text-caption text-muted-foreground">{t("settings.sync.conflictsLoading")}</p>
      ) : conflicts.data?.length ? (
        conflicts.data.map((conflict) => (
          <Tile key={conflict.mutationId} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-body-sm">
              {t(`settings.sync.entityTypes.${conflict.entityType}`, { defaultValue: conflict.entityType })}
            </span>
            <span className="text-caption text-muted-foreground">{formatRelativeDate(conflict.createdAt)}</span>
          </Tile>
        ))
      ) : (
        <p className="text-caption text-muted-foreground">{t("settings.sync.conflictsEmpty")}</p>
      )}
    </div>
  );
}

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
  const [conflictsOpen, setConflictsOpen] = useState(false);

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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto gap-1.5 px-0 py-0 hover:bg-transparent"
                    aria-expanded={conflictsOpen}
                    onClick={() => setConflictsOpen((value) => !value)}
                  >
                    <Badge variant="destructive">
                      {t("settings.sync.conflicts", { count: status.data.conflictCount })}
                    </Badge>
                    {conflictsOpen ? (
                      <ChevronUp className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    )}
                  </Button>
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
            {status.data && status.data.conflictCount > 0 && <ConflictHistory open={conflictsOpen} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
