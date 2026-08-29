import { describe, expect, it } from "vitest";
import { filterAvailableItems } from "../library-set";
import type { LibraryItem, MediaSummary } from "@/types/media";

const mediaSummary = (overrides: Partial<MediaSummary> = {}): MediaSummary => ({
  id: 1,
  mediaType: "movie",
  title: "Untitled",
  overview: "",
  genres: [],
  cast: [],
  ...overrides,
});

const libraryItem = (overrides: Partial<LibraryItem> = {}): LibraryItem => ({
  id: "item-1",
  profileId: "profile-1",
  mediaId: 1,
  mediaType: "movie",
  title: "Untitled",
  year: 2000,
  rating: 5,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  genres: [],
  status: "planned",
  favourite: false,
  tags: [],
  rewatchCount: 0,
  ...overrides,
});

describe("filterAvailableItems", () => {
  it("returns [] immediately for an empty results array", () => {
    expect(filterAvailableItems([], [libraryItem()])).toEqual([]);
  });

  it("excludes items already in the library by mediaId+mediaType", () => {
    const inLibrary = mediaSummary({ id: 1, mediaType: "movie" });
    const notInLibrary = mediaSummary({ id: 2, mediaType: "movie" });
    const library = [libraryItem({ mediaId: 1, mediaType: "movie" })];

    const result = filterAvailableItems([inLibrary, notInLibrary], library);

    expect(result).toEqual([notInLibrary]);
  });

  it("does not exclude an item with the same mediaId but a different mediaType", () => {
    const series = mediaSummary({ id: 1, mediaType: "series" });
    const library = [libraryItem({ mediaId: 1, mediaType: "movie" })];

    const result = filterAvailableItems([series], library);

    expect(result).toEqual([series]);
  });

  it("caps the result at the default cap of 4, keeping input order", () => {
    const results = Array.from({ length: 6 }, (_, index) => mediaSummary({ id: index + 1 }));

    const result = filterAvailableItems(results, []);

    expect(result).toHaveLength(4);
    expect(result).toEqual(results.slice(0, 4));
  });

  it("caps the result at a custom cap parameter", () => {
    const results = Array.from({ length: 6 }, (_, index) => mediaSummary({ id: index + 1 }));

    const result = filterAvailableItems(results, [], 2);

    expect(result).toHaveLength(2);
    expect(result).toEqual(results.slice(0, 2));
  });
});
