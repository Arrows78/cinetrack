import { describe, expect, it } from "vitest";
import { migrations } from "../migrations";

describe("database migrations", () => {
  it("are strictly ordered and unique", () => {
    const versions = migrations.map((migration) => migration.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
  });

  it("contain no empty SQL statements", () => {
    for (const migration of migrations) {
      expect(migration.statements.length).toBeGreaterThan(0);
      expect(migration.statements.every((statement) => statement.trim().length > 0)).toBe(true);
    }
  });
});
