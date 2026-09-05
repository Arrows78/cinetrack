import { describe, expect, it } from "vitest";
import { STALE_PLANNED_DAYS, selectStalePlannedItems } from "../use-stale-planned-items";
import type { LibraryItem } from "@/types/media";

function makeLibraryItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: "l1",
    profileId: "default",
    mediaId: 7,
    mediaType: "movie",
    title: "Dune",
    posterPath: "/dune.jpg",
    backdropPath: null,
    year: 2021,
    rating: 8,
    genres: ["Science Fiction"],
    status: "planned",
    favourite: false,
    userRating: null,
    notes: null,
    tags: [],
    startedAt: null,
    completedAt: null,
    rewatchCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("selectStalePlannedItems", () => {
  const now = new Date("2026-06-15T00:00:00.000Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  it("keeps only planned items untouched for at least STALE_PLANNED_DAYS", () => {
    const fresh = makeLibraryItem({ mediaId: 1, updatedAt: daysAgo(STALE_PLANNED_DAYS - 1) });
    const stale = makeLibraryItem({ mediaId: 2, updatedAt: daysAgo(STALE_PLANNED_DAYS) });

    const result = selectStalePlannedItems([fresh, stale], now);

    expect(result).toEqual([{ item: stale, daysSinceUpdate: STALE_PLANNED_DAYS }]);
  });

  it("ignores non-planned items regardless of how stale they are", () => {
    const watching = makeLibraryItem({ status: "watching", updatedAt: daysAgo(400) });
    expect(selectStalePlannedItems([watching], now)).toEqual([]);
  });
});
