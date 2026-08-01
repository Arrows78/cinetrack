// Shared setup for tests that exercise a repository's real SQL against an
// in-memory node:sqlite database instead of mocking it away. Every test file
// using this must still call the two `vi.mock(...)` below itself (vi.mock
// is hoisted per-file, so it can't be factored out), but the DatabaseSync
// lifecycle and Database.load wiring live here to avoid repeating it.
//
//   vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => true }));
//   vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));
//
// `vi.resetModules()` runs before every test so each test gets a fresh
// `databasePromise` in db/client.ts (otherwise the second test would reuse
// the first test's now-closed connection) — which means repository modules
// must be re-imported with a dynamic `await import(...)` inside every test
// rather than a static top-level import, so they resolve against the fresh
// registry state.
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, vi } from "vitest";
import { createSqliteAdapter } from "./sqlite-adapter";

export function useTestSqlite(): { current: DatabaseSync } {
  const ref = { current: null as unknown as DatabaseSync };

  beforeEach(async () => {
    vi.resetModules();
    ref.current = new DatabaseSync(":memory:");
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    vi.mocked(Database.load).mockResolvedValue(createSqliteAdapter(ref.current));
  });

  afterEach(() => {
    ref.current.close();
  });

  return ref;
}
