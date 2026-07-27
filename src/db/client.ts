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
