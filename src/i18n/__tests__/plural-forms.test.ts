import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import en from "../locales/en.json";
import fr from "../locales/fr.json";

// A string that interpolates {{count}} without singular and plural forms reads
// "1 days" / "over 1 active days" for a count of one. Plain keys are fine only
// when a count of one cannot reach them, which is listed (and justified) here.
const COUNT_WITHOUT_PLURAL_FORMS = new Map<string, string>([
  ["common.countdownInDays", "only ever called for 2 to 6 days: 0 and 1 have their own wording"],
  ["common.sizeBytes", "a unit abbreviation, not a noun"],
  ["home.heroGoTo", "{{count}} is the size of the carousel, with {{index}} the position: read as 'x of y'"],
  ["stats.milestones.episodesThreshold", "thresholds start at 10"],
  ["stats.milestones.moviesThreshold", "thresholds start at 10"],
  ["stats.milestones.hoursThreshold", "thresholds start at 10"],
  ["stats.milestones.seriesThreshold", "thresholds start at 10"],
]);

function flatten(value: unknown, prefix = ""): Array<[string, string]> {
  if (typeof value === "string") return [[prefix, value]];
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
}

describe("plural forms", () => {
  for (const [name, locale] of [
    ["en", en],
    ["fr", fr],
  ] as const) {
    it(`${name}: every string interpolating {{count}} has one and other forms`, () => {
      const entries = new Map(flatten(locale));
      const offenders = [...entries]
        .filter(([key, value]) => value.includes("{{count}}") && !/_(zero|one|two|few|many|other)$/.test(key))
        .map(([key]) => key)
        .filter((key) => !COUNT_WITHOUT_PLURAL_FORMS.has(key));

      expect(offenders, `add ${offenders.join(", ")} as _one / _other keys`).toEqual([]);

      const bases = new Set(
        [...entries.keys()].flatMap((key) => {
          const match = /^(.*)_(zero|one|two|few|many|other)$/.exec(key);
          return match ? [match[1]!] : [];
        })
      );
      for (const base of bases) {
        expect(entries.has(`${base}_one`), `${name}: ${base}_one`).toBe(true);
        expect(entries.has(`${base}_other`), `${name}: ${base}_other`).toBe(true);
      }
    });
  }

  it("reads one active day, and many, in both languages", async () => {
    await i18n.changeLanguage("en");
    expect(i18n.t("stats.activeDays", { count: 1 })).toBe("over 1 active day");
    expect(i18n.t("stats.activeDays", { count: 0 })).toBe("over 0 active days");
    expect(i18n.t("stats.activeDays", { count: 2 })).toBe("over 2 active days");

    await i18n.changeLanguage("fr");
    expect(i18n.t("stats.activeDays", { count: 0 })).toBe("sur 0 jour actif");
    expect(i18n.t("stats.activeDays", { count: 1 })).toBe("sur 1 jour actif");
    expect(i18n.t("stats.activeDays", { count: 2 })).toBe("sur 2 jours actifs");
  });
});
