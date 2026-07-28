// Covers the SQL branch of the Supabase-linking methods against real
// SQLite — in particular that the UNIQUE index on supabase_user_id (added
// in migration 008) actually protects linkToSupabaseUser from double-
// assigning one account to two profiles, which the browser-fallback tests
// in profile-repository.test.ts can't exercise (no such constraint there).
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteAdapter } from "@/db/__tests__/sqlite-adapter";

vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => true }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));

describe("profileRepository (real SQLite path)", () => {
  let sqlite: DatabaseSync;

  beforeEach(async () => {
    vi.resetModules();
    sqlite = new DatabaseSync(":memory:");
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    vi.mocked(Database.load).mockResolvedValue(createSqliteAdapter(sqlite));
  });

  afterEach(() => {
    sqlite.close();
  });

  it("resolves and claims 'default' for the first real INSERT/UPDATE round trip", async () => {
    const { profileRepository } = await import("../profile-repository");

    const resolved = await profileRepository.resolveForSupabaseUser("user-1");

    expect(resolved).toMatchObject({ id: "default", supabaseUserId: "user-1" });
    const row = sqlite.prepare("SELECT supabase_user_id FROM profiles WHERE id = 'default'").all() as Array<{
      supabase_user_id: string;
    }>;
    expect(row[0].supabase_user_id).toBe("user-1");
  });

  it("the unique index rejects linking a second profile to an already-claimed account", async () => {
    const { profileRepository } = await import("../profile-repository");

    await profileRepository.resolveForSupabaseUser("user-1");
    const second = await profileRepository.createForSupabaseUser("Camille", "user-2");

    await expect(profileRepository.linkToSupabaseUser(second.id, "user-1")).rejects.toThrow(/UNIQUE constraint failed/);
  });
});
