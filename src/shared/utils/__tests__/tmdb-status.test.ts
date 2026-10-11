import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { tmdbStatusLabel } from "../tmdb-status";

describe("tmdbStatusLabel", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it.each([
    ["Returning Series", "Série en cours"],
    ["Ended", "Terminée"],
    ["Canceled", "Annulée"],
    ["In Production", "En production"],
    ["Planned", "Prévue"],
    ["Pilot", "Pilote"],
    ["Released", "Sortie"],
    ["Post Production", "En post-production"],
    ["Rumored", "Rumeur"],
  ])("translates %s in French", async (status, expected) => {
    await i18n.changeLanguage("fr");
    expect(tmdbStatusLabel(status, i18n.t)).toBe(expected);
  });

  it("translates in English too", async () => {
    await i18n.changeLanguage("en");
    expect(tmdbStatusLabel("Post Production", i18n.t)).toBe("Post-production");
  });

  it("returns an unknown status unchanged", () => {
    expect(tmdbStatusLabel("Something New", i18n.t)).toBe("Something New");
  });
});
