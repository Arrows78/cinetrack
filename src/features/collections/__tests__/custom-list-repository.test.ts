import { describe, expect, it, vi } from "vitest";
import { useTestSqlite } from "@/db/__tests__/sqlite-test-harness";
import { makeMedia } from "@/shared/test-utils";

vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => true }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));

describe("customListRepository", () => {
  const sqlite = useTestSqlite();

  it("creates a list with a trimmed name", async () => {
    const { customListRepository } = await import("../custom-list-repository");

    const list = await customListRepository.create("  Soirées ciné  ", "Les classiques");

    expect(list.name).toBe("Soirées ciné");
    expect(list.description).toBe("Les classiques");
    expect(await customListRepository.list()).toHaveLength(1);
  });

  it("rejects a whitespace-only name", async () => {
    const { customListRepository } = await import("../custom-list-repository");

    await expect(customListRepository.create("   ")).rejects.toThrow("Le nom de la liste est requis.");
    expect(await customListRepository.list()).toHaveLength(0);
  });

  it("scopes lists to the active profile", async () => {
    const { customListRepository } = await import("../custom-list-repository");
    const { preferencesRepository } = await import("@/features/preferences/preferences-repository");

    await customListRepository.create("Ma liste");

    sqlite.current.exec(
      `INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('guest', 'Guest', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
    );
    await preferencesRepository.updatePreference("activeProfileId", "guest");
    expect(await customListRepository.list()).toHaveLength(0);
  });

  it("adds items with increasing positions and deduplicates re-adds", async () => {
    const { customListRepository } = await import("../custom-list-repository");

    const list = await customListRepository.create("Ma liste");

    await customListRepository.add(list.id, makeMedia({ id: 1, title: "Premier" }));
    await customListRepository.add(list.id, makeMedia({ id: 2, title: "Deuxième" }));
    await customListRepository.add(list.id, makeMedia({ id: 1, title: "Premier" }));

    const items = await customListRepository.items(list.id);
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.mediaId)).toEqual([2, 1]);
  });

  it("removes a single item without touching the rest", async () => {
    const { customListRepository } = await import("../custom-list-repository");

    const list = await customListRepository.create("Ma liste");
    await customListRepository.add(list.id, makeMedia({ id: 1 }));
    await customListRepository.add(list.id, makeMedia({ id: 2 }));

    await customListRepository.removeItem(list.id, 1, "movie");

    const items = await customListRepository.items(list.id);
    expect(items.map((item) => item.mediaId)).toEqual([2]);
  });

  it("removes a list along with its items", async () => {
    const { customListRepository } = await import("../custom-list-repository");

    const kept = await customListRepository.create("Gardée");
    const removed = await customListRepository.create("Supprimée");
    await customListRepository.add(kept.id, makeMedia({ id: 1 }));
    await customListRepository.add(removed.id, makeMedia({ id: 2 }));

    await customListRepository.remove(removed.id);

    expect((await customListRepository.list()).map((list) => list.id)).toEqual([kept.id]);
    expect(await customListRepository.items(removed.id)).toHaveLength(0);
    expect(await customListRepository.items(kept.id)).toHaveLength(1);
  });
});
