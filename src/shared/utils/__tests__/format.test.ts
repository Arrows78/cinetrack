import { describe, expect, it } from "vitest";
import {
  buildTmdbImageUrl,
  formatDate,
  formatRating,
  formatRelativeDate,
  formatRuntime,
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
  it("formats an ISO date in French", () => {
    expect(formatDate("2026-07-14")).toMatch(/14 .*juil.* 2026/i);
  });

  it("falls back on missing or invalid input", () => {
    expect(formatDate(null)).toBe("Date inconnue");
    expect(formatDate(undefined)).toBe("Date inconnue");
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatRelativeDate", () => {
  it("falls back on missing or invalid input", () => {
    expect(formatRelativeDate(null)).toBe("date inconnue");
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
  it("formats with a French decimal comma", () => {
    expect(formatRating(7.46)).toBe("7,5");
    expect(formatRating(10)).toBe("10,0");
  });

  it("returns a placeholder for missing ratings", () => {
    expect(formatRating(null)).toBe("—");
    expect(formatRating(0)).toBe("—");
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
