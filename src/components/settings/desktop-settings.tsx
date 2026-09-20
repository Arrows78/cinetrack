import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { RotateCcw } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ShortcutInput } from "@/components/ui/shortcut-input";
import { Textarea } from "@/components/ui/textarea";
import { IconTooltip } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/use-toast";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { maintenanceService } from "@/features/backup";
import { diagnosticsService, tokenVault, updateService, type DiagnosticsSummary } from "@/features/desktop";
import { useDesktopShortcuts } from "@/features/desktop/use-desktop-shortcuts";
import { defaultPreferences } from "@/features/preferences/preferences-repository";
import { usePreferences } from "@/features/preferences/use-preferences";
import { logger } from "@/shared/lib/logger";
import { isDesktopApp, isTauriApp } from "@/shared/lib/platform";
import { displayMessage } from "@/shared/lib/user-facing-error";
import { errorMessage } from "@/shared/lib/errors";
import { formatRelativeDate } from "@/shared/utils/format";
import type { UserPreferences } from "@/types/media";

type ShortcutKey = "commandPaletteShortcut" | "globalCommandPaletteShortcut";

/** The two remappable shortcuts (in-window and system-wide command palette) — see desktop.shortcuts' surrounding copy for the non-remappable deep-link scheme. */
function KeyboardShortcutsRow() {
  const { t } = useTranslation();
  const { data: preferences, updatePreference, isSaving } = usePreferences();
  const [error, setError] = useState<string | null>(null);
  const { updateGlobalShortcut } = useDesktopShortcuts();

  const current: Record<ShortcutKey, string> = {
    commandPaletteShortcut: preferences?.commandPaletteShortcut ?? defaultPreferences.commandPaletteShortcut,
    globalCommandPaletteShortcut:
      preferences?.globalCommandPaletteShortcut ?? defaultPreferences.globalCommandPaletteShortcut,
  };

  const applyShortcut = async (key: ShortcutKey, next: string) => {
    setError(null);
    const otherKey: ShortcutKey =
      key === "commandPaletteShortcut" ? "globalCommandPaletteShortcut" : "commandPaletteShortcut";
    if (next === current[otherKey]) {
      setError(t("desktop.shortcutsConflict"));
      return;
    }
    try {
      await updatePreference({ key, value: next as UserPreferences[ShortcutKey] });
      if (key === "globalCommandPaletteShortcut") {
        void updateGlobalShortcut(next);
      }
    } catch (updateError) {
      logger.warn(`Failed to update keyboard shortcut: ${errorMessage(updateError)}`);
      setError(t("desktop.shortcutsUpdateFailed"));
    }
  };

  const row = (key: ShortcutKey, label: string) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-40 shrink-0 text-body-sm text-muted-foreground">{label}</span>
      <ShortcutInput
        label={label}
        recordingLabel={t("desktop.shortcutRecording")}
        value={current[key]}
        disabled={isSaving}
        onChange={(next) => void applyShortcut(key, next)}
      />
      <IconTooltip label={t("desktop.shortcutReset")}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("desktop.shortcutReset")}
          disabled={isSaving || current[key] === defaultPreferences[key]}
          onClick={() => void applyShortcut(key, defaultPreferences[key])}
        >
          <RotateCcw className="size-4" />
        </Button>
      </IconTooltip>
    </div>
  );

  return (
    <div className="mt-3 space-y-3">
      <div className="space-y-2">
        {row("commandPaletteShortcut", t("desktop.shortcutCommandPaletteLabel"))}
        {row("globalCommandPaletteShortcut", t("desktop.shortcutGlobalLabel"))}
      </div>
      {error ? (
        <p role="alert" aria-live="polite" className="text-caption text-destructive">
          {error}
        </p>
      ) : null}
      <p className="text-caption text-muted-foreground">{t("desktop.shortcutsDeepLinksHint")}</p>
    </div>
  );
}

