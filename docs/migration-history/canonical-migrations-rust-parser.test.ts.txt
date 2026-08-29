// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractCanonicalMigrations, migrations } from "../migrations/canonical";

const runnerTail = "\nfn is_tolerable_duplicate_column";

describe("canonical migrations", () => {
  it("exposes the exact production migration version sequence", () => {
    expect(migrations.map((migration) => migration.version)).toEqual([1, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(migrations.every((migration) => migration.statements.length > 0)).toBe(true);
  });

  it("parses raw and plain Rust statement literals without splitting SQL", () => {
    const source = `Migration {
      version: 17,
      name: "parser fixture",
      statements: &[
        r#"CREATE TABLE fixture (
          id INTEGER PRIMARY KEY,
          note TEXT DEFAULT ';'
        )"#,
        "CREATE INDEX idx_fixture_id ON fixture(id)",
      ],
    },
    ];${runnerTail}`;

    expect(extractCanonicalMigrations(source)).toEqual([
      {
        version: 17,
        name: "parser fixture",
        statements: [
          "CREATE TABLE fixture (\n          id INTEGER PRIMARY KEY,\n          note TEXT DEFAULT ';'\n        )",
          "CREATE INDEX idx_fixture_id ON fixture(id)",
        ],
      },
    ]);
  });

  it("rejects source without the canonical table markers", () => {
    expect(() => extractCanonicalMigrations("pub const OTHER: &[Migration] = &[];")).toThrow(
      "Could not locate the canonical MIGRATIONS table"
    );
  });

  it("rejects a statements block without a Migration wrapper", () => {
    expect(() => extractCanonicalMigrations(`statements: &["SELECT 1"]${runnerTail}`)).toThrow(
      "Could not locate the first canonical migration block"
    );
  });

  it("rejects malformed migration metadata", () => {
    const source = `Migration {
      version: invalid,
      name: "broken",
      statements: &["SELECT 1"],
    },
    ];${runnerTail}`;

    expect(() => extractCanonicalMigrations(source)).toThrow("Could not parse a canonical migration block");
  });

  it("rejects a canonical migration with no SQL statements", () => {
    const source = `Migration {
      version: 17,
      name: "empty",
      statements: &[],
    },
    ];${runnerTail}`;

    expect(() => extractCanonicalMigrations(source)).toThrow("Canonical migration 17 has no statements");
  });
});
