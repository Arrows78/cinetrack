import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import type { LibraryFilterState, SavedFilter } from "@/types/media";

const savedFilter: SavedFilter<LibraryFilterState> = {
  id: "saved-1",
  profileId: DEFAULT_PROFILE_ID,
  page: "library",
  name: "Paused shows",
  filters: {
    typeFilter: "all",
    statusFilter: "paused",
    favouritesOnly: false,
    listFilter: "all",
    sort: "recent",
    search: "",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const listMock = vi.fn<(page: string) => Promise<SavedFilter[]>>(async () => [savedFilter]);
const createMock = vi.fn<(page: string, name: string, filters: LibraryFilterState) => Promise<SavedFilter>>(
  async () => savedFilter
);
const removeMock = vi.fn<(id: string) => Promise<void>>(async () => undefined);

// useActiveProfileId() (see use-preferences.ts) resolves to this via
// preferencesRepository.getPreferences() — fixed to "default" so every
// query-key assertion below is deterministic regardless of when it resolves.
const getPreferencesMock = vi.fn(async () => ({ activeProfileId: DEFAULT_PROFILE_ID }) as never);

vi.mock("@/features/saved-filters/saved-filter-repository", () => ({
  savedFilterRepository: {
    list: (page: string) => listMock(page),
    create: (page: string, name: string, filters: LibraryFilterState) => createMock(page, name, filters),
    remove: (id: string) => removeMock(id),
  },
}));

vi.mock("@/features/preferences/preferences-repository", () => ({
  preferencesRepository: { getPreferences: getPreferencesMock },
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  listMock.mockClear().mockResolvedValue([savedFilter]);
  createMock.mockClear().mockResolvedValue(savedFilter);
  removeMock.mockClear().mockResolvedValue(undefined);
  getPreferencesMock.mockClear();
});

describe("useSavedFilters", () => {
  it("lists the saved filters for the given page", async () => {
    const { useSavedFilters } = await import("../use-saved-filters");
    const { result } = renderHook(() => useSavedFilters<LibraryFilterState>("library"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(listMock).toHaveBeenCalledWith("library");
    expect(result.current.data).toEqual([savedFilter]);
  });

  it("isSaving is true while create is pending, even though remove is idle", async () => {
    let resolveCreate!: (value: SavedFilter) => void;
    createMock.mockImplementation(
      () =>
        new Promise<SavedFilter>((resolve) => {
          resolveCreate = resolve;
        })
    );

    const { useSavedFilters } = await import("../use-saved-filters");
    const { result } = renderHook(() => useSavedFilters<LibraryFilterState>("library"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isSaving).toBe(false);

    let createPromise!: Promise<unknown>;
    act(() => {
      createPromise = result.current.create({ name: "Paused shows", filters: savedFilter.filters });
    });

    await waitFor(() => expect(result.current.isSaving).toBe(true));

    resolveCreate(savedFilter);
    await act(async () => {
      await createPromise;
    });

    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(createMock).toHaveBeenCalledWith("library", "Paused shows", savedFilter.filters);
  });

  it("isSaving is true while remove is pending, even though create is idle", async () => {
    let resolveRemove!: () => void;
    removeMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRemove = resolve;
        })
    );

    const { useSavedFilters } = await import("../use-saved-filters");
    const { result } = renderHook(() => useSavedFilters<LibraryFilterState>("library"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let removePromise!: Promise<unknown>;
    act(() => {
      removePromise = result.current.remove("saved-1");
    });

    await waitFor(() => expect(result.current.isSaving).toBe(true));

    resolveRemove();
    await act(async () => {
      await removePromise;
    });

    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(removeMock).toHaveBeenCalledWith("saved-1");
  });
});
