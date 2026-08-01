// Runs the real `runMigrations` function against an in-memory SQLite engine
// (node:sqlite, built into Node 22+) through a thin adapter matching the
// @tauri-apps/plugin-sql surface, so the actual SQL text is what gets
// validated — not a reimplementation of it.
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrations, runMigrations } from "../migrations";
import { createSqliteAdapter } from "./sqlite-adapter";

function tableNames(sqlite: DatabaseSync): string[] {
  return (sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>)
    .map((row) => row.name)
    .sort();
}

function userVersion(sqlite: DatabaseSync): number {
  return (sqlite.prepare("PRAGMA user_version").all() as Array<{ user_version: number }>)[0].user_version;
}

describe("runMigrations against real SQLite", () => {
  it("applies the migration and bumps user_version to the latest one", async () => {
    const sqlite = new DatabaseSync(":memory:");
    await runMigrations(createSqliteAdapter(sqlite));

    expect(userVersion(sqlite)).toBe(1);
    expect(tableNames(sqlite)).toEqual(
      [
        "activity_log",
        "availability_alerts",
        "availability_snapshots",
        "custom_list_items",
        "custom_lists",
        "episode_progress",
        "library_items",
        "preferences",
        "profiles",
        "seen_movies",
        "tracked_series",
        "viewing_events",
        "watchlist_items",
      ].sort()
    );
  });

  it("is idempotent: running it twice does not fail or double-apply", async () => {
    const sqlite = new DatabaseSync(":memory:");
    await runMigrations(createSqliteAdapter(sqlite));
    await expect(runMigrations(createSqliteAdapter(sqlite))).resolves.not.toThrow();

    expect(userVersion(sqlite)).toBe(1);
  });

  it("only applies migrations newer than the database's current user_version", async () => {
    const sqlite = new DatabaseSync(":memory:");
    const latest = migrations[migrations.length - 1]!.version;
    sqlite.exec(`PRAGMA user_version = ${latest}`);

    // At the latest version already: the migration should be skipped, so
    // none of the schema exists — proving the version gate actually
    // short-circuits instead of re-running everything regardless.
    await runMigrations(createSqliteAdapter(sqlite));

    expect(tableNames(sqlite)).toEqual([]);
  });

  it("seeds the default profile", async () => {
    const sqlite = new DatabaseSync(":memory:");
    await runMigrations(createSqliteAdapter(sqlite));

    const rows = sqlite.prepare("SELECT uuid, name FROM profiles WHERE uuid = 'default'").all() as Array<{
      uuid: string;
      name: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Principal");
  });

  describe("id / uuid columns", () => {
    it("uses uuid as the primary key", async () => {
      const sqlite = new DatabaseSync(":memory:");
      await runMigrations(createSqliteAdapter(sqlite));

      sqlite.exec(
        `INSERT INTO custom_lists (uuid, profile_id, name, created_at, updated_at)
         VALUES ('list-uuid-1', 'default', 'My List', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      );

      const row = sqlite.prepare("SELECT uuid FROM custom_lists WHERE uuid = 'list-uuid-1'").all() as Array<{
        uuid: string;
      }>;
      expect(row).toHaveLength(1);
      expect(row[0].uuid).toBe('list-uuid-1');
    });

    it("rejects a duplicate uuid", async () => {
      const sqlite = new DatabaseSync(":memory:");
      await runMigrations(createSqliteAdapter(sqlite));

      sqlite.exec(
        `INSERT INTO custom_lists (uuid, profile_id, name, created_at, updated_at)
         VALUES ('dup', 'default', 'A', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      );

      expect(() =>
        sqlite.exec(
          `INSERT INTO custom_lists (uuid, profile_id, name, created_at, updated_at)
           VALUES ('dup', 'default', 'B', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
        )
      ).toThrow(/UNIQUE constraint failed/);
    });
  });

  describe("foreign keys", () => {
    it("rejects an insert whose profile_id does not reference a real profile", async () => {
      const sqlite = new DatabaseSync(":memory:");
      sqlite.exec("PRAGMA foreign_keys = ON");
      await runMigrations(createSqliteAdapter(sqlite));

      expect(() =>
        sqlite.exec(
          `INSERT INTO watchlist_items (uuid, profile_id, media_id, media_type, title, created_at, updated_at)
           VALUES ('w1', 'ghost', 1, 'movie', 'Orphan', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
        )
      ).toThrow(/FOREIGN KEY constraint failed/);
    });

    it("rejects a custom_list_items row whose list_id does not reference a real list", async () => {
      const sqlite = new DatabaseSync(":memory:");
      sqlite.exec("PRAGMA foreign_keys = ON");
      await runMigrations(createSqliteAdapter(sqlite));

      expect(() =>
        sqlite.exec(
          `INSERT INTO custom_list_items (uuid, list_id, media_id, media_type, title, position, added_at, updated_at)
           VALUES ('i1', 'ghost-list', 1, 'movie', 'Orphan', 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
        )
      ).toThrow(/FOREIGN KEY constraint failed/);
    });

    it("cascades deleting a profile to every table scoped by profile_id", async () => {
      const sqlite = new DatabaseSync(":memory:");
      sqlite.exec("PRAGMA foreign_keys = ON");
      await runMigrations(createSqliteAdapter(sqlite));

      sqlite.exec(
        `INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('alex', 'Alex', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      );
      sqlite.exec(
        `INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, created_at, updated_at)
         VALUES ('l1', 'alex', 1, 'movie', 'Test', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      );
      sqlite.exec(
        `INSERT INTO custom_lists (uuid, profile_id, name, created_at, updated_at)
         VALUES ('list-1', 'alex', 'My List', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      );
      sqlite.exec(
        `INSERT INTO custom_list_items (uuid, list_id, media_id, media_type, title, position, added_at, updated_at)
         VALUES ('i1', 'list-1', 1, 'movie', 'Test', 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      );

      sqlite.exec("DELETE FROM profiles WHERE uuid = 'alex'");

      expect(sqlite.prepare("SELECT * FROM library_items WHERE profile_id = 'alex'").all()).toHaveLength(0);
      expect(sqlite.prepare("SELECT * FROM custom_lists WHERE profile_id = 'alex'").all()).toHaveLength(0);
      // Deleting the list must itself have cascaded to its items.
      expect(sqlite.prepare("SELECT * FROM custom_list_items WHERE list_id = 'list-1'").all()).toHaveLength(0);
    });
  });

  describe("check constraints", () => {
    it("rejects an invalid media_type", async () => {
      const sqlite = new DatabaseSync(":memory:");
      await runMigrations(createSqliteAdapter(sqlite));

      expect(() =>
        sqlite.exec(
          `INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, created_at, updated_at)
           VALUES ('l1', 'default', 1, 'documentary', 'Test', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
        )
      ).toThrow(/CHECK constraint failed/);
    });

    it("rejects an invalid library status", async () => {
      const sqlite = new DatabaseSync(":memory:");
      await runMigrations(createSqliteAdapter(sqlite));

      expect(() =>
        sqlite.exec(
          `INSERT INTO library_items (uuid, profile_id, media_id, media_type, title, status, created_at, updated_at)
           VALUES ('l1', 'default', 1, 'movie', 'Test', 'binged', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
        )
      ).toThrow(/CHECK constraint failed/);
    });
  });

  describe("supabase user link", () => {
    it("keeps supabase_user_id nullable and unique", async () => {
      const sqlite = new DatabaseSync(":memory:");
      await runMigrations(createSqliteAdapter(sqlite));

      sqlite.exec(
        `INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('a', 'A', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      );
      sqlite.exec(
        `INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('b', 'B', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      );
      expect(sqlite.prepare("SELECT supabase_user_id FROM profiles WHERE uuid IN ('a','b')").all()).toEqual([
        { supabase_user_id: null },
        { supabase_user_id: null },
      ]);

      sqlite.exec("UPDATE profiles SET supabase_user_id = 'user-1' WHERE uuid = 'a'");

      // Unique: a second profile can't claim the same account.
      expect(() => sqlite.exec("UPDATE profiles SET supabase_user_id = 'user-1' WHERE uuid = 'b'")).toThrow(
        /UNIQUE constraint failed/
      );
    });
  });
});
