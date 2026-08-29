// Catches the class of bug scripts/generate-tauri-command-names.mjs doesn't:
// a Rust DTO's fields and its hand-written TS mirror silently drifting apart
// (a field renamed, added, or removed on one side and not the other).
//
// Most IPC DTOs no longer need this: they derive `ts_rs::TS` and generate
// their real TS shape straight into src/generated/dto/ (see
// docs/architecture.md's IPC boundary section) — the ts-rs `export_bindings`
// tests plus a fresh `cargo test` run are what actually keep those in sync,
// not this script. What's left in PAIRS below is deliberately NOT
// ts-rs-generated: `SmartList.rules` and `SavedFilter.filters` are opaque
// `serde_json::Value` on the Rust side by design (nothing in Rust inspects
// their fields — see those structs' own doc comments), while their TS
// mirrors are intentionally MORE precise (a real `SmartListRules` union, a
// generic `SavedFilter<TState>`) than Rust models them — generating from
// Rust here would be a regression in type safety, not an improvement. This
// script only compares field-NAME sets between an explicitly paired Rust
// `pub struct`/TS `interface`, after snake_case->camelCase conversion, so it
// still can't catch a field's type/optionality/nesting changing without a
// rename — extend PAIRS if another DTO needs this same deliberately-opaque
// treatment, and prefer `#[derive(ts_rs::TS)]` for anything else.

import { readFileSync } from "node:fs";
import process from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PAIRS = [
  { rustFile: "src-tauri/src/lists/smart/models.rs", rustType: "SmartList", tsType: "SmartList" },
  { rustFile: "src-tauri/src/lists/saved_filters/models.rs", rustType: "SavedFilter", tsType: "SavedFilter" },
];
const TS_FILE = "src/types/media.ts";

function snakeToCamel(name) {
  return name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/** Depth-counts braces from the first `{` at or after `fromIndex`, returning the text strictly between the matching pair. */
function extractBracedBody(source, fromIndex, describeFor) {
  const open = source.indexOf("{", fromIndex);
  if (open === -1) {
    throw new Error(`Could not find an opening brace for ${describeFor}`);
  }
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`Unbalanced braces while scanning ${describeFor}`);
}

function extractRustFields(source, typeName) {
  const marker = source.search(new RegExp(`pub struct ${typeName}\\b`));
  if (marker === -1) {
    throw new Error(`Could not find "pub struct ${typeName}" in Rust source`);
  }
  const body = extractBracedBody(source, marker, `Rust struct ${typeName}`);
  const fields = [];
  for (const line of body.split("\n")) {
    const match = line.match(/^\s*pub\s+([a-z_][a-z0-9_]*)\s*:/);
    if (match) fields.push(snakeToCamel(match[1]));
  }
  return fields;
}

function extractTsFields(source, typeName) {
  // Strips block and line comments first so a comment mentioning "word:" (a
  // real occurrence in this codebase's doc comments) can never be
  // misread as a field declaration.
  const marker = source.search(new RegExp(`export interface ${typeName}\\b`));
  if (marker === -1) {
    throw new Error(`Could not find "export interface ${typeName}" in TS source`);
  }
  const rawBody = extractBracedBody(source, marker, `TS interface ${typeName}`);
  const body = rawBody.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const fields = [];
  for (const line of body.split("\n")) {
    const match = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\??\s*:/);
    if (match) fields.push(match[1]);
  }
  return fields;
}

function diffFields(rustFields, tsFields) {
  const rustSet = new Set(rustFields);
  const tsSet = new Set(tsFields);
  const missingInTs = rustFields.filter((field) => !tsSet.has(field));
  const missingInRust = tsFields.filter((field) => !rustSet.has(field));
  return { missingInTs, missingInRust };
}

const tsSource = readFileSync(resolve(root, TS_FILE), "utf8");
const rustSourceCache = new Map();
const failures = [];

for (const pair of PAIRS) {
  if (!rustSourceCache.has(pair.rustFile)) {
    rustSourceCache.set(pair.rustFile, readFileSync(resolve(root, pair.rustFile), "utf8"));
  }
  const rustSource = rustSourceCache.get(pair.rustFile);

  let rustFields;
  let tsFields;
  try {
    rustFields = extractRustFields(rustSource, pair.rustType);
    tsFields = extractTsFields(tsSource, pair.tsType);
  } catch (error) {
    failures.push(`${pair.rustType} <-> ${pair.tsType}: ${error.message}`);
    continue;
  }

  const { missingInTs, missingInRust } = diffFields(rustFields, tsFields);
  if (missingInTs.length > 0) {
    failures.push(
      `${pair.rustType} (${pair.rustFile}) has field(s) missing from TS ${pair.tsType} (${TS_FILE}): ${missingInTs.join(", ")}`
    );
  }
  if (missingInRust.length > 0) {
    failures.push(
      `TS ${pair.tsType} (${TS_FILE}) has field(s) missing from Rust ${pair.rustType} (${pair.rustFile}): ${missingInRust.join(", ")}`
    );
  }
}

if (failures.length > 0) {
  process.stderr.write(
    "Rust <-> TS contract drift detected (see scripts/check-contract-drift.mjs):\n\n" +
      failures.map((line) => `  - ${line}`).join("\n") +
      "\n"
  );
  process.exit(1);
}
