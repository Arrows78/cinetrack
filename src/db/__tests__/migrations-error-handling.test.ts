// Exercises runMigrations' error-recovery paths (the ALTER TABLE /
// "duplicate column" swallow, and the rollback-and-rethrow branch) which the
// real migration set in 001-initial-schema.ts can't reach on its own — it
// has no ALTER TABLE statements and nothing in it fails. A single fake
// migration with a controllable `execute` lets us drive both paths directly,
// while migrations.integration.test.ts keeps covering the happy path against
// real SQLite.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "@tauri-apps/plugin-sql";
import type { Migration } from "../migrations/types";

let fakeMigration: Migration;

// All real migration modules are replaced by the same controllable fake —
// runMigrations' version gate then skips (or runs) every entry exactly like
// the first, since they share a version, so adding a real migration in
// 002-availability-alerts-unique.ts / 003-merge-watchlist-into-library.ts /
// 004-add-status-to-tracked-series.ts / 005-remove-rewatching-status.ts
// doesn't leak its own SQL into these error-recovery assertions.
vi.mock("../migrations/001-initial-schema", () => ({
  get migration() {
    return fakeMigration;
  },
}));
vi.mock("../migrations/002-availability-alerts-unique", () => ({
  get migration() {
    return fakeMigration;
  },
}));
vi.mock("../migrations/003-merge-watchlist-into-library", () => ({
  get migration() {
    return fakeMigration;
  },
}));
vi.mock("../migrations/004-add-status-to-tracked-series", () => ({
  get migration() {
    return fakeMigration;
  },
}));
vi.mock("../migrations/005-remove-rewatching-status", () => ({
  get migration() {
    return fakeMigration;
  },
}));

function fakeDb(executeImpl: (statement: string) => Promise<unknown>): Database {
  return {
    select: vi.fn(async () => [{ user_version: 0 }]),
    execute: vi.fn(async (statement: string) => executeImpl(statement)),
  } as unknown as Database;
}

describe("runMigrations error recovery", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("swallows a 'duplicate column' failure on an ALTER TABLE statement and still commits", async () => {
    fakeMigration = { version: 1, name: "add-column", statements: ["ALTER TABLE foo ADD COLUMN bar TEXT"] };
    const executed: string[] = [];
    const db = fakeDb(async (statement) => {
      executed.push(statement);
      if (statement.startsWith("ALTER TABLE")) throw new Error("duplicate column name: bar");
    });

    const { runMigrations } = await import("../migrations");
    await expect(runMigrations(db)).resolves.toBeUndefined();

    expect(executed).toContain("COMMIT");
    expect(executed).not.toContain("ROLLBACK");
  });

  it("rolls back and rethrows a non-duplicate-column Error", async () => {
    fakeMigration = { version: 1, name: "broken", statements: ["CREATE TABLE foo (id INTEGER)"] };
    const executed: string[] = [];
    const db = fakeDb(async (statement) => {
      executed.push(statement);
      if (statement.startsWith("CREATE TABLE")) throw new Error("syntax error");
    });

    const { runMigrations } = await import("../migrations");
    await expect(runMigrations(db)).rejects.toThrow("Migration 1 (broken) failed: syntax error");

    expect(executed).toContain("ROLLBACK");
    expect(executed).not.toContain("COMMIT");
  });

  it("rolls back and rethrows a non-Error rejection, stringifying its message", async () => {
    fakeMigration = { version: 1, name: "broken-non-error", statements: ["ALTER TABLE foo ADD COLUMN bar TEXT"] };
    const executed: string[] = [];
    const db = fakeDb(async (statement) => {
      executed.push(statement);
      if (statement.startsWith("ALTER TABLE")) throw "boom";
    });

    const { runMigrations } = await import("../migrations");
    await expect(runMigrations(db)).rejects.toThrow("Migration 1 (broken-non-error) failed: boom");

    expect(executed).toContain("ROLLBACK");
  });

  it("does not run any migration whose version is already applied", async () => {
    fakeMigration = { version: 1, name: "already-applied", statements: ["CREATE TABLE foo (id INTEGER)"] };
    const executed: string[] = [];
    const db = {
      select: vi.fn(async () => [{ user_version: 1 }]),
      execute: vi.fn(async (statement: string) => {
        executed.push(statement);
      }),
    } as unknown as Database;

    const { runMigrations } = await import("../migrations");
    await runMigrations(db);

    expect(executed).toEqual([]);
  });
});
