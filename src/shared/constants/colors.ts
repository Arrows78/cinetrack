export type AccentColor = "violet" | "blue" | "teal" | "green" | "amber" | "orange" | "rose" | "red";

export interface ColorPreset {
  /** HSL values for dark theme (lighter for readability on dark bg) */
  dark: string;
  /** HSL values for light theme (darker for readability on light bg) */
  light: string;
  /** CSS hsl() string for swatches (light variant for settings UI) */
  swatch: string;
}

/**
 * Accent presets calibrated to keep both supported uses at WCAG AA (≥4.5:1):
 * primary-colored text on the app background, and primary-foreground text on
 * a primary-colored control. Dark presets pair with the dark foreground token;
 * light presets pair with the near-white foreground token (ThemeController).
 *
 * Some combinations reach AAA, but AA is the explicit cross-preset contract.
 * Keep the regression matrix in contrast.test.ts in sync when editing values.
 */
export const COLOR_PRESETS: Record<AccentColor, ColorPreset> = {
  violet: {
    dark: "252 80% 70%",
    light: "252 80% 42%",
    swatch: "hsl(252 80% 42%)",
  },
  blue: {
    dark: "217 88% 68%",
    light: "217 88% 39%",
    swatch: "hsl(217 88% 39%)",
  },
  teal: {
    dark: "174 72% 52%",
    light: "174 72% 22%",
    swatch: "hsl(174 72% 22%)",
  },
  green: {
    dark: "142 60% 52%",
    light: "142 60% 24%",
    swatch: "hsl(142 60% 24%)",
  },
  amber: {
    dark: "38 90% 58%",
    light: "38 90% 24%",
    swatch: "hsl(38 90% 24%)",
  },
  orange: {
    dark: "22 88% 60%",
    light: "22 88% 39%",
    swatch: "hsl(22 88% 39%)",
  },
  rose: {
    dark: "338 78% 67%",
    light: "338 78% 41%",
    swatch: "hsl(338 78% 41%)",
  },
  red: {
    dark: "0 74% 65%",
    light: "0 74% 44%",
    swatch: "hsl(0 74% 44%)",
  },
};

export const DEFAULT_ACCENT: AccentColor = "violet";

/**
 * Official brand colors for social sign-in providers (see provider-icon.tsx
 * and auth-providers-step.tsx). These can't be theme tokens — a provider's
 * brand color is fixed by that provider, not by CineTrack's own light/dark
 * or accent system — so they live here as a documented reference constant
 * instead of scattered hex literals.
 */
export const OAUTH_BRAND_COLORS = {
  google: {
    blue: "#4285F4",
    green: "#34A853",
    yellow: "#FBBC05",
    red: "#EA4335",
  },
  facebook: "#1877F2",
} as const;

/**
 * Official brand colors for streaming platforms (see the "Browse by
 * platform" grid in home-page.tsx). Same reasoning as OAUTH_BRAND_COLORS:
 * a platform's brand color is fixed externally, not by CineTrack's own
 * theme, so it lives here as a documented reference constant instead of a
 * scattered hex literal in the feature file that consumes it.
 */
export const PLATFORM_BRAND_COLORS: Record<number, string> = {
  8: "#E50914", // Netflix
  119: "#00A8E0", // Prime Video
  337: "#0063E5", // Disney+
  384: "#5822BF", // Max
  15: "#1CE783", // Hulu
  350: "#444444", // Apple TV+
};
