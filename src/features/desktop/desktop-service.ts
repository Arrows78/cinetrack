import { router } from "@/app/router-config";
import { isTauriApp } from "@/shared/lib/platform";
import { defaultPreferences, preferencesRepository } from "@/features/preferences/preferences-repository";
import { toTauriGlobalShortcut } from "@/shared/lib/keyboard-shortcut";

const openCommandPalette = () => window.dispatchEvent(new Event("cinetrack:command-palette"));

// Tracks whichever global-shortcut string is actually registered right now
// (in tauri-plugin-global-shortcut's own format), so both initialize()'s
// cleanup and a later updateGlobalShortcut() call agree on what to
// unregister before registering the next one.
let registeredGlobalShortcut: string | null = null;

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
    const { register, unregister, onOpenUrl, listen } = await import("@/shared/lib/tauri-desktop");
    const cleanups: Array<() => void> = [];
    try {
      const preferences = await preferencesRepository.getPreferences();
      const shortcut = toTauriGlobalShortcut(
        preferences.globalCommandPaletteShortcut ?? defaultPreferences.globalCommandPaletteShortcut
      );
      await register(shortcut, openCommandPalette);
      registeredGlobalShortcut = shortcut;
      // Non-null: this closure is only ever pushed right after the
      // assignment above, and nothing else in this module ever sets
      // registeredGlobalShortcut back to null once it's held a value.
      cleanups.push(() => void unregister(registeredGlobalShortcut!));
    } catch (error) {
      console.warn("Global shortcut unavailable", error);
    }
    try {
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

  // Called by the Settings UI right after persisting a new
  // globalCommandPaletteShortcut preference, so the OS-level binding
  // updates live instead of only taking effect on the next app launch.
  // `next` is the normalized preference-shape shortcut (e.g.
  // "mod+shift+k"); converted to tauri-plugin-global-shortcut's format
  // here, same as initialize() does.
  async updateGlobalShortcut(next: string): Promise<void> {
    if (!isTauriApp()) return;
    const { register, unregister } = await import("@/shared/lib/tauri-desktop");
    const nextShortcut = toTauriGlobalShortcut(next);
    if (nextShortcut === registeredGlobalShortcut) return;
    try {
      if (registeredGlobalShortcut) await unregister(registeredGlobalShortcut);
      await register(nextShortcut, openCommandPalette);
      registeredGlobalShortcut = nextShortcut;
    } catch (error) {
      console.warn("Global shortcut unavailable", error);
    }
  },
};
