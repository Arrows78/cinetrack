import { describe, expect, it } from "vitest";
import { pickBestSeed } from "../use-because-you-liked";
import { makeLibraryItem } from "@/shared/test-utils";

const libraryItem = makeLibraryItem;

describe("pickBestSeed", () => {
  it("returns null when the library is empty", () => {
    expect(pickBestSeed([])).toBeNull();
  });

  it("returns null when every item is merely planned (a brand-new library)", () => {
    const item = libraryItem({ status: "planned" });
    expect(pickBestSeed([item])).toBeNull();
  });

  describe("tier 1 — completed and rated", () => {
    it("picks the highest-rated completed item over a lower-rated one", () => {
      const low = libraryItem({ id: "low", mediaId: 1, status: "completed", userRating: 6 });
      const high = libraryItem({ id: "high", mediaId: 2, status: "completed", userRating: 9 });
      expect(pickBestSeed([low, high])?.id).toBe("high");
    });

    it("breaks rating ties by the most recently completed", () => {
      const older = libraryItem({
        id: "older",
        mediaId: 1,
        status: "completed",
        userRating: 8,
        completedAt: "2026-01-01T00:00:00.000Z",
      });
      const newer = libraryItem({
        id: "newer",
        mediaId: 2,
        status: "completed",
        userRating: 8,
        completedAt: "2026-06-01T00:00:00.000Z",
      });
      expect(pickBestSeed([older, newer])?.id).toBe("newer");
    });

    it("outranks every other tier even when they're also present", () => {
      const favourite = libraryItem({ id: "favourite", mediaId: 1, status: "watching", favourite: true });
      const ratedCompleted = libraryItem({ id: "rated", mediaId: 2, status: "completed", userRating: 7 });
      expect(pickBestSeed([favourite, ratedCompleted])?.id).toBe("rated");
    });
  });

  describe("tier 2 — favourited (no rated-completed item exists)", () => {
    it("picks a favourited item regardless of its watch status", () => {
      const planned = libraryItem({ id: "planned", mediaId: 1, status: "planned" });
      const favourite = libraryItem({ id: "favourite", mediaId: 2, status: "planned", favourite: true });
      expect(pickBestSeed([planned, favourite])?.id).toBe("favourite");
    });

    it("picks the most recently updated favourite when there are several", () => {
      const older = libraryItem({
        id: "older",
        mediaId: 1,
        favourite: true,
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      const newer = libraryItem({
        id: "newer",
        mediaId: 2,
        favourite: true,
        updatedAt: "2026-06-01T00:00:00.000Z",
      });
      expect(pickBestSeed([older, newer])?.id).toBe("newer");
    });
  });

  describe("tier 3 — completed without a rating", () => {
    it("picks a completed-but-unrated item over a merely in-progress one", () => {
      const watching = libraryItem({ id: "watching", mediaId: 1, status: "watching" });
      const completed = libraryItem({ id: "completed", mediaId: 2, status: "completed", userRating: null });
      expect(pickBestSeed([watching, completed])?.id).toBe("completed");
    });
  });

  describe("tier 4 — watching (last resort)", () => {
    it("picks a title the user is currently watching when nothing stronger exists", () => {
      const item = libraryItem({ status: "watching", userRating: null });
      expect(pickBestSeed([item])?.id).toBe(item.id);
    });
  });
});
