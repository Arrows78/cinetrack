import { useSyncExternalStore } from "react";
import { usePreferences } from "@/features/preferences/use-preferences";
import { defaultPreferences } from "@/shared/constants/preferences-schema";

export type ResolvedTheme = "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeToSystemTheme(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function systemTheme(): ResolvedTheme {
  // No matchMedia (some test environments): dark is the app's own default.
  if (typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/** The operating system's current appearance, updated live when it changes. */
export function useSystemTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeToSystemTheme, systemTheme, () => "dark");
}

/** The theme actually painted: the stored preference, with "system" replaced by the OS appearance. */
export function useResolvedTheme(): ResolvedTheme {
  const { data: preferences } = usePreferences();
  const system = useSystemTheme();
  const theme = preferences?.theme ?? defaultPreferences.theme;
  return theme === "system" ? system : theme;
}
