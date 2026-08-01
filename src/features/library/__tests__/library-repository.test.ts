import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeMedia } from "@/shared/test-utils";
import type { LibraryItem } from "@/types/media";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

const libraryItem = (overrides: Partial<LibraryItem> = {}): LibraryItem => ({
  id: "test-id",
  profileId: "default",
  mediaId: 7,
  mediaType: "movie",
  title: "Test Movie",
  posterPath: null,
  backdropPath: null,
  year: 2024,
  rating: 7.5,
  genres: ["Drama"],
  status: "planned",
  favourite: false,
  userRating: null,
  notes: null,
  tags: [],
  startedAt: null,
  completedAt: null,
  rewatchCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

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

  it("upsert() invokes upsert_library_item with the media and patch, defaulting patch to {}", async () => {
    invokeMock.mockResolvedValueOnce(libraryItem());
    const { libraryRepository } = await import("../library-repository");
    const media = makeMedia({ id: 7 });

    await libraryRepository.upsert(media);
    expect(invokeMock).toHaveBeenCalledWith("upsert_library_item", { media, patch: {} });

    await libraryRepository.upsert(media, { status: "completed" });
    expect(invokeMock).toHaveBeenCalledWith("upsert_library_item", { media, patch: { status: "completed" } });
  });

  it("remove() invokes remove_library_item with mediaId/mediaType", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { libraryRepository } = await import("../library-repository");

    await libraryRepository.remove(7, "movie");
    expect(invokeMock).toHaveBeenCalledWith("remove_library_item", { mediaId: 7, mediaType: "movie" });
  });
});
