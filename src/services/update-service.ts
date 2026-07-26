import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { isTauriApp } from "@/shared/lib/platform";

export const updateService = {
  async checkAndInstall(onProgress?: (downloaded: number, total?: number) => void): Promise<string> {
    if (!isTauriApp()) return "Les mises à jour natives sont disponibles dans l’application desktop.";
    const update = await check();
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
