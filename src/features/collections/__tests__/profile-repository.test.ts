import { beforeEach, describe, expect, it } from "vitest";
import { profileRepository } from "../profile-repository";
import { watchlistRepository } from "@/features/watchlist/watchlist-repository";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import { makeMedia } from "@/shared/test-utils";

describe("profileRepository (browser fallback)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    preferencesRepository.invalidate();
  });

  it("always includes the default profile", async () => {
    const profiles = await profileRepository.list();
    expect(profiles.some((profile) => profile.id === "default")).toBe(true);
  });

  it("creates additional profiles", async () => {
    const created = await profileRepository.create("Alex");
    const profiles = await profileRepository.list();
    expect(profiles.some((profile) => profile.id === created.id && profile.name === "Alex")).toBe(true);
  });

  it("refuses to remove the default profile", async () => {
    await expect(profileRepository.remove("default")).rejects.toThrow();
  });

  it("removing a profile clears its scoped data and resets the active profile if needed", async () => {
    const created = await profileRepository.create("Alex");
    await preferencesRepository.updatePreference("activeProfileId", created.id);
    await watchlistRepository.upsert({
      mediaId: 1,
      mediaType: "movie",
      title: makeMedia().title,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    await profileRepository.remove(created.id);

    const profiles = await profileRepository.list();
    expect(profiles.some((profile) => profile.id === created.id)).toBe(false);
    expect((await preferencesRepository.getPreferences()).activeProfileId).toBe("default");
  });

  describe("supabase account linking", () => {
    it("auto-claims the unclaimed 'default' profile for the first account that signs in", async () => {
      const resolved = await profileRepository.resolveForSupabaseUser("user-1");

      expect(resolved).toMatchObject({ id: "default", supabaseUserId: "user-1" });
      expect(await profileRepository.findBySupabaseUserId("user-1")).toMatchObject({ id: "default" });
    });

    it("returns the already-linked profile on subsequent resolutions, without re-claiming anything", async () => {
      await profileRepository.resolveForSupabaseUser("user-1");
      const second = await profileRepository.resolveForSupabaseUser("user-1");

      expect(second).toMatchObject({ id: "default", supabaseUserId: "user-1" });
    });

    it("returns null for a second account once 'default' is already claimed", async () => {
      await profileRepository.resolveForSupabaseUser("user-1");

      expect(await profileRepository.resolveForSupabaseUser("user-2")).toBeNull();
    });

    it("createForSupabaseUser links a brand new profile to that account", async () => {
      await profileRepository.resolveForSupabaseUser("user-1");

      const created = await profileRepository.createForSupabaseUser("Camille", "user-2");

      expect(created.supabaseUserId).toBe("user-2");
      expect(await profileRepository.resolveForSupabaseUser("user-2")).toMatchObject({ id: created.id });
    });
  });
});
