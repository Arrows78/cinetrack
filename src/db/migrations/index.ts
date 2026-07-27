import type Database from "@tauri-apps/plugin-sql";
import type { Migration } from "./types";
import { migration as m001 } from "./001-initial-schema";
import { migration as m002 } from "./002-library-and-events";
import { migration as m003 } from "./003-profiles-and-lists";
import { migration as m004 } from "./004-availability";
import { migration as m005 } from "./005-history-profile-id";
import { migration as m006 } from "./006-index-cleanup";

export type { Migration } from "./types";

// Order matters: each migration runs against the schema left by the ones
// before it, in this exact sequence.
export const migrations: readonly Migration[] = [m001, m002, m003, m004, m005, m006];

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
      throw new Error(`Migration ${migration.version} (${migration.name}) failed: ${message}`);
    }
  }
}
