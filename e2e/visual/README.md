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

## Baselines

Screenshot comparison is only meaningful against a baseline rendered by the
same OS and font stack as the one doing the comparing — font hinting and
subpixel anti-aliasing differ across operating systems even in the same
browser engine. This suite runs in CI on `ubuntu-latest`, so its baselines
have to come from a Linux render. Nothing rendered on macOS or Windows can be
committed as a baseline here; `playwright.config.ts`'s `maxDiffPixelRatio:
0.02` tolerance absorbs render-to-render noise on the _same_ OS, not
cross-OS differences, which are much larger than that.

The 50 baselines committed under `__screenshots__/` (5 viewports x 5 screens
x 2 themes) were generated in a native `linux/arm64` Ubuntu 24.04 container
(not `linux/amd64` under QEMU emulation — Chromium's GPU process reliably
crashes under that emulation on an Apple Silicon host; a native-arch
container avoids it entirely). This matches the OS, Ubuntu version, and
installed font/library stack `ubuntu-latest` CI runners use — the thing this
suite's own tolerance is actually meant to absorb noise from — but not their
CPU architecture. Font hinting and anti-aliasing are software-rasterized and
architecturally deterministic (not FPU/SIMD-dependent the way, say, a 3D
render might be), so this is expected to compare cleanly against `ubuntu-latest`
(x86_64) CI runs; if a future CI run ever disagrees specifically at the
level `maxDiffPixelRatio: 0.02` doesn't absorb, regenerate via the
`bootstrap-baselines` job below (which does run on real x86_64) rather than
assuming the arch is the cause without checking the diff first.

## Regenerating baselines

Baselines must be produced by a Linux run — either CI or a local Docker
container using the same base image CI uses. Do not generate them locally on
macOS/Windows and commit them; they will permanently mismatch what CI
renders.

**Automatically, after the fact:** if `visual-regression` fails on a push to
`main`, `visual.yml`'s `refresh-baselines-pr` job regenerates the screenshots
and — only if that actually changed any pixels, not on a genuine test crash —
opens a `chore/refresh-visual-baselines` PR with them for review. This is the
common case (a UI change landed and nobody manually re-bootstrapped first);
review the diffs like any other PR and merge. The steps below are for the two
cases that job doesn't cover: bootstrapping from nothing, or refreshing
baselines against a PR branch's own changes before merging it.

**Via CI (no Docker required):**

1. From the Actions tab, run the "Visual regression" workflow manually
   (`workflow_dispatch`) — this triggers the `bootstrap-baselines` job.
2. Download the `visual-baselines` artifact from that run.
3. Extract it into `e2e/visual/__screenshots__/`, review the images (they're
   real renders — look at them before trusting them as "correct"), and
   commit them.

**Via a local Linux container**, if Docker (or another OCI runtime) is
available: run the same install + `pnpm test:visual:update` steps from
`visual.yml`'s `bootstrap-baselines` job inside a Linux container mounting
this repo, then commit the resulting `e2e/visual/__screenshots__/` files
from the host. On an Apple Silicon host, prefer a native `--platform=linux/arm64`
container over `linux/amd64` for the GPU-crash reason above — see "Baselines"
above for why that still matches what CI's x86_64 runners would render.

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
