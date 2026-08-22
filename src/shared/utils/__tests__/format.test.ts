import { addDays, format as formatDateFns } from "date-fns";
import { beforeEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import {
  buildTmdbImageUrl,
  formatDate,
  formatEpisodeCode,
  formatEpisodeNumber,
  formatRating,
  formatRelativeCountdown,
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

describe("formatRelativeCountdown", () => {
  const day = (offset: number) => formatDateFns(addDays(new Date(), offset), "yyyy-MM-dd");

  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("shows 'Today' and 'Tomorrow' for the two nearest days", () => {
    expect(formatRelativeCountdown(day(0))).toBe("Today");
    expect(formatRelativeCountdown(day(1))).toBe("Tomorrow");
  });

  it("counts in days from 2 up to (not including) a full week", () => {
    expect(formatRelativeCountdown(day(2))).toBe("In 2 days");
    expect(formatRelativeCountdown(day(3))).toBe("In 3 days");
    expect(formatRelativeCountdown(day(6))).toBe("In 6 days");
  });

  it("switches to week granularity at 7 days out, never showing 'In 0 weeks' or 'In 7 days'", () => {
    expect(formatRelativeCountdown(day(7))).toBe("In 1 week");
    expect(formatRelativeCountdown(day(9))).toBe("In 1 week");
  });

  it("rounds to the nearest week for dates further out", () => {
    expect(formatRelativeCountdown(day(13))).toBe("In 2 weeks");
    expect(formatRelativeCountdown(day(14))).toBe("In 2 weeks");
    expect(formatRelativeCountdown(day(30))).toBe("In 4 weeks");
  });

  it("uses the active language", async () => {
    await i18n.changeLanguage("fr");
    expect(formatRelativeCountdown(day(0))).toBe("Aujourd'hui");
    expect(formatRelativeCountdown(day(1))).toBe("Demain");
    expect(formatRelativeCountdown(day(3))).toBe("Dans 3 jours");
    expect(formatRelativeCountdown(day(7))).toBe("Dans 1 semaine");
    expect(formatRelativeCountdown(day(14))).toBe("Dans 2 semaines");
  });

  it("falls back to the generic relative-date phrasing for a past date", () => {
    expect(formatRelativeCountdown(day(-3))).toBe(formatRelativeDate(day(-3)));
  });

  it("falls back to the raw value for malformed input", () => {
    expect(formatRelativeCountdown("not-a-date")).toBe("not-a-date");
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

  it("shows only minutes under an hour", () => {
    expect(formatWatchDurationBreakdown(45)).toBe("45min");
  });

  it("shows hours and minutes under a day", () => {
    expect(formatWatchDurationBreakdown(90)).toBe("1h 30min");
  });

  it("drops a zero minutes unit rather than showing it", () => {
    expect(formatWatchDurationBreakdown(60)).toBe("1h");
  });

  it("drops a zero days unit rather than showing '0 days'", () => {
    // Exactly 30 days (a full month), no leftover days/hours/minutes.
    expect(formatWatchDurationBreakdown(30 * 24 * 60)).toBe("1 month");
  });

  it("drops a zero months unit rather than showing '0 months'", () => {
    // 3 days, well under a month.
    expect(formatWatchDurationBreakdown(3 * 24 * 60)).toBe("3 days");
  });

  it("breaks a large total into every non-zero unit, months first", () => {
    // 7669h 45min total.
    expect(formatWatchDurationBreakdown(7669 * 60 + 45)).toBe("10 months 19 days 13h 45min");
  });

  it("falls back to '0min' for a zero total", () => {
    expect(formatWatchDurationBreakdown(0)).toBe("0min");
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
