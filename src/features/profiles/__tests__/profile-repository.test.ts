import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import type { UserPreferences, UserProfile } from "@/types/media";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  id: "profile-id",
  name: "Alex",
  avatar: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  supabaseUserId: null,
  ...overrides,
});

// The default-profile seed, supabase auto-claim logic and cascading delete
// now live in Rust and are exercised there (see
// src-tauri/src/commands/profiles.rs's own tests) — this only verifies the
// repository wraps invoke() with the right command name/args, plus the one
// bit of orchestration still in TS: remove() resetting activeProfileId.
describe("profileRepository", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("list() invokes list_profiles", async () => {
    invokeMock.mockResolvedValueOnce([profile()]);
    const { profileRepository } = await import("../profile-repository");

    await expect(profileRepository.list()).resolves.toEqual([profile()]);
    expect(invokeMock).toHaveBeenCalledWith("list_profiles", undefined);
  });

  it("create() invokes create_profile with name/avatar/supabaseUserId, defaulting to null", async () => {
    invokeMock.mockResolvedValueOnce(profile());
    const { profileRepository } = await import("../profile-repository");

    await profileRepository.create("Alex");
    expect(invokeMock).toHaveBeenCalledWith("create_profile", { name: "Alex", avatar: null, supabaseUserId: null });
  });

  it("createForSupabaseUser() delegates to create_profile with the supabaseUserId set", async () => {
    invokeMock.mockResolvedValueOnce(profile({ supabaseUserId: "user-1" }));
    const { profileRepository } = await import("../profile-repository");

    await profileRepository.createForSupabaseUser("Camille", "user-1");
    expect(invokeMock).toHaveBeenCalledWith("create_profile", {
      name: "Camille",
      avatar: null,
      supabaseUserId: "user-1",
    });
  });

  it("findBySupabaseUserId() invokes find_profile_by_supabase_user_id", async () => {
    invokeMock.mockResolvedValueOnce(null);
    const { profileRepository } = await import("../profile-repository");

    await profileRepository.findBySupabaseUserId("user-1");
    expect(invokeMock).toHaveBeenCalledWith("find_profile_by_supabase_user_id", { supabaseUserId: "user-1" });
  });

  it("linkToSupabaseUser() invokes link_profile_to_supabase_user", async () => {
    invokeMock.mockResolvedValueOnce(profile());
    const { profileRepository } = await import("../profile-repository");

    await profileRepository.linkToSupabaseUser(DEFAULT_PROFILE_ID, "user-1");
    expect(invokeMock).toHaveBeenCalledWith("link_profile_to_supabase_user", {
      profileId: DEFAULT_PROFILE_ID,
      supabaseUserId: "user-1",
    });
  });

  it("resolveForSupabaseUser() invokes resolve_profile_for_supabase_user", async () => {
    invokeMock.mockResolvedValueOnce(null);
    const { profileRepository } = await import("../profile-repository");

    await profileRepository.resolveForSupabaseUser("user-1");
    expect(invokeMock).toHaveBeenCalledWith("resolve_profile_for_supabase_user", { supabaseUserId: "user-1" });
  });

  it("remove() resets activeProfileId to default when the removed profile was active", async () => {
    const preferences: UserPreferences = {
      theme: "dark",
      accentColor: "violet",
      language: "en",
      region: "FR",
      defaultSearchType: "all",
      reduceMotion: false,
      compactMode: false,
      sidebarCollapsed: false,
      libraryViewMode: "grid",
      spoilerProtection: true,
      notificationsEnabled: false,
      notifyHoursBefore: 24,
      preferredProviderIds: [],
      activeProfileId: "removed-id",
      userProfile: { id: DEFAULT_PROFILE_ID, name: null },
    };
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "remove_profile") return undefined;
      if (command === "get_preferences") return preferences;
      if (command === "set_active_profile") return { ...preferences, activeProfileId: DEFAULT_PROFILE_ID };
      throw new Error(`Unhandled command: ${command}`);
    });
    const { profileRepository } = await import("../profile-repository");

    await profileRepository.remove("removed-id");

    expect(invokeMock).toHaveBeenCalledWith("remove_profile", { profileId: "removed-id" });
    expect(invokeMock).toHaveBeenCalledWith("set_active_profile", {
      profileId: DEFAULT_PROFILE_ID,
      supabaseUserId: null,
    });
  });

  it("remove() leaves activeProfileId untouched when the removed profile wasn't active", async () => {
    const preferences: UserPreferences = {
      theme: "dark",
      accentColor: "violet",
      language: "en",
      region: "FR",
      defaultSearchType: "all",
      reduceMotion: false,
      compactMode: false,
      sidebarCollapsed: false,
      libraryViewMode: "grid",
      spoilerProtection: true,
      notificationsEnabled: false,
      notifyHoursBefore: 24,
      preferredProviderIds: [],
      activeProfileId: DEFAULT_PROFILE_ID,
      userProfile: { id: DEFAULT_PROFILE_ID, name: null },
    };
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "remove_profile") return undefined;
      if (command === "get_preferences") return preferences;
      throw new Error(`Unhandled command: ${command}`);
    });
    const { profileRepository } = await import("../profile-repository");

    await profileRepository.remove("other-id");

    expect(invokeMock).not.toHaveBeenCalledWith("set_active_profile", expect.anything());
  });
});
