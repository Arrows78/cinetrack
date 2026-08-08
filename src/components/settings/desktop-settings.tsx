import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { QUERY_CACHE_KEY } from "@/app/query-client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { maintenanceService } from "@/features/backup/maintenance-service";
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
  const [busy, setBusy] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<{ exportedAt: string } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  useEffect(() => {
    if (isTauriApp())
      void isEnabled()
        .then(setAutoStart)
        .catch(() => undefined);
  }, []);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await action();
      setMessage(typeof result === "string" ? result : t("desktop.operationComplete"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("desktop.operationFailed"));
    } finally {
      setBusy(false);
    }
  };
  const startRestore = async () => {
    const info = await maintenanceService.getAutomaticBackupInfo();
    if (!info) {
      setMessage(t("backup.noAutomaticBackup"));
      return;
    }
    setPendingRestore(info);
  };
  const confirmRestore = async () => {
    setIsRestoring(true);
    try {
      await maintenanceService.restoreAutomaticBackup();
      window.localStorage.removeItem(QUERY_CACHE_KEY);
      window.location.reload();
    } catch (error) {
      setIsRestoring(false);
      setPendingRestore(null);
      setMessage(error instanceof Error ? error.message : t("desktop.operationFailed"));
    }
  };
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold">{t("desktop.tmdbVault")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("desktop.vaultDesc")}</p>
        <div className="mt-3 grid gap-2">
          <label className="grid gap-1.5 text-sm font-medium">
            {t("desktop.vaultPassword")}
            <Input size="sm" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {t("desktop.newToken")}
            <Textarea className="min-h-24 text-sm" value={token} onChange={(event) => setToken(event.target.value)} />
          </label>
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
                })
              }
            >
              {t("desktop.emergencyBackup")}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void startRestore()}>
              {t("desktop.restoreBackup")}
            </Button>
          </div>
        </div>
      ) : null}
      {message ? <p className="rounded-xl border border-border bg-muted/40 p-3 text-sm">{message}</p> : null}
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
