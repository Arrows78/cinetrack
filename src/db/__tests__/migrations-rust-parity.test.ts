// @vitest-environment node
//
// src-tauri/src/database/migrations.rs is a hand-maintained Rust port of
// this file's migration.statements (see that file's own comment: "Ported
// verbatim from src/db/migrations/001-initial-schema.ts"). Nothing enforces
// the two stay identical — a schema change applied to only one side would
// silently desync the TS-tested schema from the schema the app actually
// runs against in production. This test reads the Rust source as text and
// diffs its statement list against this file's own, so that drift fails
// loudly here instead of being discovered later.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migration as initialSchema } from "../migrations/001-initial-schema";

const rustSourcePath = fileURLToPath(new URL("../../../src-tauri/src/database/migrations.rs", import.meta.url));

function extractRustStatements(source: string): string[] {
  const start = source.indexOf("statements: &[");
  // Only migration 1 (this function's whole purpose is checking it against
  // 001-initial-schema.ts) — bounded by the start of the next Migration
  // entry in MIGRATIONS, not by the end of the file, so later migrations
  // (002+, each authored directly in both languages in the same commit)
  // don't get swept into this comparison too.
  const end = source.indexOf("\n}, Migration {", start);
  if (start === -1 || end === -1) {
    throw new Error("Could not locate the statements array in migrations.rs — has it been renamed/restructured?");
  }
  const migrationsSource = source.slice(start, end);

  // Rust string literals appear in this file only as raw strings (multi-line
  // CREATE TABLE bodies) or plain double-quoted strings (single-line index
  // statements) — one per array element, no escapes needed for either since
  // none of these statements contain a literal `"` or `"#`.
  const literalPattern = /r#"([\s\S]*?)"#|"([^"\\]*)"/g;
  const statements: string[] = [];
  for (const match of migrationsSource.matchAll(literalPattern)) {
    statements.push(match[1] ?? match[2] ?? "");
  }
  return statements;
}

const normalize = (statement: string) => statement.trim().replace(/\s+/g, " ");

describe("migrations.rs stays in sync with 001-initial-schema.ts", () => {
  it("has the exact same statements, in the same order", () => {
    const rustStatements = extractRustStatements(readFileSync(rustSourcePath, "utf-8"));
    const tsStatements = initialSchema.statements;

    expect(rustStatements.map(normalize)).toEqual(tsStatements.map(normalize));
  });
});
