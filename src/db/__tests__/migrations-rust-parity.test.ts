// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrations, parseCanonicalMigration } from "../migrations/canonical";

const rustSourcePath = fileURLToPath(new URL("../../../src-tauri/src/database/migrations.rs", import.meta.url));
const sqlDirectory = fileURLToPath(new URL("../../../src-tauri/src/database/migrations", import.meta.url));

describe("canonical SQL migration sources", () => {
  it("are the exact files included by the Rust production runner", () => {
    const rustSource = readFileSync(rustSourcePath, "utf-8");
    const rustFiles = Array.from(
      rustSource.matchAll(/include_str!\("migrations\/([^"]+\.sql)"\)/g),
      (match) => match[1]!
    );
    const diskFiles = readdirSync(sqlDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    expect(rustFiles).toEqual(diskFiles);
  });

  it("parses every canonical file to the same ordered migration metadata", () => {
    const fromDisk = readdirSync(sqlDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .map((file) => parseCanonicalMigration(readFileSync(`${sqlDirectory}/${file}`, "utf-8")));

    expect(fromDisk.map(({ version, name }) => ({ version, name }))).toEqual(
      migrations.map(({ version, name }) => ({ version, name }))
    );
  });
});
