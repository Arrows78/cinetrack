import { beforeEach, describe, expect, it } from "vitest";
import { availabilityRepository } from "../availability-repository";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import { makeMedia } from "@/shared/test-utils";
import type { AvailabilitySnapshot } from "@/types/media";

const snapshot = (overrides: Partial<AvailabilitySnapshot> = {}): AvailabilitySnapshot => ({
  mediaId: 1,
  mediaType: "movie",
  region: "FR",
  providerIds: [8, 119],
  checkedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("availabilityRepository (browser fallback)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    preferencesRepository.invalidate();
  });

  it("creates an alert on first toggle and removes it on the second", async () => {
    const media = makeMedia({ id: 7, title: "Alerte" });

    const created = await availabilityRepository.toggle(media, "FR", [8]);
    expect(created).not.toBeNull();
    expect(created?.enabled).toBe(true);
    expect(await availabilityRepository.getAlert(7, "movie")).toMatchObject({ mediaId: 7, region: "FR" });

    const removed = await availabilityRepository.toggle(media, "FR", [8]);
    expect(removed).toBeNull();
    expect(await availabilityRepository.getAlert(7, "movie")).toBeNull();
  });

  it("distinguishes alerts by media type", async () => {
    await availabilityRepository.toggle(makeMedia({ id: 7, mediaType: "movie" }), "FR", [8]);

    expect(await availabilityRepository.getAlert(7, "series")).toBeNull();
    expect(await availabilityRepository.getAlert(7, "movie")).not.toBeNull();
  });

  it("scopes alerts to the active profile", async () => {
    await availabilityRepository.toggle(makeMedia({ id: 7 }), "FR", [8]);
    expect(await availabilityRepository.listAlerts()).toHaveLength(1);

    await preferencesRepository.updatePreference("activeProfileId", "guest");
    expect(await availabilityRepository.listAlerts()).toHaveLength(0);
  });

  it("round-trips a snapshot and replaces it on the same media/region key", async () => {
    expect(await availabilityRepository.getSnapshot(1, "movie", "FR")).toBeNull();

    await availabilityRepository.saveSnapshot(snapshot());
    expect(await availabilityRepository.getSnapshot(1, "movie", "FR")).toMatchObject({ providerIds: [8, 119] });

    await availabilityRepository.saveSnapshot(snapshot({ providerIds: [337], checkedAt: "2026-02-01T00:00:00.000Z" }));
    const replaced = await availabilityRepository.getSnapshot(1, "movie", "FR");
    expect(replaced?.providerIds).toEqual([337]);
    expect(replaced?.checkedAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("keeps snapshots for different regions separate", async () => {
    await availabilityRepository.saveSnapshot(snapshot({ region: "FR", providerIds: [8] }));
    await availabilityRepository.saveSnapshot(snapshot({ region: "US", providerIds: [9] }));

    expect((await availabilityRepository.getSnapshot(1, "movie", "FR"))?.providerIds).toEqual([8]);
    expect((await availabilityRepository.getSnapshot(1, "movie", "US"))?.providerIds).toEqual([9]);
  });
});
