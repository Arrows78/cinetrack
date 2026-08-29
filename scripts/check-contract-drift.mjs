// Catches the class of bug scripts/generate-tauri-command-names.mjs doesn't:
// a Rust DTO's fields and its hand-written TS mirror silently drifting apart
// (a field renamed, added, or removed on one side and not the other). This
// is deliberately NOT a Rust->TS type generator (see docs/architecture.md's
// "Architecture boundaries" section for why: tauri-specta, the obvious
// generator, is still 2.0.0-rc.* after 1.5+ years with no stable release) —
// it only compares field-NAME sets between an explicitly paired Rust
// `pub struct`/TS `interface`, after snake_case->camelCase conversion. It
// does not check field types, optionality, or nesting, so it cannot catch
// every drift (e.g. a field changing from `Option<String>` to `String`
// without being renamed) — narrower than a full contract, but zero new
// runtime dependency and no false positives from things it doesn't
// understand.
//
// Extend PAIRS below whenever a new IPC DTO is added or an existing one
// becomes complex enough that hand-checking its TS mirror is error-prone.

import { readFileSync } from "node:fs";
import process from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PAIRS = [
  { rustFile: "src-tauri/src/library/models.rs", rustType: "LibraryItem", tsType: "LibraryItem" },
  { rustFile: "src-tauri/src/history/models.rs", rustType: "ViewingHistoryItem", tsType: "ViewingHistoryItem" },
  { rustFile: "src-tauri/src/preferences/models.rs", rustType: "UserPreferences", tsType: "UserPreferences" },
  { rustFile: "src-tauri/src/lists/custom/models.rs", rustType: "CustomList", tsType: "CustomList" },
  { rustFile: "src-tauri/src/lists/custom/models.rs", rustType: "CustomListItem", tsType: "CustomListItem" },
  { rustFile: "src-tauri/src/lists/smart/models.rs", rustType: "SmartList", tsType: "SmartList" },
  { rustFile: "src-tauri/src/lists/saved_filters/models.rs", rustType: "SavedFilter", tsType: "SavedFilter" },
  {
    rustFile: "src-tauri/src/availability/models.rs",
    rustType: "AvailabilitySnapshot",
    tsType: "AvailabilitySnapshot",
  },
  { rustFile: "src-tauri/src/availability/models.rs", rustType: "AvailabilityAlert", tsType: "AvailabilityAlert" },
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
