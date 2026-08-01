// Test-only: production code no longer talks to SQLite directly (all
// database access goes through Rust `#[tauri::command]`s via invoke()).
// This client — and the migration runner it drives — only exists so
// tests can bootstrap a real in-memory schema for the fake invoke
// backend (see src/db/__tests__/{sqlite-test-harness,fake-invoke-backend}.ts).
import Database from "@tauri-apps/plugin-sql";
import { isTauriApp } from "@/shared/lib/platform";
import { runMigrations } from "./migrations";

const DB_URL = "sqlite:app.db";

export class TauriRequiredError extends Error {
  constructor() {
    super(
      "CineTrack doit être lancé depuis l'application de bureau (fenêtre Tauri) : `pnpm tauri dev` ou " +
        "l'application installée. Le stockage SQLite n'est pas accessible depuis un simple onglet de " +
        "navigateur — y compris pendant `pnpm tauri dev`, dont le pont IPC n'est jamais exposé en dehors " +
        "de sa propre fenêtre."
    );
    this.name = "TauriRequiredError";
  }
}

let databasePromise: Promise<Database> | null = null;

export async function initializeDatabase(): Promise<Database> {
  if (!isTauriApp()) throw new TauriRequiredError();

  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await Database.load(DB_URL);
      // sqlx-sqlite (the driver behind tauri-plugin-sql) already defaults
      // this pragma on for every connection it opens, but it's set
      // explicitly here too: it's a per-connection setting, not a database
      // property, so relying on an undocumented driver default alone would
      // silently stop enforcing the FOREIGN KEY constraints declared in the
      // schema if that default ever changed.
      await db.execute("PRAGMA foreign_keys = ON");
      // WAL is sticky (persisted in the database file itself) but cheap to
      // re-set on every connection; `synchronous` is purely per-connection
      // and must be set every time. Both are the recommended pairing for a
      // desktop app: better read/write concurrency and crash safety than
      // the legacy rollback-journal default, at a negligible durability
      // cost versus FULL.
      await db.execute("PRAGMA journal_mode = WAL");
      await db.execute("PRAGMA synchronous = NORMAL");
      await runMigrations(db);
      return db;
    })().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }

  return databasePromise;
}

export async function getDatabase(): Promise<Database> {
  return initializeDatabase();
}
