import { router } from "@/app/router-config";
import { isTauriApp } from "@/shared/lib/platform";
import { defaultPreferences, preferencesRepository } from "@/features/preferences/preferences-repository";
import { trayCommands } from "@/features/desktop/tray-commands";
import { errorMessage } from "@/shared/lib/errors";
import { invokeTypedCommand } from "@/shared/lib/invoke";
import { toTauriGlobalShortcut } from "@/shared/lib/keyboard-shortcut";
import { logger } from "@/shared/lib/logger";

// tauri-plugin-global-shortcut calls its handler when the combination goes
// down and again when it comes back up: only the press opens the palette.
const openCommandPalette = (event?: { state?: string }) => {
  if (event?.state === "Released") return;
  window.dispatchEvent(new Event("cinetrack:command-palette"));
};

// Tracks whichever global-shortcut string is actually registered right now
// (in tauri-plugin-global-shortcut's own format), so both initialize()'s
// cleanup and a later updateGlobalShortcut() call agree on what to
// unregister before registering the next one.
let registeredGlobalShortcut: string | null = null;
// Which initialize() call registered it last: a cleanup only releases the
// binding it still owns, never one a newer initialize() has taken over.
let registeredBy: object | null = null;

// register/unregister are async and talk to the OS: run them one after the
// other, in call order. React StrictMode mounts, unmounts and re-mounts the
// shell in one tick, so initialize() #1's cleanup and initialize() #2's
// register overlap — unordered, the cleanup could release the binding the
// second call had just taken (leaving no shortcut at all) or the second
// register could be refused as a duplicate of the first.
let shortcutQueue: Promise<unknown> = Promise.resolve();
function serialised<T>(task: () => Promise<T>): Promise<T> {
  const run = shortcutQueue.then(task, task);
  shortcutQueue = run.catch(() => undefined);
  return run;
}

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
      const owner = {};
      await serialised(async () => {
        try {
          await register(shortcut, openCommandPalette);
        } catch (error) {
          // A previous initialize() whose cleanup hasn't run yet still holds
          // this very binding: that's not a failure, this call takes it over.
          if (registeredGlobalShortcut !== shortcut) throw error;
        }
        registeredGlobalShortcut = shortcut;
        registeredBy = owner;
      });
      cleanups.push(
        () =>
          void serialised(async () => {
            const current = registeredGlobalShortcut;
            if (registeredBy !== owner || current === null) return;
            registeredGlobalShortcut = null;
            registeredBy = null;
            try {
              await unregister(current);
            } catch (error) {
              logger.warn(`Global shortcut could not be released: ${errorMessage(error)}`);
            }
          })
      );
    } catch (error) {
      logger.warn(`Global shortcut unavailable: ${errorMessage(error)}`);
    }
    try {
      cleanups.push(
        await onOpenUrl((urls) => {
          const route = urls.map(routeFromUrl).find(Boolean);
          if (route) navigate(route);
        })
      );
    } catch (error) {
      logger.warn(`Deep links unavailable: ${errorMessage(error)}`);
    }
    try {
      cleanups.push(await listen<string>("cinetrack:navigate", (event) => navigate(event.payload)));
    } catch (error) {
      logger.warn(`Tray navigation unavailable: ${errorMessage(error)}`);
    }
    try {
      cleanups.push(
        await listen<string>("cinetrack:deep-link", (event) => {
          const route = routeFromUrl(event.payload);
          if (route) navigate(route);
        })
      );
    } catch (error) {
      logger.warn(`Single-instance deep links unavailable: ${errorMessage(error)}`);
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  },

  // The tray menu is native text: Rust rewrites its labels whenever the
  // interface language changes (and at start, once the language is known).
  async updateTrayLanguage(language: "en" | "fr"): Promise<void> {
    if (!isTauriApp()) return;
    await invokeTypedCommand(trayCommands.setLanguage, { language });
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
    return serialised(async () => {
      const nextShortcut = toTauriGlobalShortcut(next);
      if (nextShortcut === registeredGlobalShortcut) return;
      // The new binding is registered *before* the old one is released, and a
      // refusal (another app owns it, the OS rejects it) propagates: the caller
      // (Settings) must be able to tell the user and keep the previous binding,
      // instead of ending up with no system-wide shortcut while the screen
      // shows the new one.
      await register(nextShortcut, openCommandPalette);
      const previousShortcut = registeredGlobalShortcut;
      registeredGlobalShortcut = nextShortcut;
      if (previousShortcut) {
        try {
          await unregister(previousShortcut);
        } catch (error) {
          logger.warn(`Previous global shortcut could not be released: ${errorMessage(error)}`);
        }
      }
    });
  },
};
