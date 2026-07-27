import { beforeEach, describe, expect, it } from "vitest";
import { profileRepository } from "../profile-repository";
import { watchlistRepository } from "../watchlist-repository";
import { preferencesRepository } from "../preferences-repository";
import { makeMedia } from "./test-utils";

describe("profileRepository (browser fallback)", () => {
  beforeEach(() => {
    window.localStorage.clear();
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
});
