import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import { DEFAULT_SMART_LIST_RULES } from "@/features/smart-lists/smart-list-evaluation";
import type { SmartList, SmartListRules } from "@/types/media";

const rules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, status: "planned" };

const smartList: SmartList = {
  id: "sl-1",
  profileId: DEFAULT_PROFILE_ID,
  name: "Weeknight picks",
  rules,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const listMock = vi.fn(async (): Promise<SmartList[]> => [smartList]);
const createMock = vi.fn<(name: string, rules: SmartListRules) => Promise<SmartList>>(async () => smartList);
const updateMock = vi.fn<(id: string, name: string, rules: SmartListRules) => Promise<SmartList>>(
  async () => smartList
);
const removeMock = vi.fn<(id: string) => Promise<void>>(async () => undefined);

vi.mock("@/features/smart-lists/smart-list-repository", () => ({
  smartListRepository: {
    list: () => listMock(),
    create: (name: string, r: SmartListRules) => createMock(name, r),
    update: (id: string, name: string, r: SmartListRules) => updateMock(id, name, r),
    remove: (id: string) => removeMock(id),
  },
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  listMock.mockClear().mockResolvedValue([smartList]);
  createMock.mockClear().mockResolvedValue(smartList);
  updateMock.mockClear().mockResolvedValue(smartList);
  removeMock.mockClear().mockResolvedValue(undefined);
});

describe("useSmartLists", () => {
  it("lists smart lists for the active profile", async () => {
    const { useSmartLists } = await import("../use-smart-lists");
    const { result } = renderHook(() => useSmartLists(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([smartList]);
  });

  it("create() calls the repository with the given name/rules", async () => {
    const { useSmartLists } = await import("../use-smart-lists");
    const { result } = renderHook(() => useSmartLists(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.create({ name: "New list", rules });
    });
    expect(createMock).toHaveBeenCalledWith("New list", rules);
  });

  it("update() calls the repository with the given id/name/rules", async () => {
    const { useSmartLists } = await import("../use-smart-lists");
    const { result } = renderHook(() => useSmartLists(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.update({ id: "sl-1", name: "Renamed", rules });
    });
    expect(updateMock).toHaveBeenCalledWith("sl-1", "Renamed", rules);
  });

  it("remove() calls the repository with the given id", async () => {
    const { useSmartLists } = await import("../use-smart-lists");
    const { result } = renderHook(() => useSmartLists(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.remove("sl-1");
    });
    expect(removeMock).toHaveBeenCalledWith("sl-1");
  });

  it("isSaving is true while any of create/update/remove is pending", async () => {
    let resolveCreate!: (value: SmartList) => void;
    createMock.mockImplementation(
      () =>
        new Promise<SmartList>((resolve) => {
          resolveCreate = resolve;
        })
    );

    const { useSmartLists } = await import("../use-smart-lists");
    const { result } = renderHook(() => useSmartLists(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isSaving).toBe(false);
    let createPromise!: Promise<unknown>;
    act(() => {
      createPromise = result.current.create({ name: "New list", rules });
    });

    await waitFor(() => expect(result.current.isSaving).toBe(true));
    resolveCreate(smartList);
    await act(async () => {
      await createPromise;
    });
    await waitFor(() => expect(result.current.isSaving).toBe(false));
  });
});
