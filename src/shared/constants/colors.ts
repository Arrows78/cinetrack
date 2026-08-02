export type AccentColor = "violet" | "blue" | "teal" | "green" | "amber" | "orange" | "rose" | "red";

export interface ColorPreset {
  /** HSL values for dark theme (lighter for readability on dark bg) */
  dark: string;
  /** HSL values for light theme (darker for readability on light bg) */
  light: string;
  /** Display label */
  label: string;
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
    label: "Violet",
    swatch: "hsl(252 80% 42%)",
  },
  blue: {
    dark: "217 88% 68%",
    light: "217 88% 39%",
    label: "Bleu",
    swatch: "hsl(217 88% 39%)",
  },
  teal: {
    dark: "174 72% 52%",
    light: "174 72% 22%",
    label: "Teal",
    swatch: "hsl(174 72% 22%)",
  },
  green: {
    dark: "142 60% 52%",
    light: "142 60% 24%",
    label: "Vert",
    swatch: "hsl(142 60% 24%)",
  },
  amber: {
    dark: "38 90% 58%",
    light: "38 90% 24%",
    label: "Ambre",
    swatch: "hsl(38 90% 24%)",
  },
  orange: {
    dark: "22 88% 60%",
    light: "22 88% 39%",
    label: "Orange",
    swatch: "hsl(22 88% 39%)",
  },
  rose: {
    dark: "338 78% 67%",
    light: "338 78% 41%",
    label: "Rose",
    swatch: "hsl(338 78% 41%)",
  },
  red: {
    dark: "0 74% 65%",
    light: "0 74% 44%",
    label: "Rouge",
    swatch: "hsl(0 74% 44%)",
  },
};

export const DEFAULT_ACCENT: AccentColor = "violet";
