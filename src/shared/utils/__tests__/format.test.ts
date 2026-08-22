import { beforeEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import {
  buildTmdbImageUrl,
  formatDate,
  formatEpisodeCode,
  formatEpisodeNumber,
  formatRating,
  formatRelativeDate,
  formatRuntime,
  formatWatchDurationBreakdown,
  percent,
  pluralize,
  yearFromDate,
} from "../format";

describe("buildTmdbImageUrl", () => {
  it("builds a URL with the default and explicit sizes", () => {
    expect(buildTmdbImageUrl("/poster.jpg")).toBe("https://image.tmdb.org/t/p/w780/poster.jpg");
    expect(buildTmdbImageUrl("/poster.jpg", "w185")).toBe("https://image.tmdb.org/t/p/w185/poster.jpg");
  });

  it("returns undefined without a path", () => {
    expect(buildTmdbImageUrl(null)).toBeUndefined();
    expect(buildTmdbImageUrl(undefined)).toBeUndefined();
    expect(buildTmdbImageUrl("")).toBeUndefined();
  });
});

describe("formatDate", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
  });

  it("formats an ISO date in the active language", async () => {
    expect(formatDate("2026-07-14")).toMatch(/14 .*juil.* 2026/i);

    await i18n.changeLanguage("en");
    expect(formatDate("2026-07-14")).toMatch(/14 jul 2026/i);
  });

  it("falls back on missing or invalid input", async () => {
    expect(formatDate(null)).toBe("Date inconnue");
    expect(formatDate(undefined)).toBe("Date inconnue");
    expect(formatDate("not-a-date")).toBe("not-a-date");

    await i18n.changeLanguage("en");
    expect(formatDate(null)).toBe("Unknown date");
  });
});

describe("formatRelativeDate", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
  });

  it("falls back on missing or invalid input", () => {
    expect(formatRelativeDate(null)).toBe("Date inconnue");
    expect(formatRelativeDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatRuntime", () => {
  it("formats hours and minutes", () => {
    expect(formatRuntime(95)).toBe("1h 35");
    expect(formatRuntime(60)).toBe("1h 00");
    expect(formatRuntime(45)).toBe("45 min");
  });

  it("returns a placeholder for missing runtimes", () => {
    expect(formatRuntime(null)).toBe("—");
    expect(formatRuntime(undefined)).toBe("—");
    expect(formatRuntime(0)).toBe("—");
  });
});

describe("formatRating", () => {
  it("uses the decimal separator of the active language", async () => {
    await i18n.changeLanguage("fr");
    expect(formatRating(7.46)).toBe("7,5");
    expect(formatRating(10)).toBe("10,0");

    await i18n.changeLanguage("en");
    expect(formatRating(7.46)).toBe("7.5");
  });

  it("returns a placeholder for missing ratings", () => {
    expect(formatRating(null)).toBe("—");
    expect(formatRating(0)).toBe("—");
  });
});

describe("formatEpisodeCode", () => {
  it("formats raw numbers by default", () => {
    expect(formatEpisodeCode(1, 2)).toBe("S1E2");
  });

  it("zero-pads when requested", () => {
    expect(formatEpisodeCode(1, 2, { padded: true })).toBe("S01E02");
  });
});

describe("formatEpisodeNumber", () => {
  it("formats a raw number by default", () => {
    expect(formatEpisodeNumber(5)).toBe("E5");
  });

  it("zero-pads when requested", () => {
    expect(formatEpisodeNumber(5, { padded: true })).toBe("E05");
  });
});

describe("yearFromDate", () => {
  it("extracts the year", () => {
    expect(yearFromDate("2024-05-01")).toBe(2024);
  });

  it("returns null for missing or malformed input", () => {
    expect(yearFromDate(null)).toBeNull();
    expect(yearFromDate(undefined)).toBeNull();
    expect(yearFromDate("abcd-ef")).toBeNull();
  });
});

describe("formatWatchDurationBreakdown", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("shows only the plain hours/minutes label under 24h — no day breakdown at all", () => {
    expect(formatWatchDurationBreakdown(200)).toBe("3h 20min");
  });

  it("adds a day count once the total reaches a full day (24h boundary)", () => {
    expect(formatWatchDurationBreakdown(1440)).toBe("24h 0min — that's about 1 day");
  });

  it("pluralizes the day count and stays in the days-only form under the month threshold", () => {
    expect(formatWatchDurationBreakdown(14400)).toBe("240h 0min — that's about 10 days"); // 10 days
  });

  it("adds an approximate month count once the total reaches ~30 days", () => {
    expect(formatWatchDurationBreakdown(43200)).toBe("720h 0min — that's about 30 days (~1 month)"); // exactly 30 days
  });

  it("matches the reference large-total example from the spec", () => {
    // 7669h45m = 460185 minutes => floor(460185/1440) = 319 days, floor(319/30) = 10 months.
    expect(formatWatchDurationBreakdown(460185)).toBe("7669h 45min — that's about 319 days (~10 months)");
  });

  it("floors rather than rounds, so it reads as a lower bound", () => {
    // 59 days: just under the 60-day mark for 2 months.
    expect(formatWatchDurationBreakdown(59 * 1440)).toBe("1416h 0min — that's about 59 days (~1 month)");
  });

  it("uses French day/month pluralization rules", async () => {
    await i18n.changeLanguage("fr");

    expect(formatWatchDurationBreakdown(1440)).toBe("24 h 0 min — soit environ 1 jour");
    expect(formatWatchDurationBreakdown(2880)).toBe("48 h 0 min — soit environ 2 jours");
    // "mois" is invariant in French — same word for 1 or several months.
    expect(formatWatchDurationBreakdown(43200)).toBe("720 h 0 min — soit environ 30 jours (~1 mois)");
    expect(formatWatchDurationBreakdown(86400)).toBe("1440 h 0 min — soit environ 60 jours (~2 mois)");
  });
});

describe("percent", () => {
  it("rounds and guards the zero denominator", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(5, 0)).toBe(0);
  });
});

describe("pluralize", () => {
  it("uses the singular for 0 and 1, the plural above", () => {
    expect(pluralize(0, "film", "films")).toBe("film");
    expect(pluralize(1, "film", "films")).toBe("film");
    expect(pluralize(2, "film", "films")).toBe("films");
  });
});
