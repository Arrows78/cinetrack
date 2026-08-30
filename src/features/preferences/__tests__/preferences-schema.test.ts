import { describe, expect, it } from "vitest";
import { defaultPreferences, preferencesSchema } from "../preferences-repository";
import { DEFAULT_TMDB_REGION } from "@/shared/constants/discover";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";

// preferencesSchema/defaultPreferences are real zod validation logic reused
// by backup-schema.ts to validate restored backups — unlike
// preferencesRepository (a thin invoke() wrapper, left untested elsewhere),
// this is worth testing directly.
describe("preferencesSchema", () => {
  it("applies every field's default when parsing a minimal input", () => {
    const parsed = preferencesSchema.parse({ userProfile: {} });

    expect(parsed).toEqual({
      theme: "dark",
      accentColor: "violet",
      language: "en",
      region: DEFAULT_TMDB_REGION,
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
      backupDirectory: null,
      hideWatchedInDiscovery: false,
      onThisDayEnabled: false,
      onboardingCompleted: false,
      userProfile: {
        id: DEFAULT_PROFILE_ID,
        name: null,
        avatar: undefined,
      },
    });
  });

  it("exposes the same defaults through the exported defaultPreferences constant", () => {
    expect(defaultPreferences).toEqual(preferencesSchema.parse({ userProfile: {} }));
  });

  describe("region", () => {
    it("rejects a lowercase or non-two-letter region code", () => {
      expect(() => preferencesSchema.parse({ region: "us", userProfile: {} })).toThrow();
      expect(() => preferencesSchema.parse({ region: "USA", userProfile: {} })).toThrow();
    });

    it("accepts a valid two-uppercase-letter region code", () => {
      const parsed = preferencesSchema.parse({ region: "FR", userProfile: {} });
      expect(parsed.region).toBe("FR");
    });
  });

  describe("notifyHoursBefore", () => {
    it("rejects a negative value", () => {
      expect(() => preferencesSchema.parse({ notifyHoursBefore: -1, userProfile: {} })).toThrow();
    });

    it("rejects a value beyond one week (168 hours)", () => {
      expect(() => preferencesSchema.parse({ notifyHoursBefore: 169, userProfile: {} })).toThrow();
    });

    it("accepts the lower boundary of 0", () => {
      const parsed = preferencesSchema.parse({ notifyHoursBefore: 0, userProfile: {} });
      expect(parsed.notifyHoursBefore).toBe(0);
    });

    it("accepts the upper boundary of 168", () => {
      const parsed = preferencesSchema.parse({ notifyHoursBefore: 168, userProfile: {} });
      expect(parsed.notifyHoursBefore).toBe(168);
    });
  });

  describe("preferredProviderIds", () => {
    it("rejects a non-positive-integer entry", () => {
      expect(() => preferencesSchema.parse({ preferredProviderIds: [0], userProfile: {} })).toThrow();
      expect(() => preferencesSchema.parse({ preferredProviderIds: [-3], userProfile: {} })).toThrow();
      expect(() => preferencesSchema.parse({ preferredProviderIds: [1.5], userProfile: {} })).toThrow();
    });

    it("accepts a list of positive integers", () => {
      const parsed = preferencesSchema.parse({ preferredProviderIds: [8, 337], userProfile: {} });
      expect(parsed.preferredProviderIds).toEqual([8, 337]);
    });
  });

  describe("userProfile", () => {
    it("parses fine when avatar is omitted, leaving it undefined rather than defaulted", () => {
      const parsed = preferencesSchema.parse({ userProfile: { id: "p1", name: "Alice" } });
      expect(parsed.userProfile.avatar).toBeUndefined();
    });

    it("accepts an explicit avatar", () => {
      const parsed = preferencesSchema.parse({ userProfile: { avatar: "avatar.png" } });
      expect(parsed.userProfile.avatar).toBe("avatar.png");
    });

    it("defaults name to null rather than leaving it optional/undefined", () => {
      const parsed = preferencesSchema.parse({ userProfile: {} });
      expect(parsed.userProfile.name).toBeNull();
      expect("name" in parsed.userProfile).toBe(true);
    });

    it("accepts an explicit null name (distinct from an unset one)", () => {
      const parsed = preferencesSchema.parse({ userProfile: { name: null } });
      expect(parsed.userProfile.name).toBeNull();
    });
  });
});
