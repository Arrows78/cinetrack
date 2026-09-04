# Continuous integration

The CI pipeline is split into a frontend job, a cross-platform Rust job, and a
visual-regression workflow. All jobs use pinned GitHub Action revisions and
cancel superseded runs for the same branch or pull request.

The frontend job checks generated contracts, architecture boundaries, lint,
formatting, TypeScript, unit coverage, the production build, version
consistency, and bundle budgets. `pnpm bundle:check` enforces a 4 MiB total
`dist/` budget and a 450 KiB maximum JavaScript chunk.

The Rust matrix runs on Linux, Windows, and macOS. It checks compilation,
Clippy with warnings denied, formatting, the SQLite-backed test suite, and
generated TypeScript bindings. The optional scale benchmark remains
informational and is not a merge gate.

Playwright currently covers responsive/theme visual shells only. It does not
drive a Tauri window or a real SQLite database; functional end-to-end coverage
is intentionally tracked as a separate future workstream.

For local changes, run the narrowest relevant command while iterating and use
`pnpm validate` before opening a pull request.
