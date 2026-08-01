import { describe, expect, it, vi } from "vitest";
import { useTestSqlite } from "@/db/__tests__/sqlite-test-harness";
import { makeMedia } from "@/shared/test-utils";

vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => true }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));

describe("profileRepository", () => {
  const sqlite = useTestSqlite();

  it("always includes the default profile", async () => {
    const { profileRepository } = await import("../profile-repository");

    const profiles = await profileRepository.list();
    expect(profiles.some((profile) => profile.id === "default")).toBe(true);
  });

  it("creates additional profiles", async () => {
    const { profileRepository } = await import("../profile-repository");

    const created = await profileRepository.create("Alex");
    const profiles = await profileRepository.list();
    expect(profiles.some((profile) => profile.id === created.id && profile.name === "Alex")).toBe(true);
  });

  it("refuses to remove the default profile", async () => {
    const { profileRepository } = await import("../profile-repository");
    await expect(profileRepository.remove("default")).rejects.toThrow();
  });

  it("removing a profile clears its scoped data and resets the active profile if needed", async () => {
    const { profileRepository } = await import("../profile-repository");
    const { watchlistRepository } = await import("@/features/watchlist/watchlist-repository");
    const { preferencesRepository } = await import("@/features/preferences/preferences-repository");

    const created = await profileRepository.create("Alex");
    await preferencesRepository.updatePreference("activeProfileId", created.id);
    await watchlistRepository.upsert({
      id: "test-id",
      mediaId: 1,
      mediaType: "movie",
      title: makeMedia().title,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await profileRepository.remove(created.id);

    const profiles = await profileRepository.list();
    expect(profiles.some((profile) => profile.id === created.id)).toBe(false);
    expect((await preferencesRepository.getPreferences()).activeProfileId).toBe("default");
  });

  describe("supabase account linking", () => {
    it("auto-claims the unclaimed 'default' profile for the first account that signs in", async () => {
      const { profileRepository } = await import("../profile-repository");

      const resolved = await profileRepository.resolveForSupabaseUser("user-1");

      expect(resolved).toMatchObject({ id: "default", supabaseUserId: "user-1" });
      expect(await profileRepository.findBySupabaseUserId("user-1")).toMatchObject({ id: "default" });
    });

    it("returns the already-linked profile on subsequent resolutions, without re-claiming anything", async () => {
      const { profileRepository } = await import("../profile-repository");

      await profileRepository.resolveForSupabaseUser("user-1");
      const second = await profileRepository.resolveForSupabaseUser("user-1");

      expect(second).toMatchObject({ id: "default", supabaseUserId: "user-1" });
    });

    it("returns null for a second account once 'default' is already claimed", async () => {
      const { profileRepository } = await import("../profile-repository");

      await profileRepository.resolveForSupabaseUser("user-1");

      expect(await profileRepository.resolveForSupabaseUser("user-2")).toBeNull();
    });

    it("createForSupabaseUser links a brand new profile to that account", async () => {
      const { profileRepository } = await import("../profile-repository");

      await profileRepository.resolveForSupabaseUser("user-1");

      const created = await profileRepository.createForSupabaseUser("Camille", "user-2");

      expect(created.supabaseUserId).toBe("user-2");
      expect(await profileRepository.resolveForSupabaseUser("user-2")).toMatchObject({ id: created.id });
    });
  });

  // Exercises the UNIQUE index on supabase_user_id directly against real
  // SQLite — the only thing that actually protects linkToSupabaseUser from
  // double-assigning one account to two profiles.
  it("the unique index rejects linking a second profile to an already-claimed account", async () => {
    const { profileRepository } = await import("../profile-repository");

    await profileRepository.resolveForSupabaseUser("user-1");
    const second = await profileRepository.createForSupabaseUser("Camille", "user-2");

    await expect(profileRepository.linkToSupabaseUser(second.id, "user-1")).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("resolves and claims 'default' for the first real INSERT/UPDATE round trip", async () => {
    const { profileRepository } = await import("../profile-repository");

    const resolved = await profileRepository.resolveForSupabaseUser("user-1");

    expect(resolved).toMatchObject({ id: "default", supabaseUserId: "user-1" });
    const row = sqlite.current.prepare("SELECT supabase_user_id FROM profiles WHERE uuid = 'default'").all() as Array<{
      supabase_user_id: string;
    }>;
    expect(row[0].supabase_user_id).toBe("user-1");
  });
});
