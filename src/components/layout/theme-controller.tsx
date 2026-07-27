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
  // Use :root.dark and :root.light (specificity 0,2,0) to outrank the
  // .light { --primary } class rule (specificity 0,1,0) in the main stylesheet.
  style.textContent = `:root.dark,:root.light{--primary:${primaryHsl};--primary-foreground:${primaryFg};--ring:${primaryHsl}}`;
}

export function ThemeController() {
  const { data: preferences } = usePreferences();

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const theme = preferences?.theme ?? "dark";
    const accent = preferences?.accentColor ?? DEFAULT_ACCENT;

    // — Theme class
    root.classList.toggle("light", theme === "light");
    root.classList.toggle("dark", theme !== "light");
    body.classList.toggle("light", theme === "light");
    body.classList.toggle("dark", theme !== "light");

    // — Primary color CSS variables
    const preset = COLOR_PRESETS[accent];
    const primaryHsl = theme === "dark" ? preset.dark : preset.light;

    /**
     * Primary foreground contrast strategy:
     *
     * Dark mode:  primary is bright (L ≈ 52–70%).
     *             Dark fg (L≈8%) gives ~11–18:1 (AAA ✓).
     *             White would give ~1.3:1 (FAIL).
     *
     * Light mode: primary is dark (L ≈ 35–44%).
     *             Dark fg (L≈8%) gives ~1.8:1 (FAIL — same dark-on-dark).
     *             White fg (L≈98%) gives ~9:1 (AAA ✓).
     */
    const primaryFg = theme === "dark" ? "225 25% 10%" : "0 0% 98%";

    applyAccentVars(primaryHsl, primaryFg);
  }, [preferences?.theme, preferences?.accentColor]);

  return null;
}
