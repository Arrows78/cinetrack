import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import type { CustomList, CustomListItem, MediaSummary } from "@/types/media";

const list: CustomList = { id: "list-1", name: "Weekend", description: null } as CustomList;
const item: CustomListItem = { mediaId: 7, mediaType: "movie" } as CustomListItem;

const listMock = vi.fn(async (): Promise<CustomList[]> => [list]);
const createMock = vi.fn<(name: string, description?: string) => Promise<CustomList>>(async () => list);
const removeMock = vi.fn<(id: string) => Promise<void>>(async () => undefined);
const itemsMock = vi.fn<(listId: string) => Promise<CustomListItem[]>>(async () => [item]);
const removeItemMock = vi.fn<(listId: string, mediaId: number, mediaType: string) => Promise<void>>(
  async () => undefined
);
const addMock = vi.fn<(listId: string, mediaArg: MediaSummary) => Promise<void>>(async () => undefined);

// useActiveProfileId() (see use-preferences.ts) resolves to this via
// preferencesRepository.getPreferences() — fixed to "default" so every key
// assertion below is deterministic regardless of when it resolves.
const getPreferencesMock = vi.fn(async () => ({ activeProfileId: DEFAULT_PROFILE_ID }) as never);

vi.mock("@/features/custom-lists/custom-list-repository", () => ({
  customListRepository: {
    list: () => listMock(),
    create: (name: string, description?: string) => createMock(name, description),
    remove: (id: string) => removeMock(id),
    items: (listId: string) => itemsMock(listId),
    removeItem: (listId: string, mediaId: number, mediaType: string) => removeItemMock(listId, mediaId, mediaType),
    add: (listId: string, mediaArg: MediaSummary) => addMock(listId, mediaArg),
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
  listMock.mockClear().mockResolvedValue([list]);
  createMock.mockClear().mockResolvedValue(list);
  removeMock.mockClear().mockResolvedValue(undefined);
  itemsMock.mockClear().mockResolvedValue([item]);
  removeItemMock.mockClear().mockResolvedValue(undefined);
  addMock.mockClear().mockResolvedValue(undefined);
  getPreferencesMock.mockClear();
});

describe("useCustomListItems", () => {
  it("does not fire the items query for an empty listId", async () => {
    const { useCustomListItems } = await import("../use-custom-lists");
    const { result } = renderHook(() => useCustomListItems(""), { wrapper: createWrapper() });

    // Give any accidental fetch a chance to start before asserting it didn't.
    await act(async () => {
      await Promise.resolve();
    });

    expect(itemsMock).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it("fires the items query once a real listId is provided", async () => {
    const { useCustomListItems } = await import("../use-custom-lists");
    const { result } = renderHook(() => useCustomListItems("list-1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(itemsMock).toHaveBeenCalledWith("list-1");
    expect(result.current.data).toEqual([item]);
  });

  it("isSaving reflects the remove mutation's pending state", async () => {
    let resolveRemove!: () => void;
    removeItemMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRemove = resolve;
        })
    );

    const { useCustomListItems } = await import("../use-custom-lists");
    const { result } = renderHook(() => useCustomListItems("list-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isSaving).toBe(false);

    let removePromise!: Promise<unknown>;
    act(() => {
      removePromise = result.current.remove({ mediaId: 7, mediaType: "movie" });
    });

    await waitFor(() => expect(result.current.isSaving).toBe(true));

    resolveRemove();
    await act(async () => {
      await removePromise;
    });

    await waitFor(() => expect(result.current.isSaving).toBe(false));
  });
});

describe("useCustomLists", () => {
  it("isSaving is true while create is pending, even though remove is idle", async () => {
    let resolveCreate!: (value: CustomList) => void;
    createMock.mockImplementation(
      () =>
        new Promise<CustomList>((resolve) => {
          resolveCreate = resolve;
        })
    );

    const { useCustomLists } = await import("../use-custom-lists");
    const { result } = renderHook(() => useCustomLists(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isSaving).toBe(false);

    let createPromise!: Promise<unknown>;
    act(() => {
      createPromise = result.current.create({ name: "New list" });
    });

    await waitFor(() => expect(result.current.isSaving).toBe(true));

    resolveCreate(list);
    await act(async () => {
      await createPromise;
    });

    await waitFor(() => expect(result.current.isSaving).toBe(false));
  });

  it("isSaving is true while remove is pending, even though create is idle", async () => {
    let resolveRemove!: () => void;
    removeMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRemove = resolve;
        })
    );

    const { useCustomLists } = await import("../use-custom-lists");
    const { result } = renderHook(() => useCustomLists(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isSaving).toBe(false);

    let removePromise!: Promise<unknown>;
    act(() => {
      removePromise = result.current.remove("list-1");
    });

    await waitFor(() => expect(result.current.isSaving).toBe(true));

    resolveRemove();
    await act(async () => {
      await removePromise;
    });

    await waitFor(() => expect(result.current.isSaving).toBe(false));
  });
});
