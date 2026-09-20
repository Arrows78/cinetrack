import { beforeEach, describe, expect, it, vi } from "vitest";
import { partialExport } from "../partial-export";
import type { CustomListItem, EpisodeProgress } from "@/types/media";

// jsdom doesn't implement these; partialExport calls them directly — same
// stubbing pattern as backup-tools.test.tsx's own export test.
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn();
});

function episode(overrides: Partial<EpisodeProgress> = {}): EpisodeProgress {
  return {
    id: "ep-1",
    profileId: "default",
    seriesId: 42,
    episodeId: 1001,
    seasonNumber: 1,
    episodeNumber: 1,
    watched: true,
    watchedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    rating: null,
    ...overrides,
  };
}

function listItem(overrides: Partial<CustomListItem> = {}): CustomListItem {
  return {
    id: "item-1",
    listId: "list-1",
    mediaId: 7,
    mediaType: "movie",
    title: "A Movie",
    posterPath: null,
    position: 0,
    addedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("partialExport.exportSeries", () => {
  it("builds a series-export payload containing only that series' episode progress, without profileId", () => {
    const blobSpy = vi.spyOn(global, "Blob");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    partialExport.exportSeries({ id: 42, title: "My Show", posterPath: "/poster.jpg" }, [
      episode({ seriesId: 42, episodeId: 1 }),
      episode({ seriesId: 42, episodeId: 2 }),
      episode({ seriesId: 99, episodeId: 3 }),
    ]);

    const parts = blobSpy.mock.calls[0]?.[0] as string[] | undefined;
    const payload = JSON.parse(parts![0]!) as {
      kind: string;
      series: { id: number };
      episodeProgress: Array<{ episodeId: number; profileId?: string }>;
    };

    expect(payload.kind).toBe("series-export");
    expect(payload.series).toEqual({ id: 42, title: "My Show", posterPath: "/poster.jpg" });
    expect(payload.episodeProgress).toHaveLength(2);
    expect(payload.episodeProgress.map((entry) => entry.episodeId).sort()).toEqual([1, 2]);
    expect(payload.episodeProgress.every((entry) => !("profileId" in entry))).toBe(true);

    blobSpy.mockRestore();
  });

  it("downloads a file named after the series id", () => {
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    partialExport.exportSeries({ id: 42, title: "My Show", posterPath: null }, []);

    const anchor = anchorClickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toMatch(/^cinetrack-series-42-.+\.json$/);
  });
});

describe("partialExport.exportList", () => {
  it("builds a list-export payload containing only that list's items", () => {
    const blobSpy = vi.spyOn(global, "Blob");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    partialExport.exportList({ id: "list-1", name: "Weekend picks", description: "Cozy movies" }, [
      listItem({ listId: "list-1", mediaId: 1 }),
      listItem({ listId: "list-1", mediaId: 2 }),
      listItem({ listId: "other-list", mediaId: 3 }),
    ]);

    const parts = blobSpy.mock.calls[0]?.[0] as string[] | undefined;
    const payload = JSON.parse(parts![0]!) as {
      kind: string;
      list: { name: string; description: string | null };
      items: Array<{ mediaId: number }>;
    };

    expect(payload.kind).toBe("list-export");
    expect(payload.list).toEqual({ name: "Weekend picks", description: "Cozy movies" });
    expect(payload.items.map((item) => item.mediaId).sort()).toEqual([1, 2]);

    blobSpy.mockRestore();
  });

  it("downloads a file named after the list", () => {
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    partialExport.exportList({ id: "list-1", name: "Weekend Picks!", description: null }, []);

    const anchor = anchorClickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toMatch(/^cinetrack-list-weekend-picks--.+\.json$/);
  });
});
