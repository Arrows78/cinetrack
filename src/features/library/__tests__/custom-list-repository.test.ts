import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import { makeMedia } from "@/shared/test-utils";
import type { CustomList, CustomListItem } from "@/types/media";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

const list = (overrides: Partial<CustomList> = {}): CustomList => ({
  id: "list-id",
  profileId: DEFAULT_PROFILE_ID,
  name: "Ma liste",
  description: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const item = (overrides: Partial<CustomListItem> = {}): CustomListItem => ({
  id: "item-id",
  listId: "list-id",
  mediaId: 1,
  mediaType: "movie",
  title: "Premier",
  posterPath: null,
  position: 0,
  addedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

// The name validation, position assignment/dedup and active-profile
// resolution now live in Rust and are exercised there (see
// src-tauri/src/commands/custom_lists.rs's own tests) — this only verifies
// the repository wraps invoke() with the right command name/args.
describe("customListRepository", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("list() invokes list_custom_lists", async () => {
    invokeMock.mockResolvedValueOnce([list()]);
    const { customListRepository } = await import("../custom-list-repository");

    await expect(customListRepository.list()).resolves.toEqual([list()]);
    expect(invokeMock).toHaveBeenCalledWith("list_custom_lists", undefined);
  });

  it("create() invokes create_custom_list with name/description, defaulting description to null", async () => {
    invokeMock.mockResolvedValueOnce(list());
    const { customListRepository } = await import("../custom-list-repository");

    await customListRepository.create("Ma liste");
    expect(invokeMock).toHaveBeenCalledWith("create_custom_list", { name: "Ma liste", description: null });
  });

  it("remove() invokes remove_custom_list with the listId", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { customListRepository } = await import("../custom-list-repository");

    await customListRepository.remove("list-id");
    expect(invokeMock).toHaveBeenCalledWith("remove_custom_list", { listId: "list-id" });
  });

  it("items() invokes list_custom_list_items with the listId", async () => {
    invokeMock.mockResolvedValueOnce([item()]);
    const { customListRepository } = await import("../custom-list-repository");

    await expect(customListRepository.items("list-id")).resolves.toEqual([item()]);
    expect(invokeMock).toHaveBeenCalledWith("list_custom_list_items", { listId: "list-id" });
  });

  it("add() invokes add_custom_list_item with the listId and media", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { customListRepository } = await import("../custom-list-repository");
    const media = makeMedia({ id: 1, title: "Premier" });

    await customListRepository.add("list-id", media);
    expect(invokeMock).toHaveBeenCalledWith("add_custom_list_item", { listId: "list-id", media });
  });

  it("removeItem() invokes remove_custom_list_item with listId/mediaId/mediaType", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { customListRepository } = await import("../custom-list-repository");

    await customListRepository.removeItem("list-id", 1, "movie");
    expect(invokeMock).toHaveBeenCalledWith("remove_custom_list_item", {
      listId: "list-id",
      mediaId: 1,
      mediaType: "movie",
    });
  });
});
