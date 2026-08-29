import { test, expect, type Page } from "@playwright/test";

// Every screen this suite covers renders a real, meaningful shell under
// `pnpm dev` alone (no Tauri IPC, no real SQLite data — see CLAUDE.md's
// browser-preview note): either it's genuinely data-independent
// (/design-system), or the empty/remote-error state it falls back to is
// itself a real, worth-testing layout. Movie/series detail pages are
// deliberately excluded: they need a live TMDB call, and ci.yml's frontend
// job already refuses to run with a real VITE_TMDB_API_TOKEN set (it would
// bake the token into the built bundle) — there's no way to render their
// real content in this CI environment at all, only a permanent error state.
const SCREENS = [
  { name: "home", path: "/" },
  { name: "library", path: "/library" },
  { name: "settings", path: "/settings" },
  { name: "stats", path: "/stats" },
  { name: "design-system", path: "/design-system" },
] as const;

const THEMES = ["light", "dark"] as const;

async function gotoStable(page: Page, path: string, theme: (typeof THEMES)[number]) {
  const separator = path.includes("?") ? "&" : "?";
  await page.goto(`${path}${separator}e2e-theme=${theme}`);
  // Real user motion preferences aren't under test here, and a mid-flight
  // entrance animation is exactly the kind of thing that makes a
  // screenshot suite flaky for reasons that have nothing to do with a
  // real visual regression.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForLoadState("networkidle");
}

for (const screen of SCREENS) {
  for (const theme of THEMES) {
    test(`${screen.name} — ${theme}`, async ({ page }) => {
      await gotoStable(page, screen.path, theme);
      // /design-system's in-page nav highlight (useActiveSection's
      // IntersectionObserver, catalog-primitives.tsx) reacts to the scroll
      // position a full-page capture steps through, which can need more
      // than the 5s default to settle into two consecutive identical
      // frames — found bootstrapping this suite's baselines, reproduced
      // consistently at 1024px specifically (the lg: breakpoint boundary).
      await expect(page).toHaveScreenshot(`${screen.name}-${theme}.png`, { fullPage: true, timeout: 20_000 });
    });
  }
}
