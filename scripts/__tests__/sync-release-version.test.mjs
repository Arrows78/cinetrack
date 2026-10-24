import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { syncVersions, withVersion } from "../sync-release-version.mjs";

const FILES = ["src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"];

/** A copy of the real manifests, with package.json at `version`. */
function repoCopy(version) {
  const root = mkdtempSync(join(tmpdir(), "cinetrack-release-"));
  mkdirSync(join(root, "src-tauri"));
  for (const file of FILES) cpSync(file, join(root, file));
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ ...packageJson, version }, null, 2));
  return root;
}

const changedLines = (before, after) => {
  const a = before.split("\n");
  const b = after.split("\n");
  expect(b).toHaveLength(a.length);
  return a.map((line, index) => [line, b[index]]).filter(([x, y]) => x !== y);
};

describe("syncVersions", () => {
  it("rewrites only the version line of each file, on the real manifests", () => {
    const root = repoCopy("9.8.7");

    const { version, changed } = syncVersions(root);

    expect(version).toBe("9.8.7");
    expect(changed.sort()).toEqual([...FILES].sort());
    for (const file of FILES) {
      const diff = changedLines(readFileSync(file, "utf8"), readFileSync(join(root, file), "utf8"));
      expect(diff, file).toHaveLength(1);
      expect(diff[0][1]).toContain("9.8.7");
    }
  });

  it("leaves the cinetrack lock entry's neighbours alone", () => {
    const root = repoCopy("9.8.7");
    syncVersions(root);

    const lock = readFileSync(join(root, "src-tauri/Cargo.lock"), "utf8");
    const original = readFileSync("src-tauri/Cargo.lock", "utf8");
    // Every other package keeps its version: only one `version =` line differs.
    expect(lock.match(/^version = /gm)).toHaveLength(original.match(/^version = /gm).length);
    expect(lock).toContain('name = "cinetrack"\nversion = "9.8.7"');
  });

  it("is a no-op when the versions already agree", () => {
    const root = repoCopy("9.8.7");
    syncVersions(root);

    expect(syncVersions(root).changed).toEqual([]);
  });

  it("fails loudly when a file has no version to update", () => {
    const root = repoCopy("1.2.3");
    writeFileSync(join(root, "src-tauri/Cargo.lock"), "# no cinetrack package here\n");

    expect(() => syncVersions(root)).toThrow(/Cargo\.lock/);
  });
});

describe("withVersion", () => {
  it("returns null when the pattern is absent", () => {
    expect(withVersion("nothing", /(version = ")([^"]+)(")/, "1.0.0")).toBeNull();
  });
});
