import { describe, expect, it } from "vitest";
import { computeCollectionProgress } from "../collection-progress";
import { makeLibraryItem, makeMedia } from "@/shared/test-utils";
import type { Movie } from "@/types/media";

const movie = (id: number, title: string): Movie => ({
  ...makeMedia({ id, title, mediaType: "movie" }),
  mediaType: "movie",
});

describe("computeCollectionProgress", () => {
  it("buckets a part with no library entry at all as missing", () => {
    const parts = [movie(1, "Part One")];
    const progress = computeCollectionProgress(parts, []);

    expect(progress.totalCount).toBe(1);
    expect(progress.watchedCount).toBe(0);
    expect(progress.entries).toEqual([{ movie: parts[0], status: "missing" }]);
  });

  it("buckets a completed library entry as watched", () => {
    const parts = [movie(1, "Part One")];
    const library = [makeLibraryItem({ mediaId: 1, mediaType: "movie", status: "completed" })];
    const progress = computeCollectionProgress(parts, library);

    expect(progress.watchedCount).toBe(1);
    expect(progress.entries[0]?.status).toBe("watched");
  });

  it("buckets a library entry that isn't completed yet as planned, not watched or missing", () => {
    const parts = [movie(1, "Part One")];
    const library = [makeLibraryItem({ mediaId: 1, mediaType: "movie", status: "planned" })];
    const progress = computeCollectionProgress(parts, library);

    expect(progress.watchedCount).toBe(0);
    expect(progress.entries[0]?.status).toBe("planned");
  });

  it("never matches a series library entry with the same numeric id as a movie part", () => {
    const parts = [movie(550, "Same Numeric Id")];
    const library = [makeLibraryItem({ mediaId: 550, mediaType: "series", status: "completed" })];
    const progress = computeCollectionProgress(parts, library);

    expect(progress.entries[0]?.status).toBe("missing");
  });

  it("computes watchedCount / totalCount across a mixed franchise, preserving TMDB's own part order", () => {
    const parts = [movie(1, "Watched One"), movie(2, "Planned Two"), movie(3, "Missing Three")];
    const library = [
      makeLibraryItem({ mediaId: 1, mediaType: "movie", status: "completed" }),
      makeLibraryItem({ id: "item-2", mediaId: 2, mediaType: "movie", status: "watching" }),
    ];
    const progress = computeCollectionProgress(parts, library);

    expect(progress.totalCount).toBe(3);
    expect(progress.watchedCount).toBe(1);
    expect(progress.entries.map((entry) => entry.status)).toEqual(["watched", "planned", "missing"]);
    expect(progress.entries.map((entry) => entry.movie.title)).toEqual(["Watched One", "Planned Two", "Missing Three"]);
  });
});
