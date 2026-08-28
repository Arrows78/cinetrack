import rustMigrationsSource from "../../../src-tauri/src/database/migrations.rs?raw";
import type { Migration } from "./types";

// The production Rust table is the single migration authority. This parser is
// deliberately structural rather than SQL-aware: statements are already
// delimited by Rust string literals, so we never split SQL on semicolons.
const rustStringLiteral = /r#"([\s\S]*?)"#|"([^"\\]*)"/g;

function literalsIn(text: string): string[] {
  return Array.from(text.matchAll(rustStringLiteral), (match) => match[1] ?? match[2] ?? "");
}

export function extractCanonicalMigrations(source: string): readonly Migration[] {
  const firstStatements = source.indexOf("statements: &[");
  const end = source.indexOf("\nfn is_tolerable_duplicate_column");
  if (firstStatements === -1 || end === -1) {
    throw new Error("Could not locate the canonical MIGRATIONS table in migrations.rs");
  }

  const firstBlock = source.lastIndexOf("Migration {", firstStatements);
  if (firstBlock === -1) {
    throw new Error("Could not locate the first canonical migration block in migrations.rs");
  }

  const blocks = source.slice(firstBlock, end).split(/\n\s*\},\s*\n\s*Migration\s*\{/);

  return blocks.map((block) => {
    const versionMatch = /version:\s*(\d+)/.exec(block);
    const nameMatch = /name:\s*"([^"]*)"/.exec(block);
    const statementsStart = block.indexOf("statements: &[");
    if (!versionMatch || !nameMatch || statementsStart === -1) {
      throw new Error(`Could not parse a canonical migration block: ${block.slice(0, 80)}...`);
    }

    const statements = literalsIn(block.slice(statementsStart));
    if (statements.length === 0) {
      throw new Error(`Canonical migration ${versionMatch[1]} has no statements`);
    }

    return {
      version: Number(versionMatch[1]),
      name: nameMatch[1]!,
      statements,
    };
  });
}

export const migrations = extractCanonicalMigrations(rustMigrationsSource);
