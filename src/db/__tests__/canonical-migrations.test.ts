// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractCanonicalMigrations, migrations, parseCanonicalMigration } from "../migrations/canonical";

const source = (version: number, name: string, statements: string[]) =>
  `-- cinetrack:version ${version}\n-- cinetrack:name ${name}\n${statements
    .map((statement) => `-- cinetrack:statement\n${statement}`)
    .join("\n")}`;

describe("canonical migrations", () => {
  it("exposes the exact production migration version sequence", () => {
    expect(migrations.map((migration) => migration.version)).toEqual([1, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(migrations.every((migration) => migration.statements.length > 0)).toBe(true);
  });

  it("uses explicit statement markers instead of splitting SQL on semicolons", () => {
    const migration = parseCanonicalMigration(source(99, "parser test", ["SELECT ';' AS value; SELECT 2"]));
    expect(migration).toEqual({
      version: 99,
      name: "parser test",
      statements: ["SELECT ';' AS value; SELECT 2"],
    });
  });

  it("rejects malformed metadata and empty migrations", () => {
    expect(() =>
      parseCanonicalMigration("-- cinetrack:name missing version\n-- cinetrack:statement\nSELECT 1")
    ).toThrow("invalid or missing version");
    expect(() => parseCanonicalMigration("-- cinetrack:version 1\n-- cinetrack:statement\nSELECT 1")).toThrow(
      "has no name"
    );
    expect(() => parseCanonicalMigration("-- cinetrack:version 1\n-- cinetrack:name empty")).toThrow(
      "has no statements"
    );
  });

  it("rejects a non-increasing source sequence", () => {
    expect(() =>
      extractCanonicalMigrations([source(9, "later", ["SELECT 1"]), source(1, "earlier", ["SELECT 2"])])
    ).toThrow("strictly increasing");
  });
});
