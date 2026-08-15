import type Database from "@tauri-apps/plugin-sql";
import type { Migration } from "./types";
import { migration as m001 } from "./001-initial-schema";
import { migration as m002 } from "./002-availability-alerts-unique";
import { migration as m003 } from "./003-merge-watchlist-into-library";

export type { Migration } from "./types";

// Order matters: each migration runs against the schema left by the ones
// before it, in this exact sequence.
//
// IMPORTANT — version numbering: this single 001-initial-schema.ts replaces
// what used to be 8 incremental migrations (001 through 008; see git commit
// "refactor(db): squash migrations into a single clean schema"), squashed
// while the app had no shipped users yet — `runMigrations` skips any
// migration whose version is <= the database's current `PRAGMA user_version`
// (see below), so a database created by that old 8-step sequence already
// sits at user_version 8. The next migration added here MUST use `version: 9`
// or higher, not `version: 2` — reusing an already-passed version number
// would make it silently skip on any pre-squash install once this app ships
// publicly.
export const migrations: readonly Migration[] = [m001, m002, m003];

export async function runMigrations(db: Database): Promise<void> {
  const rows = await db.select<Array<{ user_version: number }>>("PRAGMA user_version");
  let currentVersion = Number(rows[0]?.user_version ?? 0);

  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;

    await db.execute("BEGIN IMMEDIATE");
    try {
      for (const statement of migration.statements) {
        try {
          await db.execute(statement);
        } catch (error) {
          const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
          const duplicateAddColumn = statement.startsWith("ALTER TABLE") && message.includes("duplicate column");
          if (!duplicateAddColumn) throw error;
        }
      }
      await db.execute(`PRAGMA user_version = ${migration.version}`);
      await db.execute("COMMIT");
      currentVersion = migration.version;
    } catch (error) {
      await db.execute("ROLLBACK");
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${migration.version} (${migration.name}) failed: ${message}`, { cause: error });
    }
  }
}
