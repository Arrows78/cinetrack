# Legacy TypeScript migration snapshots

These files are immutable historical snapshots of the migration definitions
that used to be executed by the TypeScript SQLite test runner.

They are **not** migration sources and are kept outside `src/` only to make the
canonicalization change auditable in the same commit. Git history is the source
for any future archaeology; new schema changes must be added only to
`src-tauri/src/database/migrations.rs`.

`src/db/migrations/canonical.ts` parses the production Rust migration table for
SQLite contract tests, so production and tests execute the same version/name/SQL
sequence without a hand-maintained second copy.
