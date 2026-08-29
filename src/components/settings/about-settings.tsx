import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Trash2 } from "lucide-react";
import { getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/use-toast";
import { logger } from "@/shared/lib/logger";
import { imageCache } from "@/features/media/image-cache";
import { errorMessage } from "@/shared/lib/errors";
import { isTauriApp } from "@/shared/lib/platform";
import { formatBytes } from "@/shared/utils/format";

interface VersionInfo {
  appVersion: string;
  tauriVersion: string;
}

export function AboutSettings() {
  const { t } = useTranslation();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [cacheSize, setCacheSize] = useState<number | null>(null);
  const [isMeasuring, setIsMeasuring] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [pendingClear, setPendingClear] = useState(false);

  const measureCacheSize = () => {
    void imageCache
      .size()
      .then(setCacheSize)
      .catch((error: unknown) => {
        // Measuring is best-effort: log it and fall back to "unknown" rather
        // than blocking the rest of the card (Clear still works either way).
        logger.warn(`Failed to measure the image cache size: ${errorMessage(error)}`);
        setCacheSize(null);
      })
      .finally(() => setIsMeasuring(false));
  };

  const refreshCacheSize = () => {
    setIsMeasuring(true);
    measureCacheSize();
  };

  useEffect(() => {
    // getVersion/getTauriVersion are Tauri IPC calls — like the rest of this
    // app's IPC surface, they only resolve inside the Tauri webview (see
    // isTauriApp's other call sites in desktop-settings.tsx).
    if (isTauriApp())
      void Promise.all([getVersion(), getTauriVersion()])
        .then(([appVersion, tauriVersion]) => setVersionInfo({ appVersion, tauriVersion }))
        .catch((error: unknown) => logger.warn(`Failed to read the app version: ${errorMessage(error)}`));
    // isMeasuring already starts true, so the initial measurement skips
    // refreshCacheSize's synchronous setIsMeasuring(true) to avoid a
    // cascading render straight out of the effect body.
    measureCacheSize();
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

  const clearCache = async () => {
    setIsClearing(true);
    try {
      await imageCache.clear();
      setPendingClear(false);
      toast({ description: t("settings.about.cacheCleared"), variant: "success" });
      refreshCacheSize();
    } catch (error) {
      logger.warn(`Failed to clear the image cache: ${errorMessage(error)}`);
      toast({ description: t("settings.about.cacheClearFailed"), variant: "error" });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.about.versionTitle")}</CardTitle>
          <CardDescription>{t("settings.about.versionDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {versionInfo ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="rounded-xl border border-border bg-card p-3 font-mono text-xs">
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
            <p className="text-xs text-muted-foreground">{t("settings.about.versionUnavailable")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.about.cacheTitle")}</CardTitle>
          <CardDescription>{t("settings.about.cacheDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {isMeasuring
              ? t("settings.about.cacheMeasuring")
              : t("settings.about.cacheSize", { size: formatBytes(cacheSize ?? 0) })}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            disabled={isMeasuring || isClearing}
            onClick={() => setPendingClear(true)}
          >
            <Trash2 className="mr-2 size-4" aria-hidden="true" />
            {t("settings.about.clearCache")}
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendingClear}
        onOpenChange={(open) => !open && !isClearing && setPendingClear(false)}
        title={t("settings.about.clearCacheConfirmTitle")}
        description={t("settings.about.clearCacheConfirmDescription", { size: formatBytes(cacheSize ?? 0) })}
        confirmLabel={t("settings.about.clearCache")}
        cancelLabel={t("common.cancel")}
        isConfirming={isClearing}
        onConfirm={() => void clearCache()}
      />
    </div>
  );
}
