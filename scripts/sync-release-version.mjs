#!/usr/bin/env node
// Copies the version release-please wrote into package.json to the files it
// cannot edit without damage: tauri.conf.json (its JSON updater re-indents the
// whole file, which then fails `pnpm format:check`), Cargo.toml and the
// `cinetrack` entry of Cargo.lock (its TOML updater found no match there, and a
// stale lock fails every `--locked` build). Each file gets one in-place text
// replacement, so nothing else in it moves.
//
// Run by .github/workflows/release.yml on the release pull request's branch.
// `pnpm version:check` (scripts/check-version-consistency.mjs) is the guard that
// would catch any of the four drifting apart.
//
// Usage: node scripts/sync-release-version.mjs [repository-root]

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

// Each target: the file, and a pattern with the version as its second group
// (group 1 is what precedes it, group 3 what follows it).
const TARGETS = [
  ["src-tauri/tauri.conf.json", /^(\s*"version"\s*:\s*")([^"]+)(")/m],
  ["src-tauri/Cargo.toml", /^(version\s*=\s*")([^"]+)(")/m],
  ["src-tauri/Cargo.lock", /(name = "cinetrack"\r?\nversion = ")([^"]+)(")/],
];

/** Rewrites `content` with `version`, or returns null when the pattern is absent. */
export function withVersion(content, pattern, version) {
  if (!pattern.test(content)) return null;
  return content.replace(pattern, (_match, before, _old, after) => `${before}${version}${after}`);
}

export function syncVersions(root) {
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const changed = [];
  for (const [path, pattern] of TARGETS) {
    const file = join(root, path);
    const content = readFileSync(file, "utf8");
    const next = withVersion(content, pattern, version);
    if (next === null) throw new Error(`Could not find the version to update in ${path}`);
    if (next !== content) {
      writeFileSync(file, next);
      changed.push(path);
    }
  }
  return { version, changed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { version, changed } = syncVersions(process.argv[2] ?? ".");
  process.stdout.write(
    changed.length ? `Set ${version} in ${changed.join(", ")}\n` : `Versions already at ${version}\n`
  );
}
