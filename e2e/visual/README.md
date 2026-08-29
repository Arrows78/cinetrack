# Visual regression suite

Playwright screenshots of the app shell (home, library, settings, stats,
design-system) at 5 viewport widths (360/640/768/1024/1440, the same
breakpoints CLAUDE.md documents as live in the shipped app) × 2 themes
(light/dark, via the `?e2e-theme` override in
[`theme-controller.tsx`](../../src/components/layout/theme-controller.tsx)).

It runs against `pnpm dev` alone, not `pnpm tauri dev` — none of the covered
screens need real SQLite data (see CLAUDE.md's browser-preview note). Movie
and series detail pages are excluded: they need a live TMDB call, and
`ci.yml`'s frontend job already refuses to build with a real
`VITE_TMDB_API_TOKEN` set.

## Why there are no baseline images in this repo yet

Screenshot comparison is only meaningful against a baseline rendered by the
same OS and font stack as the one doing the comparing — font hinting and
subpixel anti-aliasing differ across operating systems even in the same
browser engine. This suite runs in CI on `ubuntu-latest`, so its baselines
have to come from a Linux render. Nothing rendered on macOS or Windows can be
committed as a baseline here; `playwright.config.ts`'s `maxDiffPixelRatio:
0.02` tolerance absorbs render-to-render noise on the _same_ OS, not
cross-OS differences, which are much larger than that.

No Linux environment was available to generate them when this suite was
built (no local container runtime, and nothing had been pushed to a branch
CI could run against yet). Until baselines are generated, `visual.yml`'s
`visual-regression` job runs the suite in `continue-on-error` mode: every
comparison fails with "no baseline found," which is expected and not a real
regression, and does not block merges.

## Generating (or regenerating) baselines

Baselines must be produced by a Linux run — either CI or a local Docker
container using the same base image CI uses. Do not generate them locally on
macOS/Windows and commit them; they will permanently mismatch what CI
renders.

**Via CI (no Docker required):**

1. From the Actions tab, run the "Visual regression" workflow manually
   (`workflow_dispatch`) — this triggers the `bootstrap-baselines` job.
2. Download the `visual-baselines` artifact from that run.
3. Extract it into `e2e/visual/__screenshots__/`, review the images (they're
   real renders — look at them before trusting them as "correct"), and
   commit them.
4. Once committed, remove the `continue-on-error: true` step in
   `visual-regression` (in `.github/workflows/visual.yml`) so the suite
   actually gates PRs again.

**Via a local Linux container**, if Docker (or another OCI runtime) is
available: run the same install + `pnpm test:visual:update` steps from
`visual.yml`'s `bootstrap-baselines` job inside a Linux container mounting
this repo, then commit the resulting `e2e/visual/__screenshots__/` files
from the host.

## Running locally (mechanical check only)

```bash
pnpm exec playwright install --with-deps chromium
pnpm test:visual
```

On macOS/Windows this either fails every screenshot (no matching baseline
exists there) or, if you pass `--update-snapshots`, writes OS-local images
that must **not** be committed — useful only to confirm the suite itself
runs (pages load, the theme override works, no test crashes), not to
validate against the real Linux baselines.
