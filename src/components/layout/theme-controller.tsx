import { useEffect } from "react";
import { usePreferences } from "@/features/preferences/use-preferences";
import { COLOR_PRESETS, DEFAULT_ACCENT } from "@/shared/constants/colors";

/**
 * Injects accent CSS variables via a dynamic <style> tag appended to <head>.
 *
 * Why not root.style.setProperty?
 * In some WebKit-based WebViews (Tauri/macOS), inline CSS custom properties
 * can be overridden by class rules with the same specificity (e.g. `.light
 * { --primary }`) due to cascade resolution ordering. A <style> tag appended
 * after the main stylesheet always appears later in the cascade and therefore
 * wins over any class rule at equal specificity — no browser quirks.
 */
function applyAccentVars(primaryHsl: string, primaryFg: string) {
  const STYLE_ID = "cinetrack-accent-vars";
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  // :root.light/:root.dark (specificity 0,2,0) outrank the plain
  // .light { --primary } class rule (0,1,0) in the main stylesheet — but
  // only on <html>. ThemeController toggles "light"/"dark" on <body> too
  // (index.css's `body.light` background-gradient rule needs it there), and
  // a bare `.light{}` selector matches <body> directly regardless of what
  // <html> resolves to — a direct match wins over inheriting from a parent.
  // Dark mode never hit this (the base stylesheet's dark values live on the
  // unconditional `:root{}`, which never matches <body>), so this only
  // broke the accent-color override in light mode. Covering body.dark/
  // body.light explicitly closes that gap.
  style.textContent = `:root.dark,:root.light,body.dark,body.light{--primary:${primaryHsl};--primary-foreground:${primaryFg};--ring:${primaryHsl}}`;
}

// Query-param escape hatch for the Playwright visual-regression suite
// (e2e/visual/) only: `preferences.theme` comes from SQLite, which fails
// silently under `pnpm dev` alone (see CLAUDE.md's browser-preview note),
// so the app always renders in the "dark" fallback below there — Playwright
// can't otherwise produce a real light-theme screenshot outside the actual
// Tauri window. Never set by any real navigation, so it's a no-op for
// every real user.
function themeOverrideFromUrl(): "light" | "dark" | null {
  const value = new URLSearchParams(window.location.search).get("e2e-theme");
  return value === "light" || value === "dark" ? value : null;
}

export function ThemeController() {
  const { data: preferences } = usePreferences();

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const theme = themeOverrideFromUrl() ?? preferences?.theme ?? "dark";
    const accent = preferences?.accentColor ?? DEFAULT_ACCENT;

    // — Theme class
    root.classList.toggle("light", theme === "light");
    root.classList.toggle("dark", theme !== "light");
    body.classList.toggle("light", theme === "light");
    body.classList.toggle("dark", theme !== "light");

    // — Reduced motion / compact mode (see styles/index.css for the rules
    // these classes key off). These preferences were previously stored and
    // toggleable in Settings but never actually read anywhere else.
    root.classList.toggle("reduce-motion", preferences?.reduceMotion ?? false);
    root.classList.toggle("compact", preferences?.compactMode ?? false);

    // — Primary color CSS variables
    const preset = COLOR_PRESETS[accent];
    const primaryHsl = theme === "dark" ? preset.dark : preset.light;

    /**
     * Primary foreground contrast strategy:
     *
     * Dark mode:  primary is bright (L ≈ 52–70%).
     *             Dark fg (L≈10%) gives 5.1–10.5:1 (AA+, some AAA).
     *             White would fail on the lighter presets.
     *
     * Light mode: primary is dark (L ≈ 22–44%).
     *             Dark fg would fail on the darker presets.
     *             White fg (L≈98%) gives 4.8–9.8:1 (AA+, some AAA).
     */
    const primaryFg = theme === "dark" ? "225 25% 10%" : "0 0% 98%";

    applyAccentVars(primaryHsl, primaryFg);
  }, [preferences?.theme, preferences?.accentColor, preferences?.reduceMotion, preferences?.compactMode]);

  return null;
}
