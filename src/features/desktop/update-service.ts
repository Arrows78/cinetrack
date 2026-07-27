import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { isTauriApp } from "@/shared/lib/platform";

export const updateService = {
  async checkAndInstall(onProgress?: (downloaded: number, total?: number) => void): Promise<string> {
    if (!isTauriApp()) return "Les mises à jour natives sont disponibles dans l’application desktop.";

    const configured = await invoke<boolean>("updater_is_configured").catch(() => false);
    if (!configured) {
      return "Le canal de mise à jour desktop n’est pas encore configuré (endpoint et clé publique requis).";
    }

    const update = await check().catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      if (/endpoint|pubkey|public key|configuration/i.test(detail)) {
        throw new Error("Le canal de mise à jour desktop n’est pas encore configuré (endpoint et clé publique requis).");
      }
      throw error;
    });
    if (!update) return "CineTrack est à jour.";
    let downloaded = 0; let total: number | undefined;
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") total = event.data.contentLength ?? undefined;
      if (event.event === "Progress") { downloaded += event.data.chunkLength; onProgress?.(downloaded, total); }
    });
    await relaunch();
    return `Version ${update.version} installée.`;
  },
};
