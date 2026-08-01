import { describe, expect, it, vi } from "vitest";
import { useTestSqlite } from "@/db/__tests__/sqlite-test-harness";
import type { ViewingHistoryItem } from "@/types/media";

vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => true }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));

const entry = (overrides: Partial<ViewingHistoryItem> = {}): ViewingHistoryItem => ({
  id: crypto.randomUUID(),
  mediaId: 1,
  mediaType: "movie",
  title: "Test Movie",
  action: "movie:watched",
  timestamp: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("historyRepository", () => {
  const sqlite = useTestSqlite();

  const seedGuestProfile = () => {
    sqlite.current.exec(
      `INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('guest', 'Guest', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
    );
  };

  it("returns entries newest first even when they were added out of order", async () => {
    const { historyRepository } = await import("../history-repository");

    await historyRepository.add(entry({ timestamp: "2026-01-02T00:00:00.000Z", title: "Milieu" }));
    await historyRepository.add(entry({ timestamp: "2026-01-01T00:00:00.000Z", title: "Ancien" }));
    await historyRepository.add(entry({ timestamp: "2026-01-03T00:00:00.000Z", title: "Récent" }));

    const list = await historyRepository.list();
    expect(list.map((item) => item.title)).toEqual(["Récent", "Milieu", "Ancien"]);
  });

  it("respects the limit parameter", async () => {
    const { historyRepository } = await import("../history-repository");

    for (let index = 0; index < 5; index += 1) {
      await historyRepository.add(entry({ id: crypto.randomUUID(), timestamp: `2026-01-0${index + 1}T00:00:00.000Z` }));
    }

    expect(await historyRepository.list(2)).toHaveLength(2);
  });

  it("stamps entries with the active profile and scopes list() to it", async () => {
    const { historyRepository } = await import("../history-repository");
    const { preferencesRepository } = await import("@/features/preferences/preferences-repository");

    await historyRepository.add(entry());
    expect(await historyRepository.list()).toHaveLength(1);

    // Migrations only run lazily on the first repository call above, so the
    // profiles table doesn't exist until now.
    seedGuestProfile();
    await preferencesRepository.updatePreference("activeProfileId", "guest");
    expect(await historyRepository.list()).toHaveLength(0);

    await historyRepository.add(entry({ id: "guest-entry" }));
    const guestHistory = await historyRepository.list();
    expect(guestHistory).toHaveLength(1);
    expect(guestHistory[0].metadata?.profileId).toBe("guest");
  });

  it("keeps an explicit metadata profileId instead of the active profile", async () => {
    const { historyRepository } = await import("../history-repository");
    const { preferencesRepository } = await import("@/features/preferences/preferences-repository");
    const { getDatabase } = await import("@/db/client");

    // Trigger the lazy migration run before seeding a profile row directly.
    await getDatabase();
    seedGuestProfile();
    await historyRepository.add(entry({ metadata: { profileId: "guest" } }));

    expect(await historyRepository.list()).toHaveLength(0);

    await preferencesRepository.updatePreference("activeProfileId", "guest");
    expect(await historyRepository.list()).toHaveLength(1);
  });
});
