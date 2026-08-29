import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ThemeController } from "../theme-controller";
import { COLOR_PRESETS, DEFAULT_ACCENT } from "@/shared/constants/colors";

type TestPreferences = {
  theme: string;
  accentColor: string;
  reduceMotion?: boolean;
  compactMode?: boolean;
};

let preferences: TestPreferences | undefined = { theme: "dark", accentColor: "violet" };
vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => ({ data: preferences }),
}));

afterEach(() => {
  document.documentElement.className = "";
  document.body.className = "";
  document.getElementById("cinetrack-accent-vars")?.remove();
  window.history.replaceState(null, "", "/");
});

describe("ThemeController", () => {
  it("toggles the light/dark class on both <html> and <body>", () => {
    preferences = { theme: "light", accentColor: "violet" };
    render(<ThemeController />);

    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.body.classList.contains("light")).toBe(true);
  });

  // Regression test: the injected override used to only target
  // :root.light/:root.dark, which loses to index.css's plain `.light {
  // --primary }` rule on <body> (a direct match on body beats inheriting
  // from <html>) — invisible in dark mode, since the base stylesheet's dark
  // values live on the unconditional `:root{}`, which never matches body.
  it("scopes the accent CSS override to body.light/body.dark too, not just :root", () => {
    preferences = { theme: "light", accentColor: "teal" };
    render(<ThemeController />);

    const style = document.getElementById("cinetrack-accent-vars");
    expect(style?.textContent).toContain("body.light");
    expect(style?.textContent).toContain("body.dark");
    expect(style?.textContent).toContain(COLOR_PRESETS.teal.light);
  });

  it("toggles the dark class (not light) on both <html> and <body> for the dark theme", () => {
    preferences = { theme: "dark", accentColor: "violet" };
    render(<ThemeController />);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(document.body.classList.contains("dark")).toBe(true);
    expect(document.body.classList.contains("light")).toBe(false);
  });

  it("falls back to dark theme and the default accent when preferences data is undefined", () => {
    preferences = undefined;
    render(<ThemeController />);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    const style = document.getElementById("cinetrack-accent-vars");
    expect(style?.textContent).toContain(COLOR_PRESETS[DEFAULT_ACCENT].dark);
  });

  it("does not add reduce-motion/compact classes when those preferences are absent or false", () => {
    preferences = { theme: "dark", accentColor: "violet" };
    render(<ThemeController />);

    expect(document.documentElement.classList.contains("reduce-motion")).toBe(false);
    expect(document.documentElement.classList.contains("compact")).toBe(false);
  });

  it("adds reduce-motion and compact classes when those preferences are enabled", () => {
    preferences = { theme: "dark", accentColor: "violet", reduceMotion: true, compactMode: true };
    render(<ThemeController />);

    expect(document.documentElement.classList.contains("reduce-motion")).toBe(true);
    expect(document.documentElement.classList.contains("compact")).toBe(true);
  });

  it("uses the dark-mode accent preset and a dark primary-foreground for dark theme", () => {
    preferences = { theme: "dark", accentColor: "teal" };
    render(<ThemeController />);

    const style = document.getElementById("cinetrack-accent-vars");
    expect(style?.textContent).toContain(COLOR_PRESETS.teal.dark);
    expect(style?.textContent).toContain("225 25% 10%");
  });

  it("uses a near-white primary-foreground for light theme", () => {
    preferences = { theme: "light", accentColor: "teal" };
    render(<ThemeController />);

    const style = document.getElementById("cinetrack-accent-vars");
    expect(style?.textContent).toContain("0 0% 98%");
  });

  it("the ?e2e-theme URL param overrides preferences.theme (Playwright visual-suite escape hatch)", () => {
    preferences = { theme: "dark", accentColor: "violet" };
    window.history.replaceState(null, "", "/?e2e-theme=light");
    render(<ThemeController />);

    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.body.classList.contains("light")).toBe(true);
  });

  it("ignores an unrecognized ?e2e-theme value and falls back to preferences.theme", () => {
    preferences = { theme: "light", accentColor: "violet" };
    window.history.replaceState(null, "", "/?e2e-theme=nonsense");
    render(<ThemeController />);

    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("reuses the existing <style> tag instead of inserting a second one when preferences change", () => {
    preferences = { theme: "dark", accentColor: "violet" };
    const { rerender } = render(<ThemeController />);
    expect(document.querySelectorAll("#cinetrack-accent-vars")).toHaveLength(1);

    preferences = { theme: "dark", accentColor: "amber" };
    rerender(<ThemeController />);

    expect(document.querySelectorAll("#cinetrack-accent-vars")).toHaveLength(1);
    const style = document.getElementById("cinetrack-accent-vars");
    expect(style?.textContent).toContain(COLOR_PRESETS.amber.dark);
  });
});
