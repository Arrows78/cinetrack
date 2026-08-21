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
});
