import { describe, expect, it } from "vitest";
import type { MediaSummary, Series } from "@/types/media";
import { emptyTvTimeImportUndo, hasTvTimeImportUndo, mergeTvTimeImportUndo } from "../tvtime-import-undo";

const movie = { id: 1, mediaType: "movie", title: "Dune" } as MediaSummary;
const series = { id: 2, mediaType: "series", title: "Severance" } as Series;
const created = { id: "lib-1", importedAt: "2026-01-01T00:00:00.000Z" };

describe("TV Time import undo descriptor", () => {
  it("is empty until something was written", () => {
    expect(hasTvTimeImportUndo(emptyTvTimeImportUndo())).toBe(false);
    expect(hasTvTimeImportUndo({ ...emptyTvTimeImportUndo(), movies: [movie] })).toBe(true);
    expect(
      hasTvTimeImportUndo({
        ...emptyTvTimeImportUndo(),
        series: [{ series, episodes: [{ id: 1, seasonNumber: 1, episodeNumber: 1 }] }],
      })
    ).toBe(true);
    expect(hasTvTimeImportUndo({ ...emptyTvTimeImportUndo(), createdLibraryItems: [created] })).toBe(true);
  });

  it("merges a manual resolution into what is already pending, or starts from it", () => {
    const extra = { ...emptyTvTimeImportUndo(), movies: [movie], createdLibraryItems: [created] };
    expect(mergeTvTimeImportUndo(null, extra)).toEqual(extra);

    const merged = mergeTvTimeImportUndo({ ...emptyTvTimeImportUndo(), series: [{ series, episodes: [] }] }, extra);
    expect(merged.series).toHaveLength(1);
    expect(merged.movies).toEqual([movie]);
    expect(merged.createdLibraryItems).toEqual([created]);
  });
});