export function DesktopSettings() {
  const { t } = useTranslation();
  const { data: preferences, updatePreference } = usePreferences();
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [autoStart, setAutoStart] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<{ exportedAt: string } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [pendingClearLogs, setPendingClearLogs] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{ exportedAt: string | null; failed: boolean } | null>(null);
  const [logLines, setLogLines] = useState<string[] | null>(null);
  const [timingSummary, setTimingSummary] = useState<DiagnosticsSummary | null>(null);
  const refreshTimingSummary = () => {
    if (!isTauriApp()) return;
    void diagnosticsService
      .exportSummary()
      .then(setTimingSummary)
      .catch((error: unknown) => logger.warn(`Failed to refresh the command timing summary: ${errorMessage(error)}`));
  };
  const refreshBackupStatus = () => {
    if (isTauriApp())
      void maintenanceService
        .getLastBackupStatus()
        .then(setBackupStatus)
        .catch((error: unknown) => logger.warn(`Failed to refresh backup status: ${errorMessage(error)}`));
  };
  const refreshLogs = () => {
    if (isTauriApp())
      void logger
        .readRecent()
        .then(setLogLines)
        .catch((error: unknown) => logger.warn(`Failed to refresh diagnostic logs: ${errorMessage(error)}`));
  };
  useEffect(() => {
    if (isDesktopApp())
      void isEnabled()
        .then(setAutoStart)
        .catch((error: unknown) => logger.warn(`Failed to read autostart state: ${errorMessage(error)}`));
    refreshBackupStatus();
    refreshLogs();
    refreshTimingSummary();
  }, []);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      const result = await action();
      toast({
        description: typeof result === "string" ? result : t("desktop.operationComplete"),
        variant: "success",
      });
    } catch (error) {
      logger.warn(`Desktop settings action failed: ${errorMessage(error)}`);
      toast({ description: displayMessage(error, t("desktop.operationFailed")), variant: "error" });
    } finally {
      setBusy(false);
    }
  };
  const startRestore = async () => {
    const info = await maintenanceService.getAutomaticBackupInfo();
    if (!info) {
      toast({ description: t("backup.noAutomaticBackup"), variant: "error" });
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
      logger.warn(`Automatic backup restore failed: ${errorMessage(error)}`);
      toast({ description: displayMessage(error, t("desktop.operationFailed")), variant: "error" });
    }
  };
  return (
    <div className="space-y-8">
      <div>
        <SectionHeader size="sub" headingLevel={3} title={t("desktop.categorySecurity")} />
        <Card>
          <CardHeader>
            <CardTitle>{t("desktop.tmdbVault")}</CardTitle>
            <CardDescription>{t("desktop.vaultDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
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
                  className="min-h-24 text-body-sm"
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
          </CardContent>
        </Card>
      </div>

      {isTauriApp() ? (
        <>
          <div>
            <SectionHeader size="sub" headingLevel={3} title={t("desktop.categorySystem")} />
            <Card>
              <CardHeader>
                <CardTitle>{t("desktop.systemIntegration")}</CardTitle>
                <CardDescription>{t("desktop.systemIntegrationDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {isDesktopApp() ? (
                    <>
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
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void run(() => updateService.checkAndInstall())}
                      >
                        {t("desktop.checkUpdate")}
                      </Button>
                    </>
                  ) : null}
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
                </div>
                {isDesktopApp() ? <KeyboardShortcutsRow /> : null}
              </CardContent>
            </Card>
          </div>

          <div>
            <SectionHeader size="sub" headingLevel={3} title={t("desktop.categoryBackup")} />
            <Card>
              <CardHeader>
                <CardTitle>{t("desktop.automaticBackupTitle")}</CardTitle>
                <CardDescription>{t("desktop.automaticBackupDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <label className="grid max-w-xs gap-2 text-body-sm font-medium">
                  {t("desktop.automaticBackupFrequency")}
                  <Select
                    value={preferences?.backupFrequency ?? "daily"}
                    onChange={(event) =>
                      void updatePreference({
                        key: "backupFrequency",
                        value: event.target.value as UserPreferences["backupFrequency"],
                      })
                    }
                  >
                    <option value="daily">{t("desktop.automaticBackupFrequencyDaily")}</option>
                    <option value="weekly">{t("desktop.automaticBackupFrequencyWeekly")}</option>
                    <option value="off">{t("desktop.automaticBackupFrequencyOff")}</option>
                  </Select>
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
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
                  <p
                    className={`mt-2 text-caption ${backupStatus.failed ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {backupStatus.failed
                      ? t("desktop.lastBackupFailed")
                      : backupStatus.exportedAt
                        ? t("desktop.lastBackupSuccess", { date: formatRelativeDate(backupStatus.exportedAt) })
                        : t("desktop.noBackupYet")}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <SectionHeader size="sub" headingLevel={3} title={t("desktop.categoryDiagnostics")} />
            <Card>
              <CardHeader>
                <CardTitle>{t("desktop.diagnostics")}</CardTitle>
                <CardDescription>{t("desktop.diagnosticsDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
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
                    disabled={!logLines?.length || busy}
                    onClick={() => setPendingClearLogs(true)}
                  >
                    {t("desktop.diagnosticsClear")}
                  </Button>
                </div>
                {logLines?.length ? (
                  <pre className="mt-3 max-h-48 overflow-auto rounded-xl border border-border bg-card p-3 font-mono text-caption whitespace-pre-wrap">
                    {logLines.join("\n")}
                  </pre>
                ) : (
                  <p className="mt-3 text-caption text-muted-foreground">{t("desktop.diagnosticsEmpty")}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              {/* Collapsed by default — a developer-facing diagnostics tool,
                not something most users need open at a glance. */}
              <Accordion type="single" collapsible>
                <AccordionItem value="timing" className="border-none bg-transparent">
                  <CardHeader className="pb-0">
                    <AccordionTrigger className="p-0 hover:no-underline">
                      <div className="text-left">
                        <CardTitle>{t("desktop.diagnosticsTimingTitle")}</CardTitle>
                        <CardDescription>{t("desktop.diagnosticsTimingDesc")}</CardDescription>
                      </div>
                    </AccordionTrigger>
                  </CardHeader>
                  <AccordionContent>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={refreshTimingSummary}>
                          {t("desktop.diagnosticsTimingRefresh")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!timingSummary?.commands.length}
                          onClick={() => void navigator.clipboard.writeText(JSON.stringify(timingSummary, null, 2))}
                        >
                          {t("desktop.diagnosticsTimingCopy")}
                        </Button>
                      </div>
                      {timingSummary?.commands.length ? (
                        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
                          <table className="w-full text-left text-caption">
                            <thead className="bg-card text-muted-foreground">
                              <tr>
                                <th className="p-2 font-medium">{t("desktop.diagnosticsTimingLayer")}</th>
                                <th className="p-2 font-medium">{t("desktop.diagnosticsTimingCommand")}</th>
                                <th className="p-2 font-medium">{t("desktop.diagnosticsTimingCount")}</th>
                                <th className="p-2 font-medium">{t("desktop.diagnosticsTimingAvg")}</th>
                                <th className="p-2 font-medium">{t("desktop.diagnosticsTimingP95")}</th>
                                <th className="p-2 font-medium">{t("desktop.diagnosticsTimingMax")}</th>
                                <th className="p-2 font-medium">{t("desktop.diagnosticsTimingErrors")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...timingSummary.commands]
                                .sort((a, b) => b.p95DurationMs - a.p95DurationMs)
                                .map((row) => (
                                  <tr key={`${row.layer}-${row.command}`} className="border-t border-border">
                                    <td className="p-2 font-mono">{row.layer}</td>
                                    <td className="p-2 font-mono">{row.command}</td>
                                    <td className="p-2">{row.count}</td>
                                    <td className="p-2">{Math.round(row.avgDurationMs)}</td>
                                    <td className="p-2">{row.p95DurationMs}</td>
                                    <td className="p-2">{row.maxDurationMs}</td>
                                    <td className="p-2">{row.errorCount}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="mt-3 text-caption text-muted-foreground">{t("desktop.diagnosticsTimingEmpty")}</p>
                      )}
                    </CardContent>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </Card>
          </div>
        </>
      ) : null}

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
      <ConfirmDialog
        open={pendingClearLogs}
        onOpenChange={(open) => !open && !busy && setPendingClearLogs(false)}
        title={t("desktop.diagnosticsClearConfirmTitle")}
        description={t("desktop.diagnosticsClearConfirmDescription")}
        confirmLabel={t("desktop.diagnosticsClear")}
        cancelLabel={t("common.cancel")}
        isConfirming={busy}
        onConfirm={() =>
          void run(async () => {
            try {
              await logger.clear();
              setLogLines(await logger.readRecent());
              setPendingClearLogs(false);
            } catch (error) {
              logger.error(`Failed to clear diagnostic logs: ${errorMessage(error)}`);
              throw error;
            }
          })
        }
      />
    </div>
  );
}
