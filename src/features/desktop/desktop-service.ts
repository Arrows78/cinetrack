import { listen } from "@tauri-apps/api/event";
// onOpenUrl is dynamically imported below to avoid conflicting with the
// dynamic import in auth-provider (Vite warning about static + dynamic).
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { router } from "@/app/router-config";
import { isTauriApp } from "@/shared/lib/platform";

const SHORTCUT = "CommandOrControl+Shift+K";
const routeFromUrl = (raw: string): string | null => {
  try {
    const url = new URL(raw);
    const kind = url.hostname;
    const id = url.pathname.replace(/^\//, "");
    if (kind === "movie" && /^\d+$/.test(id)) return `/movies/${id}`;
    if (kind === "series" && /^\d+$/.test(id)) return `/series/${id}`;
    if (kind === "person" && /^\d+$/.test(id)) return `/people/${id}`;
    if (kind === "tonight") return "/watch-tonight";
  } catch {
    return null;
  }
  return null;
};
const navigate = (path: string) => void router.navigate({ to: path as never });

export const desktopService = {
  async initialize(): Promise<() => void> {
    if (!isTauriApp()) return () => undefined;
    const cleanups: Array<() => void> = [];
    try {
      await register(SHORTCUT, () => window.dispatchEvent(new Event("cinetrack:command-palette")));
      cleanups.push(() => void unregister(SHORTCUT));
    } catch (error) {
      console.warn("Global shortcut unavailable", error);
    }
    try {
      const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
      cleanups.push(
        await onOpenUrl((urls) => {
          const route = urls.map(routeFromUrl).find(Boolean);
          if (route) navigate(route);
        })
      );
    } catch (error) {
      console.warn("Deep links unavailable", error);
    }
    try {
      cleanups.push(await listen<string>("cinetrack:navigate", (event) => navigate(event.payload)));
    } catch (error) {
      console.warn("Tray navigation unavailable", error);
    }
    try {
      cleanups.push(
        await listen<string>("cinetrack:deep-link", (event) => {
          const route = routeFromUrl(event.payload);
          if (route) navigate(route);
        })
      );
    } catch (error) {
      console.warn("Single-instance deep links unavailable", error);
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  },
};
