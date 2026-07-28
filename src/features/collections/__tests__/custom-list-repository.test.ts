import { beforeEach, describe, expect, it } from "vitest";
import { customListRepository } from "../custom-list-repository";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import { makeMedia } from "@/shared/test-utils";

describe("customListRepository (browser fallback)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    preferencesRepository.invalidate();
  });

  it("creates a list with a trimmed name", async () => {
    const list = await customListRepository.create("  Soirées ciné  ", "Les classiques");

    expect(list.name).toBe("Soirées ciné");
    expect(list.description).toBe("Les classiques");
    expect(await customListRepository.list()).toHaveLength(1);
  });

  it("rejects a whitespace-only name", async () => {
    await expect(customListRepository.create("   ")).rejects.toThrow("Le nom de la liste est requis.");
    expect(await customListRepository.list()).toHaveLength(0);
  });

  it("scopes lists to the active profile", async () => {
    await customListRepository.create("Ma liste");

    await preferencesRepository.updatePreference("activeProfileId", "guest");
    expect(await customListRepository.list()).toHaveLength(0);
  });

  it("adds items with increasing positions and deduplicates re-adds", async () => {
    const list = await customListRepository.create("Ma liste");

    await customListRepository.add(list.id, makeMedia({ id: 1, title: "Premier" }));
    await customListRepository.add(list.id, makeMedia({ id: 2, title: "Deuxième" }));
    await customListRepository.add(list.id, makeMedia({ id: 1, title: "Premier" }));

    const items = await customListRepository.items(list.id);
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.mediaId)).toEqual([2, 1]);
  });

  it("removes a single item without touching the rest", async () => {
    const list = await customListRepository.create("Ma liste");
    await customListRepository.add(list.id, makeMedia({ id: 1 }));
    await customListRepository.add(list.id, makeMedia({ id: 2 }));

    await customListRepository.removeItem(list.id, 1, "movie");

    const items = await customListRepository.items(list.id);
    expect(items.map((item) => item.mediaId)).toEqual([2]);
  });

  it("removes a list along with its items", async () => {
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
