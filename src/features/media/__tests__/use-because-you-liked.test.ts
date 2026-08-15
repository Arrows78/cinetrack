import { describe, expect, it } from "vitest";
import { pickBestSeed } from "../use-because-you-liked";
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

describe("pickBestSeed", () => {
  it("returns null when the library is empty", () => {
    expect(pickBestSeed([])).toBeNull();
  });

  it("ignores items that aren't completed", () => {
    const item = libraryItem({ status: "watching", userRating: 9 });
    expect(pickBestSeed([item])).toBeNull();
  });

  it("ignores completed items without a user rating", () => {
    const item = libraryItem({ status: "completed", userRating: null });
    expect(pickBestSeed([item])).toBeNull();
  });

  it("picks the highest-rated completed item", () => {
    const low = libraryItem({ id: "low", mediaId: 1, userRating: 6 });
    const high = libraryItem({ id: "high", mediaId: 2, userRating: 9 });
    expect(pickBestSeed([low, high])?.id).toBe("high");
  });

  it("breaks ties by the most recently completed", () => {
    const older = libraryItem({ id: "older", mediaId: 1, userRating: 8, completedAt: "2026-01-01T00:00:00.000Z" });
    const newer = libraryItem({ id: "newer", mediaId: 2, userRating: 8, completedAt: "2026-06-01T00:00:00.000Z" });
    expect(pickBestSeed([older, newer])?.id).toBe("newer");
  });
});
