import { describe, expect, it } from "vitest";
import { pickTopGenre } from "../use-favourite-genre-rail";
import type { MergedGenre } from "@/features/media/use-merged-genres";

const genre = (overrides: Partial<MergedGenre> = {}): MergedGenre => ({
  id: 18,
  label: "Drama",
  labelKey: "genres.drama",
  icon: "🎭",
  movieId: 18,
  seriesId: 18,
  ...overrides,
});

describe("pickTopGenre", () => {
  it("returns null when there are no favourite genres yet", () => {
    expect(pickTopGenre([], [genre()])).toBeNull();
  });

  it("matches the first (already-sorted) favourite genre by label", () => {
    const drama = genre({ label: "Drama" });
    const comedy = genre({ label: "Comedy", id: 35, movieId: 35, seriesId: 35 });
    const result = pickTopGenre(
      [
        { name: "Drama", count: 9 },
        { name: "Comedy", count: 2 },
      ],
      [drama, comedy]
    );
    expect(result?.label).toBe("Drama");
  });

  it("returns null when the top favourite genre has no match in the merged list", () => {
    const result = pickTopGenre([{ name: "Unknown Genre", count: 5 }], [genre({ label: "Drama" })]);
    expect(result).toBeNull();
  });
});
