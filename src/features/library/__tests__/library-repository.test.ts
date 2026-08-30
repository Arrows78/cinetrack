import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeLibraryItem, makeMedia } from "@/shared/test-utils";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

const libraryItem = makeLibraryItem;

// The status/startedAt/completedAt business rules and the upsert
// transaction now live in Rust and are exercised there (see
// src-tauri/src/commands/library.rs's own tests) — this only verifies the
// repository wraps invoke() with the right command name/args.
describe("libraryRepository", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("list() invokes list_library and returns its result", async () => {
    const items = [libraryItem()];
    invokeMock.mockResolvedValueOnce(items);
    const { libraryRepository } = await import("../library-repository");

    await expect(libraryRepository.list()).resolves.toEqual(items);
    expect(invokeMock).toHaveBeenCalledWith("list_library", undefined);
  });

  it("get() invokes get_library_item with mediaId/mediaType", async () => {
    invokeMock.mockResolvedValueOnce(libraryItem());
    const { libraryRepository } = await import("../library-repository");

    await libraryRepository.get(7, "movie");
    expect(invokeMock).toHaveBeenCalledWith("get_library_item", { mediaId: 7, mediaType: "movie" });
  });

  it("save() invokes save_library_item with the media and patch, defaulting patch to {}", async () => {
    invokeMock.mockResolvedValueOnce(libraryItem());
    const { libraryRepository } = await import("../library-repository");
    const media = makeMedia({ id: 7 });

    await libraryRepository.save(media);
    expect(invokeMock).toHaveBeenCalledWith("save_library_item", { media, patch: {} });

    await libraryRepository.save(media, { status: "completed" });
    expect(invokeMock).toHaveBeenCalledWith("save_library_item", { media, patch: { status: "completed" } });
  });

  it("remove() invokes remove_library_item with mediaId/mediaType", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { libraryRepository } = await import("../library-repository");

    await libraryRepository.remove(7, "movie");
    expect(invokeMock).toHaveBeenCalledWith("remove_library_item", { mediaId: 7, mediaType: "movie" });
  });

  it("listMediaKeys() invokes list_library_media_keys and returns its result", async () => {
    const keys = [{ mediaId: 7, mediaType: "movie" as const }];
    invokeMock.mockResolvedValueOnce(keys);
    const { libraryRepository } = await import("../library-repository");

    await expect(libraryRepository.listMediaKeys()).resolves.toEqual(keys);
    expect(invokeMock).toHaveBeenCalledWith("list_library_media_keys", undefined);
  });

  it("getItemsByKeys() invokes get_library_items_by_keys with the keys array", async () => {
    const items = [libraryItem()];
    invokeMock.mockResolvedValueOnce(items);
    const { libraryRepository } = await import("../library-repository");
    const keys = [{ mediaId: 7, mediaType: "movie" as const }];

    await expect(libraryRepository.getItemsByKeys(keys)).resolves.toEqual(items);
    expect(invokeMock).toHaveBeenCalledWith("get_library_items_by_keys", { keys });
  });

  it("statusCounts() invokes get_library_status_counts and returns its result", async () => {
    const counts = { planned: 1, watching: 2, paused: 0, completed: 3, dropped: 0 };
    invokeMock.mockResolvedValueOnce(counts);
    const { libraryRepository } = await import("../library-repository");

    await expect(libraryRepository.statusCounts()).resolves.toEqual(counts);
    expect(invokeMock).toHaveBeenCalledWith("get_library_status_counts", undefined);
  });

  it("plannedCandidates() invokes list_planned_library_candidates with mediaType/limit", async () => {
    const items = [libraryItem()];
    invokeMock.mockResolvedValueOnce(items);
    const { libraryRepository } = await import("../library-repository");

    await expect(libraryRepository.plannedCandidates("movie", 20)).resolves.toEqual(items);
    expect(invokeMock).toHaveBeenCalledWith("list_planned_library_candidates", {
      mediaType: "movie",
      limit: 20,
    });
  });

  it("completedCandidates() invokes list_completed_library_candidates with an optional mediaType and limit", async () => {
    const items = [libraryItem()];
    invokeMock.mockResolvedValueOnce(items);
    const { libraryRepository } = await import("../library-repository");

    await expect(libraryRepository.completedCandidates(undefined, 20)).resolves.toEqual(items);
    expect(invokeMock).toHaveBeenCalledWith("list_completed_library_candidates", {
      mediaType: undefined,
      limit: 20,
    });
  });

  it("bestRecommendationSeed() invokes get_best_recommendation_seed and returns its result", async () => {
    const item = libraryItem();
    invokeMock.mockResolvedValueOnce(item);
    const { libraryRepository } = await import("../library-repository");

    await expect(libraryRepository.bestRecommendationSeed()).resolves.toEqual(item);
    expect(invokeMock).toHaveBeenCalledWith("get_best_recommendation_seed", undefined);
  });

  it("idsMatchingFilters() invokes list_library_ids_matching_filters with the filters object", async () => {
    const keys = [{ mediaId: 7, mediaType: "movie" as const }];
    invokeMock.mockResolvedValueOnce(keys);
    const { libraryRepository } = await import("../library-repository");
    const filters = { status: "completed" as const, minRating: 5 };

    await expect(libraryRepository.idsMatchingFilters(filters)).resolves.toEqual(keys);
    expect(invokeMock).toHaveBeenCalledWith("list_library_ids_matching_filters", { filters });
  });
});
