// Shared by every test that runs real SQL against node:sqlite (built into
// Node 22+) through the same interface the app's repositories use
// (@tauri-apps/plugin-sql's Database.select/execute), instead of only ever
// exercising the localStorage fallback branch.
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type Database from "@tauri-apps/plugin-sql";

// tauri-plugin-sql (sqlx/Rust) accepts positional params as a plain array
// bound to $1, $2, ... placeholders. node:sqlite instead expects those
// placeholders bound as named parameters on an object (`{ $1: value }`).
function toNamedParams(params: unknown[]): Record<string, SQLInputValue> {
  return Object.fromEntries(params.map((value, index) => [`$${index + 1}`, value as SQLInputValue]));
}

export function createSqliteAdapter(sqlite: DatabaseSync): Database {
  return {
    async select<T>(query: string, params: unknown[] = []): Promise<T> {
      const statement = sqlite.prepare(query);
      return (params.length ? statement.all(toNamedParams(params)) : statement.all()) as T;
    },
    async execute(query: string, params: unknown[] = []) {
      if (params.length) {
        sqlite.prepare(query).run(toNamedParams(params));
      } else {
        sqlite.exec(query);
      }
      return { rowsAffected: 0, lastInsertId: 0 };
    },
  } as unknown as Database;
}
