# Contributing

## Prerequisites

- Node.js, version pinned in `.nvmrc` (currently 22)
- pnpm 10.6.5 (see `packageManager` in `package.json`)
- Rust toolchain (stable) with `cargo`, for the Tauri backend in `src-tauri/`

Install dependencies with:

```bash
pnpm install
```

## Running the app

```bash
pnpm tauri dev        # run the desktop app — the only place SQLite/IPC actually works
pnpm dev              # Vite server alone, for UI/layout iteration
```

`pnpm dev` alone (or a plain browser tab) still renders the UI, but every
SQLite read/write fails silently, and the browser-preview banner will flag
this. That's expected — use `pnpm tauri dev` whenever you need real data.

## Before opening a PR

Run the full validation chain:

```bash
pnpm validate
```

This runs, in order: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`,
`pnpm test:coverage`, `pnpm build`, `pnpm cargo:check`, `pnpm cargo:clippy`,
and `pnpm cargo:test`. All of it should pass before you open a pull request.

You can also run any of these steps individually — see `package.json`'s
`scripts` section for the full list, including `pnpm test:watch` for
iterating on tests.

## Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): summary` — e.g. `fix(pages): add remote-error state missed by the prior pass`.
Keep the scope to the touched feature or area.
