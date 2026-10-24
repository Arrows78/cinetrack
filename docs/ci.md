# Continuous integration

The CI pipeline is split into a frontend job, a cross-platform Rust job, and a
visual-regression workflow. All jobs use pinned GitHub Action revisions and
cancel superseded runs for the same branch or pull request.

The frontend job checks generated contracts, architecture boundaries, lint,
formatting, TypeScript, unit coverage, the production build, version
consistency, and bundle budgets. `pnpm bundle:check` enforces a 4 MiB total
`dist/` budget and a 450 KiB maximum JavaScript chunk.

The budget exempts Clerk's vendor chunk (`dist/assets/clerk.*.js`): `clerk-js/no-rhc`
is already the smallest entry point Clerk offers, so the exemption is scoped to
that exact chunk rather than raising the per-chunk limit for everything — see
`EXEMPT_LARGE_CHUNKS` in `scripts/check-bundle-budget.mjs`.

The Rust matrix runs on Linux, Windows, and macOS. Build-script and linker
warnings are not denied (`.cargo/config.toml` overrides `build.warnings` and
passes `/IGNORE` for libsodium-sys's harmless LNK4098/LNK4099 on Windows); only
the explicit `cargo clippy -- -D warnings` step is the warnings-as-errors gate
for our own lints. It checks compilation,
Clippy with warnings denied, formatting, the SQLite-backed test suite, and
generated TypeScript bindings. The optional scale benchmark remains
informational and is not a merge gate.

Playwright currently covers responsive/theme visual shells only. It does not
drive a Tauri window or a real SQLite database; functional end-to-end coverage
is intentionally tracked as a separate future workstream. If a UI change makes
`visual-regression` fail on `main`, `refresh-baselines-pr` regenerates the
Linux baselines and opens a PR with them automatically — see
[`e2e/visual/README.md`](../e2e/visual/README.md) for that workflow and the
manual `bootstrap-baselines` alternative.

## One check to require

`ci-ok` (last job of `ci.yml`) is green only when `frontend`, `rust` (all three
systems), `ios`, `cargo-audit` and `osv-scan` all succeeded; it also fails when
one of them is skipped or cancelled, which a branch-protection rule listing the
jobs one by one would read as passing. Require `ci-ok` and
`visual-regression` in the protection rule of `main`, and nothing else. The
database benchmark runs as a separate `performance` job, informational and
never part of `ci-ok`.

## Dependabot

Dependabot waits three days before proposing a new version (`cooldown`), and
`rust-ini` is held at 0.21.1 (see the comment in `dependabot.yml`).

The npm `@tauri-apps/*` packages and their Rust crates must share a major.minor
(the Tauri CLI refuses to build otherwise, but only at the iOS build step).
Dependabot bumps the two sides in separate PRs, so `pnpm version:check` — run by
the frontend job — compares the installed npm versions with `Cargo.lock` and
fails early, naming the pairs. When it fails on a Dependabot PR, bump the other
side in the same PR.

## Advisory ignores

`cargo-audit` reads `src-tauri/.cargo/audit.toml` and `osv-scan` reads
`osv-scanner.toml`; every ignore carries its reason, and the osv ones expire on
their own (`ignoreUntil`). Keep the two files in step.

For local changes, run the narrowest relevant command while iterating and use
`pnpm validate` before opening a pull request.
