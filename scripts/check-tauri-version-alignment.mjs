// The Tauri CLI refuses to build when an npm `@tauri-apps/*` package and the
// Rust crate it pairs with differ in major.minor (it says so only at the
// `tauri ios build` step, long after the install). Dependabot bumps the npm
// side and the Cargo side in separate PRs, so the two drift apart whenever one
// merges before the other. This compares the installed npm versions with
// Cargo.lock and fails early, naming the pairs and the side to bump.

import { existsSync, readFileSync } from "node:fs";

const PAIRS = [
  ["@tauri-apps/api", "tauri"],
  ["@tauri-apps/plugin-autostart", "tauri-plugin-autostart"],
  ["@tauri-apps/plugin-deep-link", "tauri-plugin-deep-link"],
  ["@tauri-apps/plugin-dialog", "tauri-plugin-dialog"],
  ["@tauri-apps/plugin-fs", "tauri-plugin-fs"],
  ["@tauri-apps/plugin-global-shortcut", "tauri-plugin-global-shortcut"],
  ["@tauri-apps/plugin-http", "tauri-plugin-http"],
  ["@tauri-apps/plugin-notification", "tauri-plugin-notification"],
  ["@tauri-apps/plugin-opener", "tauri-plugin-opener"],
  ["@tauri-apps/plugin-os", "tauri-plugin-os"],
  ["@tauri-apps/plugin-process", "tauri-plugin-process"],
  ["@tauri-apps/plugin-stronghold", "tauri-plugin-stronghold"],
  ["@tauri-apps/plugin-updater", "tauri-plugin-updater"],
];

const majorMinor = (version) => version.split(".").slice(0, 2).join(".");

function crateVersions(lockfile) {
  const versions = new Map();
  for (const block of lockfile.split("[[package]]")) {
    const name = /^name = "([^"]+)"/m.exec(block)?.[1];
    const version = /^version = "([^"]+)"/m.exec(block)?.[1];
    if (name && version) versions.set(name, version);
  }
  return versions;
}

const crates = crateVersions(readFileSync("src-tauri/Cargo.lock", "utf8"));
const mismatches = [];
for (const [npmName, crateName] of PAIRS) {
  const manifest = `node_modules/${npmName}/package.json`;
  if (!existsSync(manifest)) continue; // not installed: nothing to compare
  const npmVersion = JSON.parse(readFileSync(manifest, "utf8")).version;
  const crateVersion = crates.get(crateName);
  if (!crateVersion) continue;
  if (majorMinor(npmVersion) !== majorMinor(crateVersion)) {
    mismatches.push(`${crateName} ${crateVersion} (Cargo.lock) <-> ${npmName} ${npmVersion} (npm)`);
  }
}

if (mismatches.length) {
  console.error("Tauri npm packages and Rust crates are on different major.minor versions:");
  for (const line of mismatches) console.error(`  ${line}`);
  console.error("Bump the older side to the other's major.minor (the Tauri CLI refuses to build otherwise).");
  process.exit(1);
}
console.log(`Tauri npm packages and Rust crates agree (${PAIRS.length} pairs checked).`);
