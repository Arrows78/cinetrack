import { describe, expect, it } from "vitest";
import { filterDismissedByKeySet } from "../library-set";
import { makeMedia } from "@/shared/test-utils";

describe("filterDismissedByKeySet", () => {
  it("drops an item whose type:id key is in the dismissed set", () => {
    const dismissed = makeMedia({ id: 1, mediaType: "movie" });
    const kept = makeMedia({ id: 2, mediaType: "movie" });

    expect(filterDismissedByKeySet([dismissed, kept], new Set(["movie:1"]))).toEqual([kept]);
  });

  it("never gates on a toggle — always applies when the set is non-empty", () => {
    const dismissed = makeMedia({ id: 1, mediaType: "movie" });
    expect(filterDismissedByKeySet([dismissed], new Set(["movie:1"]))).toEqual([]);
  });

  it("does not confuse a dismissed series with a movie sharing the same numeric id", () => {
    const movie = makeMedia({ id: 1, mediaType: "movie" });
    expect(filterDismissedByKeySet([movie], new Set(["series:1"]))).toEqual([movie]);
  });

  it("is a no-op for an empty dismissed set", () => {
    const item = makeMedia({ id: 1, mediaType: "movie" });
    expect(filterDismissedByKeySet([item], new Set())).toEqual([item]);
  });

  it("returns [] immediately for an empty input", () => {
    expect(filterDismissedByKeySet([], new Set(["movie:1"]))).toEqual([]);
  });
});
