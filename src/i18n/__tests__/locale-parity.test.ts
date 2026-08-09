import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import fr from "../locales/fr.json";

// Guards against the drift this repo already saw once: a key added to one
// locale but not the other silently renders the raw key (or the fallback
// language) at runtime.

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key));
}

describe("locale parity", () => {
  it("en.json and fr.json expose exactly the same keys", () => {
    const enKeys = flattenKeys(en).sort();
    const frKeys = flattenKeys(fr).sort();

    const missingInFr = enKeys.filter((key) => !frKeys.includes(key));
    const missingInEn = frKeys.filter((key) => !enKeys.includes(key));

    expect(missingInFr, `keys missing in fr.json: ${missingInFr.join(", ")}`).toEqual([]);
    expect(missingInEn, `keys missing in en.json: ${missingInEn.join(", ")}`).toEqual([]);
  });

  it("no translation value is empty", () => {
    const empty = (locale: unknown) =>
      flattenKeys(locale).filter((key) => {
        const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], locale);
        return typeof value === "string" && value.trim() === "";
      });

    expect(empty(en)).toEqual([]);
    expect(empty(fr)).toEqual([]);
  });

  // A key present in both locales can still drift if one translation drops
  // or renames an interpolation placeholder (e.g. {{count}}) — i18next then
  // renders the literal "{{count}}" instead of the value at runtime, with
  // no error anywhere. Catches that without needing to touch every call site.
  it("every key's interpolation parameters match between locales", () => {
    const readValue = (locale: unknown, key: string): unknown =>
      key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], locale);

    const placeholders = (value: unknown): string[] =>
      typeof value === "string" ? Array.from(value.matchAll(/{{\s*([\w.]+)\s*}}/g), (match) => match[1]!).sort() : [];

    const mismatches = flattenKeys(en)
      .map((key) => {
        const enParams = placeholders(readValue(en, key));
        const frParams = placeholders(readValue(fr, key));
        return { key, enParams, frParams };
      })
      .filter(({ enParams, frParams }) => enParams.join(",") !== frParams.join(","));

    expect(
      mismatches,
      mismatches.map(({ key, enParams, frParams }) => `${key}: en=[${enParams}] fr=[${frParams}]`).join("\n")
    ).toEqual([]);
  });
});
