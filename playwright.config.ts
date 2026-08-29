import { defineConfig, devices } from "@playwright/test";

// The five breakpoints CLAUDE.md documents as live in the shipped app
// (tauri.conf.json's window minWidth=360 floor, Tailwind's sm:/md:/lg: at
// 640/768/1024, and 1440 as the default window width) — one Playwright
// project per width, each running every spec in e2e/visual/ at that size.
const VIEWPORT_WIDTHS = [360, 640, 768, 1024, 1440] as const;
const VIEWPORT_HEIGHT = 900;

export default defineConfig({
  testDir: "./e2e/visual",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // Screenshots are only meaningful compared against a baseline generated on
  // the same OS/renderer — see e2e/visual/README.md for why this repo's
  // baselines have to come from a Linux run (CI, or a local Docker
  // container matching it), not this machine's own OS.
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}",
  use: {
    baseURL: "http://localhost:1420",
    trace: "retain-on-failure",
  },
  webServer: {
    // Deliberately `pnpm dev` alone, not `pnpm tauri dev`: this suite tests
    // layout/responsive/theme rendering, none of which needs real SQLite
    // data (see CLAUDE.md's browser-preview note — every screen this suite
    // covers renders a real, meaningful shell without it).
    command: "pnpm dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  expect: {
    // A hand-picked tolerance, not a default left untouched: font hinting
    // and subpixel anti-aliasing differ release to release even on the
    // same OS/browser combination CI uses, and a 0% tolerance would make
    // this suite flaky on noise unrelated to any real visual change.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  projects: VIEWPORT_WIDTHS.map((width) => ({
    name: `${width}px`,
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width, height: VIEWPORT_HEIGHT },
    },
  })),
});
