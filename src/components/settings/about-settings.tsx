import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Compass, Copy } from "lucide-react";
import { getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import { logger } from "@/shared/lib/logger";
import { errorMessage } from "@/shared/lib/errors";
import { isTauriApp } from "@/shared/lib/platform";

interface VersionInfo {
  appVersion: string;
  tauriVersion: string;
}

export function AboutSettings() {
  const { t } = useTranslation();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    // getVersion/getTauriVersion are Tauri IPC calls — like the rest of this
    // app's IPC surface, they only resolve inside the Tauri webview (see
    // isTauriApp's other call sites in desktop-settings.tsx).
    if (isTauriApp())
      void Promise.all([getVersion(), getTauriVersion()])
        .then(([appVersion, tauriVersion]) => setVersionInfo({ appVersion, tauriVersion }))
        .catch((error: unknown) => logger.warn(`Failed to read the app version: ${errorMessage(error)}`));
  }, []);

  const copyVersion = () => {
    if (!versionInfo) return;
    void navigator.clipboard
      .writeText(
        t("settings.about.versionLine", { version: versionInfo.appVersion, tauriVersion: versionInfo.tauriVersion })
      )
      .then(() => toast({ description: t("settings.about.versionCopied"), variant: "success" }))
      .catch((error: unknown) => {
        logger.warn(`Failed to copy the app version: ${errorMessage(error)}`);
        toast({ description: t("settings.about.versionCopyFailed"), variant: "error" });
      });
  };

  // Mirrors desktop-service.ts's own "cinetrack:command-palette" event —
  // the same cross-tree-reach pattern, here so AboutSettings (inside
  // SettingsPage) can re-trigger AppShell's GuidedTour without a prop path
  // between two otherwise-unrelated component trees.
  const requestTour = () => window.dispatchEvent(new Event("cinetrack:guided-tour"));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.about.tourTitle")}</CardTitle>
          <CardDescription>{t("settings.about.tourDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={requestTour}>
            <Compass className="mr-2 size-4" aria-hidden="true" />
            {t("settings.about.takeTour")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.about.versionTitle")}</CardTitle>
          <CardDescription>{t("settings.about.versionDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {versionInfo ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="rounded-xl border border-border bg-card p-3 font-mono text-caption">
                {t("settings.about.versionLine", {
                  version: versionInfo.appVersion,
                  tauriVersion: versionInfo.tauriVersion,
                })}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={copyVersion}>
                <Copy className="mr-2 size-4" aria-hidden="true" />
                {t("settings.about.copyVersion")}
              </Button>
            </div>
          ) : (
            <p className="text-caption text-muted-foreground">{t("settings.about.versionUnavailable")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
