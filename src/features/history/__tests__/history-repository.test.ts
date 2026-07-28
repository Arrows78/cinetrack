import { beforeEach, describe, expect, it } from "vitest";
import { historyRepository } from "../history-repository";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import type { ViewingHistoryItem } from "@/types/media";

const entry = (overrides: Partial<ViewingHistoryItem> = {}): ViewingHistoryItem => ({
  id: crypto.randomUUID(),
  mediaId: 1,
  mediaType: "movie",
  title: "Test Movie",
  action: "movie:watched",
  timestamp: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("historyRepository (browser fallback)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    preferencesRepository.invalidate();
  });

  it("returns entries newest first even when they were added out of order", async () => {
    await historyRepository.add(entry({ timestamp: "2026-01-02T00:00:00.000Z", title: "Milieu" }));
    await historyRepository.add(entry({ timestamp: "2026-01-01T00:00:00.000Z", title: "Ancien" }));
    await historyRepository.add(entry({ timestamp: "2026-01-03T00:00:00.000Z", title: "Récent" }));

    const list = await historyRepository.list();
    expect(list.map((item) => item.title)).toEqual(["Récent", "Milieu", "Ancien"]);
  });

  it("respects the limit parameter", async () => {
    for (let index = 0; index < 5; index += 1) {
      await historyRepository.add(entry({ timestamp: `2026-01-0${index + 1}T00:00:00.000Z` }));
    }

    expect(await historyRepository.list(2)).toHaveLength(2);
  });

  it("stamps entries with the active profile and scopes list() to it", async () => {
    await historyRepository.add(entry());
    expect(await historyRepository.list()).toHaveLength(1);

    await preferencesRepository.updatePreference("activeProfileId", "guest");
    expect(await historyRepository.list()).toHaveLength(0);

    await historyRepository.add(entry({ id: "guest-entry" }));
    const guestHistory = await historyRepository.list();
    expect(guestHistory).toHaveLength(1);
    expect(guestHistory[0].metadata?.profileId).toBe("guest");
  });

  it("keeps an explicit metadata profileId instead of the active profile", async () => {
    await historyRepository.add(entry({ metadata: { profileId: "guest" } }));

    expect(await historyRepository.list()).toHaveLength(0);

    await preferencesRepository.updatePreference("activeProfileId", "guest");
    expect(await historyRepository.list()).toHaveLength(1);
  });
});
