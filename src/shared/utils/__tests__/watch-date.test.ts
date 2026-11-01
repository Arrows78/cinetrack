import { describe, expect, it } from "vitest";
import { toDateInputValue, watchedAtForDay } from "../watch-date";

describe("watch-date", () => {
  const now = new Date(2026, 10, 1, 21, 30);

  it("formats a local calendar day for a date input", () => {
    expect(toDateInputValue(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("keeps the current moment for today, and midday local time for an earlier day", () => {
    expect(watchedAtForDay("2026-11-01", now)).toBe(now.toISOString());
    expect(watchedAtForDay("2024-03-12", now)).toBe(new Date(2024, 2, 12, 12).toISOString());
  });
});
