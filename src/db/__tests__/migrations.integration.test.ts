// Every other repository test exercises the localStorage fallback only —
// the actual SQL in the migrations (and therefore every db.execute/db.select
// call in the repositories) never runs against a real database anywhere in
// the suite. This file runs the real `runMigrations` function against an
// in-memory SQLite engine (node:sqlite, built into Node 22+) through a thin
// adapter matching the @tauri-apps/plugin-sql surface, so the actual SQL
// text is what gets validated — not a reimplementation of it.
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrations, runMigrations } from "../migrations";
import { createSqliteAdapter } from "./sqlite-adapter";

function tableNames(sqlite: DatabaseSync): string[] {
  return (sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>)
    .map((row) => row.name)
    .sort();
}

function indexNames(sqlite: DatabaseSync, table: string): string[] {
  return (sqlite.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string }>).map((row) => row.name);
}

function userVersion(sqlite: DatabaseSync): number {
  return (sqlite.prepare("PRAGMA user_version").all() as Array<{ user_version: number }>)[0].user_version;
}

describe("runMigrations against real SQLite", () => {
  it("applies every migration and bumps user_version to the latest one", async () => {
    const sqlite = new DatabaseSync(":memory:");
    await runMigrations(createSqliteAdapter(sqlite));

    expect(userVersion(sqlite)).toBe(7);
    expect(tableNames(sqlite)).toEqual(
      expect.arrayContaining([
        "activity_log",
        "availability_alerts",
        "availability_snapshots",
        "custom_list_items",
        "custom_lists",
        "library_items",
        "preferences",
        "profile_episode_progress",
        "profile_seen_movies",
        "profile_tracked_series",
        "profile_watchlist",
        "profiles",
        "viewing_events",
      ])
    );
  });

  it("is idempotent: running the full chain twice does not fail or double-apply", async () => {
    const sqlite = new DatabaseSync(":memory:");
    await runMigrations(createSqliteAdapter(sqlite));
    await expect(runMigrations(createSqliteAdapter(sqlite))).resolves.not.toThrow();

    expect(userVersion(sqlite)).toBe(7);
  });

  it("carries legacy watchlist rows forward into library_items and profile_watchlist", async () => {
    const sqlite = new DatabaseSync(":memory:");
    const adapter = createSqliteAdapter(sqlite);

    // Simulate an existing installation at schema version 1: apply migration
    // 1's real statements (which is what a real pre-existing database would
    // have run), seed the legacy watchlist table it created, then let
    // migrations 2+ run their backfills against that pre-existing data.
    for (const statement of migrations[0].statements) sqlite.exec(statement);
    sqlite.exec(
      `INSERT INTO watchlist (media_id, media_type, title, created_at) VALUES (550, 'movie', 'Fight Club', '2026-01-01T00:00:00.000Z')`
    );
    sqlite.exec("PRAGMA user_version = 1");

    await runMigrations(adapter);

    const libraryRows = sqlite.prepare("SELECT * FROM library_items WHERE media_id = 550").all() as Array<{
      status: string;
      profile_id: string;
    }>;
    expect(libraryRows).toHaveLength(1);
    expect(libraryRows[0]).toMatchObject({ status: "planned", profile_id: "default" });

    const profileWatchlistRows = sqlite.prepare("SELECT * FROM profile_watchlist WHERE media_id = 550").all();
    expect(profileWatchlistRows).toHaveLength(1);
  });

  it("backfills activity_log.profile_id from the legacy metadata JSON (migration 5)", async () => {
    const sqlite = new DatabaseSync(":memory:");
    const adapter = createSqliteAdapter(sqlite);

    // Set up a pre-migration-5 database by applying only migrations 1-4's
    // raw statements directly (runMigrations always runs everything pending,
    // so it can't be used to stop partway through). Seed a row the way the
    // app used to write it (profileId nested in the metadata JSON blob, no
    // dedicated column yet), then let the real runMigrations backfill it.
    for (const migration of migrations.filter((entry) => entry.version <= 4)) {
      for (const statement of migration.statements) sqlite.exec(statement);
    }
    sqlite.exec("PRAGMA user_version = 4");
    // migration 7's orphan cleanup reassigns any profile_id that isn't a
    // real profiles row back to 'default' — insert 'guest' as a real
    // profile so this test still isolates migration 5's backfill behavior.
    sqlite.exec(`INSERT INTO profiles (id, name, created_at) VALUES ('guest', 'Guest', '2026-01-01T00:00:00.000Z')`);
    sqlite.exec(
      `INSERT INTO activity_log (id, media_id, media_type, title, action, timestamp, metadata)
       VALUES ('evt-1', 1, 'movie', 'Scoped', 'movie:watched', '2026-01-01T00:00:00.000Z', '{"profileId":"guest"}')`
    );
    sqlite.exec(
      `INSERT INTO activity_log (id, media_id, media_type, title, action, timestamp, metadata)
       VALUES ('evt-2', 2, 'movie', 'Legacy', 'movie:watched', '2026-01-01T00:00:00.000Z', NULL)`
    );

    await runMigrations(adapter);

    const rows = sqlite.prepare("SELECT id, profile_id FROM activity_log ORDER BY id").all() as Array<{
      id: string;
      profile_id: string;
    }>;
    expect(rows).toEqual([
      { id: "evt-1", profile_id: "guest" },
      { id: "evt-2", profile_id: "default" },
    ]);
  });

  it("ends up with exactly the indexes migration 6 intends, no more and no less", async () => {
    const sqlite = new DatabaseSync(":memory:");
    await runMigrations(createSqliteAdapter(sqlite));

    // Dropped by migration 6.
    expect(indexNames(sqlite, "activity_log")).not.toContain("idx_activity_log_timestamp");
    expect(indexNames(sqlite, "library_items")).not.toContain("idx_library_favourite");
    expect(indexNames(sqlite, "availability_alerts")).not.toContain("idx_availability_alert_profile");

    // Added by migration 6 to actually serve the queries repositories run.
    expect(indexNames(sqlite, "library_items")).toContain("idx_library_profile_updated");
    expect(indexNames(sqlite, "profile_seen_movies")).toContain("idx_profile_seen_movies_watched");
    expect(indexNames(sqlite, "availability_alerts")).toContain("idx_availability_alerts_profile_created");
  });

  it("only applies migrations newer than the database's current user_version", async () => {
    const sqlite = new DatabaseSync(":memory:");
    const latest = migrations[migrations.length - 1].version;
    sqlite.exec(`PRAGMA user_version = ${latest}`);

    // At the latest version already: every migration should be skipped, so
    // none of the schema exists — proving the version gate actually
    // short-circuits instead of re-running everything regardless.
    await runMigrations(createSqliteAdapter(sqlite));

    expect(tableNames(sqlite)).toEqual([]);
  });

  it("tolerates a column that was already added out of band instead of failing the migration", async () => {
    const sqlite = new DatabaseSync(":memory:");
    const adapter = createSqliteAdapter(sqlite);

    // Apply migration 1 for real, then add the column migration 2 is about
    // to add itself — reproducing a database whose schema is already ahead
    // of what its user_version claims.
    for (const statement of migrations[0].statements) sqlite.exec(statement);
    sqlite.exec("ALTER TABLE activity_log ADD COLUMN metadata TEXT");
    sqlite.exec("PRAGMA user_version = 1");

    await expect(runMigrations(adapter)).resolves.not.toThrow();
    expect(userVersion(sqlite)).toBe(7);
  });

  it("rolls back and reports the failing migration when a statement genuinely fails", async () => {
    const sqlite = new DatabaseSync(":memory:");
    const adapter = createSqliteAdapter(sqlite);

    // Claim migration 1 already ran (user_version = 1) without actually
    // creating its tables. Migration 2's backfill then selects FROM a
    // watchlist table that doesn't exist — a real, non-"duplicate column"
    // failure that must roll back and surface which migration broke.
    sqlite.exec("PRAGMA user_version = 1");

    await expect(runMigrations(adapter)).rejects.toThrow(
      /Migration 2 \(unified library, tags and viewing events\) failed/
    );
    // The failed migration's own version bump must not have stuck.
    expect(userVersion(sqlite)).toBe(1);
  });

  describe("foreign keys (migration 7)", () => {
    it("rejects an insert whose profile_id does not reference a real profile", async () => {
      const sqlite = new DatabaseSync(":memory:");
      sqlite.exec("PRAGMA foreign_keys = ON");
      await runMigrations(createSqliteAdapter(sqlite));

      expect(() =>
        sqlite.exec(
          `INSERT INTO profile_watchlist (profile_id, media_id, media_type, title, created_at)
           VALUES ('ghost', 1, 'movie', 'Orphan', '2026-01-01T00:00:00.000Z')`
        )
      ).toThrow(/FOREIGN KEY constraint failed/);
    });

    it("rejects a custom_list_items row whose list_id does not reference a real list", async () => {
      const sqlite = new DatabaseSync(":memory:");
      sqlite.exec("PRAGMA foreign_keys = ON");
      await runMigrations(createSqliteAdapter(sqlite));

      expect(() =>
        sqlite.exec(
          `INSERT INTO custom_list_items (list_id, media_id, media_type, title, position, added_at)
           VALUES ('ghost-list', 1, 'movie', 'Orphan', 0, '2026-01-01T00:00:00.000Z')`
        )
      ).toThrow(/FOREIGN KEY constraint failed/);
    });

    it("cascades deleting a profile to every table scoped by profile_id", async () => {
      const sqlite = new DatabaseSync(":memory:");
      sqlite.exec("PRAGMA foreign_keys = ON");
      await runMigrations(createSqliteAdapter(sqlite));

      sqlite.exec(`INSERT INTO profiles (id, name, created_at) VALUES ('alex', 'Alex', '2026-01-01T00:00:00.000Z')`);
      sqlite.exec(
        `INSERT INTO library_items (profile_id, media_id, media_type, title, created_at, updated_at)
         VALUES ('alex', 1, 'movie', 'Test', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      );
      sqlite.exec(
        `INSERT INTO custom_lists (id, profile_id, name, created_at, updated_at)
         VALUES ('list-1', 'alex', 'My List', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      );
      sqlite.exec(
        `INSERT INTO custom_list_items (list_id, media_id, media_type, title, position, added_at)
         VALUES ('list-1', 1, 'movie', 'Test', 0, '2026-01-01T00:00:00.000Z')`
      );

      sqlite.exec("DELETE FROM profiles WHERE id = 'alex'");

      expect(sqlite.prepare("SELECT * FROM library_items WHERE profile_id = 'alex'").all()).toHaveLength(0);
      expect(sqlite.prepare("SELECT * FROM custom_lists WHERE profile_id = 'alex'").all()).toHaveLength(0);
      // Deleting the list must itself have cascaded to its items.
      expect(sqlite.prepare("SELECT * FROM custom_list_items WHERE list_id = 'list-1'").all()).toHaveLength(0);
    });

    it("reassigns a profile_id that predates the constraint to 'default' instead of failing the upgrade", async () => {
      const sqlite = new DatabaseSync(":memory:");
      const adapter = createSqliteAdapter(sqlite);

      // Apply migrations 1-6 for real, then plant a row referencing a
      // profile that was never created — the kind of pre-existing
      // inconsistency a constraint introduced today must tolerate on
      // yesterday's data instead of bricking the upgrade.
      for (const migration of migrations.filter((entry) => entry.version <= 6)) {
        for (const statement of migration.statements) sqlite.exec(statement);
      }
      sqlite.exec("PRAGMA user_version = 6");
      sqlite.exec(
        `INSERT INTO profile_watchlist (profile_id, media_id, media_type, title, created_at)
         VALUES ('deleted-profile', 1, 'movie', 'Orphan', '2026-01-01T00:00:00.000Z')`
      );
      sqlite.exec(
        `INSERT INTO custom_lists (id, profile_id, name, created_at, updated_at)
         VALUES ('orphan-list', 'deleted-profile', 'Orphan List', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      );
      sqlite.exec(
        `INSERT INTO custom_list_items (list_id, media_id, media_type, title, position, added_at)
         VALUES ('ghost-list', 1, 'movie', 'Orphan Item', 0, '2026-01-01T00:00:00.000Z')`
      );

      await expect(runMigrations(adapter)).resolves.not.toThrow();

      const watchlistRow = sqlite
        .prepare("SELECT profile_id FROM profile_watchlist WHERE media_id = 1")
        .all() as Array<{
        profile_id: string;
      }>;
      expect(watchlistRow[0].profile_id).toBe("default");

      const listRow = sqlite.prepare("SELECT profile_id FROM custom_lists WHERE id = 'orphan-list'").all() as Array<{
        profile_id: string;
      }>;
      expect(listRow[0].profile_id).toBe("default");

      // No sensible list to reassign an orphaned item to — it's dropped.
      expect(sqlite.prepare("SELECT * FROM custom_list_items WHERE list_id = 'ghost-list'").all()).toHaveLength(0);
    });
  });
});
