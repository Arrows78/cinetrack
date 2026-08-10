import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { AsyncActionFeedback } from "@/components/ui/async-action-feedback";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { maintenanceService } from "@/features/backup/maintenance-service";
import { logger } from "@/features/diagnostics/logger";
import { tokenVault } from "@/features/desktop/token-vault";
import { updateService } from "@/features/desktop/update-service";
import { isTauriApp } from "@/shared/lib/platform";
import { formatRelativeDate } from "@/shared/utils/format";

export function DesktopSettings() {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [autoStart, setAutoStart] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"neutral" | "error">("neutral");
  const [busy, setBusy] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<{ exportedAt: string } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{ exportedAt: string | null; failed: boolean } | null>(null);
  const [logLines, setLogLines] = useState<string[] | null>(null);
  const refreshBackupStatus = () => {
    if (isTauriApp())
      void maintenanceService
        .getLastBackupStatus()
        .then(setBackupStatus)
        .catch(() => undefined);
  };
  const refreshLogs = () => {
    if (isTauriApp())
      void logger
        .readRecent()
        .then(setLogLines)
        .catch(() => undefined);
  };
  useEffect(() => {
    if (isTauriApp())
      void isEnabled()
        .then(setAutoStart)
        .catch(() => undefined);
    refreshBackupStatus();
    refreshLogs();
  }, []);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setMessage("");
    setMessageTone("neutral");
    try {
      const result = await action();
      setMessage(typeof result === "string" ? result : t("desktop.operationComplete"));
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : t("desktop.operationFailed"));
    } finally {
      setBusy(false);
    }
  };
  const startRestore = async () => {
    const info = await maintenanceService.getAutomaticBackupInfo();
    if (!info) {
      setMessageTone("error");
      setMessage(t("backup.noAutomaticBackup"));
      return;
    }
    setPendingRestore(info);
  };
  const confirmRestore = async () => {
    setIsRestoring(true);
    try {
      await maintenanceService.restoreAutomaticBackup();
      window.location.reload();
    } catch (error) {
      setIsRestoring(false);
      setPendingRestore(null);
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : t("desktop.operationFailed"));
    }
  };
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold">{t("desktop.tmdbVault")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("desktop.vaultDesc")}</p>
        <div className="mt-3 grid gap-2">
          <FormField label={t("desktop.vaultPassword")} help={t("desktop.vaultPasswordHint")}>
            {(describedBy) => (
              <Input
                size="sm"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby={describedBy}
              />
            )}
          </FormField>
          <FormField label={t("desktop.newToken")} help={t("desktop.newTokenHint")}>
            {(describedBy) => (
              <Textarea
                className="min-h-24 text-sm"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                aria-describedby={describedBy}
              />
            )}
          </FormField>
          <div className="flex gap-2">
            <Button
              disabled={busy || !password || !token.trim()}
              onClick={() => void run(() => tokenVault.save(password, token))}
            >
              {t("desktop.save")}
            </Button>
            <Button
              variant="outline"
              disabled={busy || !password}
              onClick={() =>
                void run(async () =>
                  (await tokenVault.unlock(password)) ? t("desktop.unlockSuccess") : t("desktop.unlockNoToken")
                )
              }
            >
              {t("desktop.unlock")}
            </Button>
            <Button variant="ghost" onClick={() => tokenVault.lock()}>
              {t("desktop.lock")}
            </Button>
          </div>
        </div>
      </div>
      {isTauriApp() ? (
        <div>
          <h3 className="font-semibold">{t("desktop.systemIntegration")}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant={autoStart ? "secondary" : "outline"}
              aria-pressed={autoStart}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (autoStart) await disable();
                  else await enable();
                  setAutoStart(!autoStart);
                  return !autoStart ? t("desktop.autostartEnabled") : t("desktop.autostartDisabled");
                })
              }
            >
              {autoStart ? t("desktop.autostartOff") : t("desktop.autostartOn")}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void run(() => updateService.checkAndInstall())}>
              {t("desktop.checkUpdate")}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const check = await maintenanceService.checkDataIntegrity();
                  return check.healthy
                    ? `${t("desktop.databaseHealthy")} ${check.detail}`
                    : `${t("desktop.databaseDamaged")} ${check.detail}`;
                })
              }
            >
              {t("desktop.checkDatabase")}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await maintenanceService.createAutomaticBackup(true);
                  return t("desktop.backupUpdated");
                }).then(refreshBackupStatus)
              }
            >
              {t("desktop.emergencyBackup")}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void startRestore()}>
              {t("desktop.restoreBackup")}
            </Button>
          </div>
          {backupStatus ? (
            <p className={`mt-2 text-xs ${backupStatus.failed ? "text-destructive" : "text-muted-foreground"}`}>
              {backupStatus.failed
                ? t("desktop.lastBackupFailed")
                : backupStatus.exportedAt
                  ? t("desktop.lastBackupSuccess", { date: formatRelativeDate(backupStatus.exportedAt) })
                  : t("desktop.noBackupYet")}
            </p>
          ) : null}
          <details className="mt-4 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">{t("desktop.diagnostics")}</summary>
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={refreshLogs}>
                  {t("desktop.diagnosticsRefresh")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!logLines?.length}
                  onClick={() => void navigator.clipboard.writeText((logLines ?? []).join("\n"))}
                >
                  {t("desktop.diagnosticsCopy")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!logLines?.length}
                  onClick={() =>
                    void logger
                      .clear()
                      .then(refreshLogs)
                      .catch(() => undefined)
                  }
                >
                  {t("desktop.diagnosticsClear")}
                </Button>
              </div>
              {logLines?.length ? (
                <pre className="max-h-48 overflow-auto rounded-xl border border-border bg-card p-3 font-mono text-xs whitespace-pre-wrap">
                  {logLines.join("\n")}
                </pre>
              ) : (
                <p>{t("desktop.diagnosticsEmpty")}</p>
              )}
            </div>
          </details>
        </div>
      ) : null}
      {message ? <AsyncActionFeedback tone={messageTone}>{message}</AsyncActionFeedback> : null}
      <p className="text-xs text-muted-foreground">{t("desktop.shortcuts")}</p>
      <ConfirmDialog
        open={pendingRestore !== null}
        onOpenChange={(open) => !open && !isRestoring && setPendingRestore(null)}
        title={t("desktop.restoreConfirmTitle")}
        description={t("desktop.restoreConfirmDescription", {
          date: pendingRestore ? formatRelativeDate(pendingRestore.exportedAt) : "",
        })}
        confirmLabel={t("desktop.restoreBackup")}
        cancelLabel={t("common.cancel")}
        isConfirming={isRestoring}
        onConfirm={() => void confirmRestore()}
      />
    </div>
  );
}
