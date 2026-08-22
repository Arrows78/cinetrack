import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import type { LibraryFilterState, SavedFilter } from "@/types/media";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

const libraryFilters: LibraryFilterState = {
  typeFilter: "all",
  statusFilter: "paused",
  favouritesOnly: false,
  listFilter: "all",
  sort: "recent",
  search: "",
};

const savedFilter = (overrides: Partial<SavedFilter<LibraryFilterState>> = {}): SavedFilter<LibraryFilterState> => ({
  id: "saved-1",
  profileId: DEFAULT_PROFILE_ID,
  page: "library",
  name: "Paused shows",
  filters: libraryFilters,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

// Name/page validation, JSON-shape checks and active-profile resolution all
// live in Rust and are exercised there (see
// src-tauri/src/commands/saved_filters.rs's own tests) — this only verifies
// the repository wraps invoke() with the right command name/args.
describe("savedFilterRepository", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("list() invokes list_saved_filters with the page", async () => {
    invokeMock.mockResolvedValueOnce([savedFilter()]);
    const { savedFilterRepository } = await import("../saved-filter-repository");

    await expect(savedFilterRepository.list("library")).resolves.toEqual([savedFilter()]);
    expect(invokeMock).toHaveBeenCalledWith("list_saved_filters", { page: "library" });
  });

  it("create() invokes create_saved_filter with page/name/filters", async () => {
    invokeMock.mockResolvedValueOnce(savedFilter());
    const { savedFilterRepository } = await import("../saved-filter-repository");

    await savedFilterRepository.create("library", "Paused shows", libraryFilters);
    expect(invokeMock).toHaveBeenCalledWith("create_saved_filter", {
      page: "library",
      name: "Paused shows",
      filters: libraryFilters,
    });
  });

  it("remove() invokes remove_saved_filter with the savedFilterId", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { savedFilterRepository } = await import("../saved-filter-repository");

    await savedFilterRepository.remove("saved-1");
    expect(invokeMock).toHaveBeenCalledWith("remove_saved_filter", { savedFilterId: "saved-1" });
  });
});
