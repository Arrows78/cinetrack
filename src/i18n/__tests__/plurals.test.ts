import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import en from "../locales/en.json";
import fr from "../locales/fr.json";

function flatten(node: unknown, prefix = "", into: Record<string, string> = {}): Record<string, string> {
  if (typeof node === "object" && node !== null) {
    for (const [key, child] of Object.entries(node)) flatten(child, prefix ? `${prefix}.${key}` : key, into);
  } else {
    into[prefix] = String(node);
  }
  return into;
}

describe("plural forms", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it.each([
    ["en", "stats.filmCount", [0, 1, 2], ["0 films", "1 film", "2 films"]],
    ["en", "stats.episodeCount", [0, 1, 2], ["0 episodes", "1 episode", "2 episodes"]],
    ["en", "stats.activeDays", [1, 12], ["over 1 active day", "over 12 active days"]],
    // French counts 0 as singular, English does not.
    ["fr", "stats.filmCount", [0, 1, 2], ["0 film", "1 film", "2 films"]],
    ["fr", "stats.episodeCount", [0, 1, 2], ["0 épisode", "1 épisode", "2 épisodes"]],
    ["fr", "stats.activeDays", [1, 12], ["sur 1 jour actif", "sur 12 jours actifs"]],
  ] as const)("%s %s", async (language, key, counts, expected) => {
    await i18n.changeLanguage(language);
    expect(counts.map((count) => i18n.t(key, { count }))).toEqual(expected);
  });

  it("every _one form has its _other form, in both languages", () => {
    for (const [name, locale] of [
      ["en", en],
      ["fr", fr],
    ] as const) {
      const keys = Object.keys(flatten(locale));
      const orphans = keys.filter(
        (key) =>
          (key.endsWith("_one") && !keys.includes(key.replace(/_one$/, "_other"))) ||
          (key.endsWith("_other") && !keys.includes(key.replace(/_other$/, "_one")))
      );
      expect(orphans, `${name}: plural keys missing their counterpart`).toEqual([]);
    }
  });
});
