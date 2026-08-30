import { describe, expect, it } from "vitest";
import {
  STALE_PLANNED_DAYS,
  selectMissingMetadataItems,
  selectProbableDuplicates,
  selectStalePlannedItems,
} from "../use-library-health-selectors";
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

describe("selectMissingMetadataItems", () => {
  it("keeps an item with no poster", () => {
    const item = makeLibraryItem({ posterPath: null });
    expect(selectMissingMetadataItems([item])).toEqual([item]);
  });

  it("keeps an item with no genres", () => {
    const item = makeLibraryItem({ genres: [] });
    expect(selectMissingMetadataItems([item])).toEqual([item]);
  });

  it("excludes an item that has both a poster and at least one genre", () => {
    const item = makeLibraryItem({ posterPath: "/dune.jpg", genres: ["Science Fiction"] });
    expect(selectMissingMetadataItems([item])).toEqual([]);
  });
});

describe("selectProbableDuplicates", () => {
  it("groups two items with the same normalized title, media type, and close year", () => {
    const first = makeLibraryItem({ mediaId: 1, title: "The Wire", year: 2002 });
    const second = makeLibraryItem({ mediaId: 2, title: "The Wire", year: 2003 });

    const groups = selectProbableDuplicates([first, second]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.items).toEqual([first, second]);
  });

  it("matches through diacritics, case, and a leading article", () => {
    const first = makeLibraryItem({ mediaId: 1, title: "Café Society", year: 2016 });
    const second = makeLibraryItem({ mediaId: 2, title: "CAFE SOCIETY", year: 2016 });

    expect(selectProbableDuplicates([first, second])).toHaveLength(1);
  });

  it("does not group items of a different media type even with the exact same title", () => {
    const movie = makeLibraryItem({ mediaId: 1, mediaType: "movie", title: "Dune", year: 2021 });
    const series = makeLibraryItem({ mediaId: 2, mediaType: "series", title: "Dune", year: 2021 });

    expect(selectProbableDuplicates([movie, series])).toEqual([]);
  });

  it("does not group items whose year is further apart than the tolerance", () => {
    const original = makeLibraryItem({ mediaId: 1, title: "A Star Is Born", year: 1976 });
    const remake = makeLibraryItem({ mediaId: 2, title: "A Star Is Born", year: 2018 });

    expect(selectProbableDuplicates([original, remake])).toEqual([]);
  });

  it("still groups when one side has no year at all", () => {
    const withYear = makeLibraryItem({ mediaId: 1, title: "Arrival", year: 2016 });
    const withoutYear = makeLibraryItem({ mediaId: 2, title: "Arrival", year: null });

    expect(selectProbableDuplicates([withYear, withoutYear])).toHaveLength(1);
  });

  it("keeps two distinct duplicate pairs of the same title separate instead of merging or dropping either", () => {
    const original1 = makeLibraryItem({ mediaId: 1, title: "A Star Is Born", year: 1976 });
    const original2 = makeLibraryItem({ mediaId: 2, title: "A Star Is Born", year: 1977 });
    const remake1 = makeLibraryItem({ mediaId: 3, title: "A Star Is Born", year: 2018 });
    const remake2 = makeLibraryItem({ mediaId: 4, title: "A Star Is Born", year: 2018 });

    const groups = selectProbableDuplicates([original1, original2, remake1, remake2]);

    expect(groups).toHaveLength(2);
    const allGroupedIds = groups.flatMap((group) => group.items.map((item) => item.mediaId)).sort();
    expect(allGroupedIds).toEqual([1, 2, 3, 4]);
  });

  it("does not report a single, non-duplicated item", () => {
    expect(selectProbableDuplicates([makeLibraryItem()])).toEqual([]);
  });
});
