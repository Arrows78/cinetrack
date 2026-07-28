import Database from "@tauri-apps/plugin-sql";
import { isTauriApp } from "@/shared/lib/platform";
import { runMigrations } from "./migrations";

export { browserStore, type BrowserStore } from "./browser-store";

const DB_URL = "sqlite:app.db";

let databasePromise: Promise<Database> | null = null;

export async function initializeDatabase() {
  if (!isTauriApp()) return null;

  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await Database.load(DB_URL);
      // sqlx-sqlite (the driver behind tauri-plugin-sql) already defaults
      // this pragma on for every connection it opens, but it's set
      // explicitly here too: it's a per-connection setting, not a database
      // property, so relying on an undocumented driver default alone would
      // silently stop enforcing the FOREIGN KEY constraints declared in
      // migration 007 if that default ever changed.
      await db.execute("PRAGMA foreign_keys = ON");
      await runMigrations(db);
      return db;
    })().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }

  return databasePromise;
}

export async function getDatabase() {
  return initializeDatabase();
}
