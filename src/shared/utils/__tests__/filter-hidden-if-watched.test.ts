import { describe, expect, it } from "vitest";
import { filterHiddenIfWatched } from "../library-set";
import { makeLibraryItem, makeMedia } from "@/shared/test-utils";

describe("filterHiddenIfWatched", () => {
  it("is a no-op when the toggle is off, even if the item is completed", () => {
    const watched = makeMedia({ id: 1, mediaType: "movie" });
    const library = [makeLibraryItem({ mediaId: 1, mediaType: "movie", status: "completed" })];

    expect(filterHiddenIfWatched([watched], library, false)).toEqual([watched]);
  });

  it("drops an item whose library entry is completed when the toggle is on", () => {
    const watched = makeMedia({ id: 1, mediaType: "movie" });
    const unwatched = makeMedia({ id: 2, mediaType: "movie" });
    const library = [makeLibraryItem({ mediaId: 1, mediaType: "movie", status: "completed" })];

    expect(filterHiddenIfWatched([watched, unwatched], library, true)).toEqual([unwatched]);
  });

  it("keeps an item that's in the library but not completed (planned/watching/etc.)", () => {
    const inProgress = makeMedia({ id: 1, mediaType: "movie" });
    const library = [makeLibraryItem({ mediaId: 1, mediaType: "movie", status: "watching" })];

    expect(filterHiddenIfWatched([inProgress], library, true)).toEqual([inProgress]);
  });

  it("keeps an item with no library entry at all", () => {
    const neverAdded = makeMedia({ id: 1, mediaType: "movie" });

    expect(filterHiddenIfWatched([neverAdded], [], true)).toEqual([neverAdded]);
  });

  it("does not confuse a completed series with a movie sharing the same numeric id", () => {
    const movie = makeMedia({ id: 1, mediaType: "movie" });
    const library = [makeLibraryItem({ mediaId: 1, mediaType: "series", status: "completed" })];

    expect(filterHiddenIfWatched([movie], library, true)).toEqual([movie]);
  });

  it("returns [] immediately for an empty input", () => {
    expect(filterHiddenIfWatched([], [], true)).toEqual([]);
  });
});
