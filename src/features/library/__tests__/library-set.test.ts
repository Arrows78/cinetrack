import { describe, expect, it } from "vitest";
import { buildLibraryKeySet, isInLibrary } from "../library-set";
import type { LibraryItem } from "@/types/media";

const libraryItem = (overrides: Partial<LibraryItem> = {}): LibraryItem => ({
  id: "item-1",
  profileId: "profile-1",
  mediaId: 550,
  mediaType: "movie",
  title: "Fight Club",
  year: 1999,
  rating: 8.4,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  genres: ["Drama"],
  status: "completed",
  favourite: false,
  tags: [],
  rewatchCount: 0,
  ...overrides,
});

describe("buildLibraryKeySet / isInLibrary", () => {
  it("matches an item present in the library by mediaId+mediaType", () => {
    const keySet = buildLibraryKeySet([libraryItem({ mediaId: 550, mediaType: "movie" })]);
    expect(isInLibrary({ mediaId: 550, mediaType: "movie" }, keySet)).toBe(true);
  });

  it("does not match a different mediaId", () => {
    const keySet = buildLibraryKeySet([libraryItem({ mediaId: 550, mediaType: "movie" })]);
    expect(isInLibrary({ mediaId: 551, mediaType: "movie" }, keySet)).toBe(false);
  });

  it("does not match the same mediaId with a different mediaType", () => {
    const keySet = buildLibraryKeySet([libraryItem({ mediaId: 1399, mediaType: "series" })]);
    expect(isInLibrary({ mediaId: 1399, mediaType: "movie" }, keySet)).toBe(false);
  });

  it("returns false for every lookup against an empty library", () => {
    const keySet = buildLibraryKeySet([]);
    expect(isInLibrary({ mediaId: 1, mediaType: "movie" }, keySet)).toBe(false);
  });
});
