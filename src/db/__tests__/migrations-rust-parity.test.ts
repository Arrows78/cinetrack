// @vitest-environment node
//
// The production Rust migration table is now the single authority and the
// TypeScript SQLite test runner parses it through migrations/canonical.ts.
// Keep an independent extractor here so a parser regression cannot silently
// change the migration list exercised by frontend integration tests.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrations } from "../migrations";

const rustSourcePath = fileURLToPath(new URL("../../../src-tauri/src/database/migrations.rs", import.meta.url));

interface ParsedMigration {
  version: number;
  name: string;
  statements: string[];
}

// Rust string literals in this file appear only as raw strings (multi-line
// CREATE TABLE bodies) or plain double-quoted strings (single-line
// statements / the `name` field) — no escapes needed for either since none
// of these strings contain a literal `"` or `"#`.
const literalPattern = /r#"([\s\S]*?)"#|"([^"\\]*)"/g;

function literalsIn(text: string): string[] {
  return Array.from(text.matchAll(literalPattern), (match) => match[1] ?? match[2] ?? "");
}

// Each migration in MIGRATIONS is a `Migration { version: N, name: "...",
// statements: &[...] }` block. Splitting on "}, Migration {" isolates each
// one — critically, a migration's own slice ends before the *next*
// migration's `version`/`name` fields begin, so those don't leak into this
// one's statement list the way they would if we split on "statements: &["
// instead (whose start offset sits *after* those fields).
function extractRustMigrations(source: string): ParsedMigration[] {
  const start = source.indexOf("statements: &[");
  const end = source.indexOf("\nfn is_tolerable_duplicate_column");
  if (start === -1 || end === -1) {
    throw new Error("Could not locate the MIGRATIONS array in migrations.rs — has it been renamed/restructured?");
  }
  // Back up to the start of migration 1's own block (its `version` field
  // precedes the first "statements: &[" we searched for above) so the
  // split below sees a consistent block shape for every migration,
  // including the first.
  const blockStart = source.lastIndexOf("Migration {", start);
  // Whitespace-tolerant on purpose: rustfmt controls the exact indentation
  // of "}, Migration {" (e.g. 4 spaces once inside the `&[...]` array), and
  // this split shouldn't silently stop matching every migration after the
  // next `cargo fmt` run just because indentation shifted.
  const blocks = source.slice(blockStart, end).split(/\n\s*\},\s*\n\s*Migration\s*\{/);

  return blocks.map((block) => {
    const versionMatch = /version:\s*(\d+)/.exec(block);
    const nameMatch = /name:\s*"([^"]*)"/.exec(block);
    const statementsStart = block.indexOf("statements: &[");
    if (!versionMatch || !nameMatch || statementsStart === -1) {
      throw new Error(`Could not parse a migration block in migrations.rs: ${block.slice(0, 80)}...`);
    }
    return {
      version: Number(versionMatch[1]),
      name: nameMatch[1]!,
      statements: literalsIn(block.slice(statementsStart)),
    };
  });
}

const normalize = (statement: string) => statement.trim().replace(/\s+/g, " ");

describe("the canonical migration parser", () => {
  it("extracts every production version, name and statement in the same order", () => {
    const rustMigrations = extractRustMigrations(readFileSync(rustSourcePath, "utf-8"));

    expect(rustMigrations.map((m) => m.version)).toEqual(migrations.map((m) => m.version));
    expect(rustMigrations.map((m) => m.name)).toEqual(migrations.map((m) => m.name));
    expect(rustMigrations.map((m) => m.statements.map(normalize))).toEqual(
      migrations.map((m) => m.statements.map(normalize))
    );
  });
});
