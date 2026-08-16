import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ThemeController } from "../theme-controller";
import { COLOR_PRESETS } from "@/shared/constants/colors";

let preferences: { theme: string; accentColor: string } = { theme: "dark", accentColor: "violet" };
vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => ({ data: preferences }),
}));

afterEach(() => {
  document.documentElement.className = "";
  document.body.className = "";
  document.getElementById("cinetrack-accent-vars")?.remove();
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
});
