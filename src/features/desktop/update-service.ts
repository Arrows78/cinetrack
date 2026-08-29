import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import i18n from "@/i18n";
import { defineCommand, invokeTypedCommand } from "@/shared/lib/invoke";
import { isTauriApp } from "@/shared/lib/platform";
import { UserFacingError } from "@/shared/lib/user-facing-error";

const updaterCommands = {
  isConfigured: defineCommand<undefined, boolean>("updater_is_configured"),
} as const;

export const updateService = {
  async checkAndInstall(onProgress?: (downloaded: number, total?: number) => void): Promise<string> {
    if (!isTauriApp()) return i18n.t("desktop.updateNativeOnly");

    const configured = await invoke<boolean>("updater_is_configured").catch(() => false);
    if (!configured) {
      return i18n.t("desktop.updateChannelNotConfigured");
    }

    const update = await check().catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      if (/endpoint|pubkey|public key|configuration/i.test(detail)) {
        throw new UserFacingError(i18n.t("desktop.updateChannelNotConfigured"));
      }
      throw error;
    });
    if (!update) return i18n.t("desktop.upToDate");
    let downloaded = 0;
    let total: number | undefined;
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") total = event.data.contentLength ?? undefined;
      if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        onProgress?.(downloaded, total);
      }
    });
    await relaunch();
    return i18n.t("desktop.updateInstalled", { version: update.version });
  },
};
