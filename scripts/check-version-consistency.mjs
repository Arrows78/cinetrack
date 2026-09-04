/* global console, process */

import { readFile } from "node:fs/promises";

const files = [
  ["package.json", /"version"\s*:\s*"([^"]+)"/],
  ["src-tauri/Cargo.toml", /^version\s*=\s*"([^"]+)"/m],
  ["src-tauri/tauri.conf.json", /"version"\s*:\s*"([^"]+)"/],
];

const versions = await Promise.all(
  files.map(async ([path, pattern]) => {
    const content = await readFile(path, "utf8");
    const match = pattern.exec(content);
    if (!match) throw new Error(`Could not find a version in ${path}`);
    return [path, match[1]];
  })
);

const uniqueVersions = new Set(versions.map(([, version]) => version));
if (uniqueVersions.size !== 1) {
  console.error("Version mismatch detected:");
  for (const [path, version] of versions) console.error(`  ${path}: ${version}`);
  process.exit(1);
}

console.log(`Version is consistent across ${versions.length} manifests: ${versions[0][1]}`);
