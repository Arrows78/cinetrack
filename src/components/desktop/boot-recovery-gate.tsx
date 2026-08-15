import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { DatabaseBackup, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AsyncActionFeedback } from "@/components/ui/async-action-feedback";
import { EmptyState } from "@/components/states/empty-state";
import { LoadingScreen } from "@/components/states/loading-screen";
import { maintenanceService } from "@/features/backup/maintenance-service";
import { logger } from "@/features/diagnostics/logger";
import { useBootRecovery } from "@/features/desktop/use-boot-recovery";
import { isTauriApp } from "@/shared/lib/platform";

// Gates everything else in the tree — a quarantined/recovered database means
// every other command (auth, profiles, preferences...) is about to run
// against a brand new, empty schema, so this has to resolve before anything
// downstream reads or writes it. See src-tauri/src/database/mod.rs::init_pool
// for what actually happened.
export function BootRecoveryGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const query = useBootRecovery();
  const [dismissed, setDismissed] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  useEffect(() => {
    if (query.data?.originalError) {
      logger.error(`Boot recovery: ${query.data.originalError} (quarantined: ${query.data.quarantinedPath ?? "n/a"})`);
    }
  }, [query.data?.originalError, query.data?.quarantinedPath]);

  if (!isTauriApp()) return children;
  if (query.isLoading) return <LoadingScreen label={t("bootRecovery.checking")} />;
  if (!query.data?.recovered || dismissed) return children;

  const restore = async () => {
    setIsRestoring(true);
    setRestoreError(null);
    try {
      await maintenanceService.restoreAutomaticBackup();
      window.location.reload();
    } catch {
      setIsRestoring(false);
      // Never the raw error here — this is the first screen an already
      // distressed user (corrupt database) sees, and the underlying error
      // can be a raw ApiCommandError.
      setRestoreError(t("bootRecovery.restoreFailed"));
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-lg">
        <EmptyState
          icon={DatabaseBackup}
          title={t("bootRecovery.title")}
          description={t("bootRecovery.description")}
          action={
            <div className="flex flex-col items-center gap-3">
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" onClick={() => void restore()} disabled={isRestoring}>
                  <RotateCcw className="mr-2 size-4" />
                  {t("bootRecovery.restoreCta")}
                </Button>
                <Button type="button" variant="outline" onClick={() => setDismissed(true)} disabled={isRestoring}>
                  {t("bootRecovery.continueCta")}
                </Button>
              </div>
              {restoreError ? (
                <AsyncActionFeedback tone="error" className="max-w-md">
                  {restoreError}
                </AsyncActionFeedback>
              ) : null}
              <details className="mt-2 max-w-md text-left text-xs text-muted-foreground">
                <summary className="cursor-pointer text-center">{t("errors.technicalDetails")}</summary>
                <p className="mt-2 break-words rounded-xl border border-border bg-card p-3 font-mono">
                  {t("errors.technicalDetailsLogged")}
                </p>
              </details>
            </div>
          }
        />
      </div>
    </main>
  );
}
