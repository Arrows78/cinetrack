// Shared setup for tests that exercise a repository's real SQL against an
// in-memory node:sqlite database instead of mocking it away. Every test file
// using this must still call the three `vi.mock(...)` below itself (vi.mock
// is hoisted per-file, so it can't be factored out), but the DatabaseSync
// lifecycle, Database.load wiring and invoke() wiring live here to avoid
// repeating them.
//
//   vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => true }));
//   vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));
//   vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
//
// `vi.resetModules()` runs before every test so each test gets a fresh
// `databasePromise` in db/client.ts (otherwise the second test would reuse
// the first test's now-closed connection) — which means repository modules
// must be re-imported with a dynamic `await import(...)` inside every test
// rather than a static top-level import, so they resolve against the fresh
// registry state.
//
// `invoke()` is also faked (see ./fake-invoke-backend.ts) against the same
// DatabaseSync: preferences/history have already moved to Rust commands, and
// domains still under test here call them internally (active profile
// resolution, activity logging), so they need a working `invoke()` even
// though their own SQL still runs directly against node:sqlite.
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, vi } from "vitest";
import { createFakeInvoke } from "./fake-invoke-backend";
import { createSqliteAdapter } from "./sqlite-adapter";

export function useTestSqlite(): { current: DatabaseSync } {
  const ref = { current: null as unknown as DatabaseSync };

  beforeEach(async () => {
    vi.resetModules();
    ref.current = new DatabaseSync(":memory:");
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    vi.mocked(Database.load).mockResolvedValue(createSqliteAdapter(ref.current));
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockImplementation(createFakeInvoke(ref.current) as typeof invoke);
  });

  afterEach(() => {
    ref.current.close();
  });

  return ref;
}
