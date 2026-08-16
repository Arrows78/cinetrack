import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import type { LibraryPatch } from "@/features/library/library-repository";
import type { LibraryItem, MediaSummary } from "@/types/media";

const media: MediaSummary = {
  id: 7,
  mediaType: "movie",
  title: "Test Movie",
  overview: "",
  posterPath: null,
  backdropPath: null,
  year: 2024,
  rating: null,
  genres: [],
  cast: [],
};

let items: LibraryItem[];

const listMock = vi.fn(async () => items);
const getMock = vi.fn(
  async (mediaId: number, mediaType: string) =>
    items.find((i) => i.mediaId === mediaId && i.mediaType === mediaType) ?? null
);
const saveMock = vi.fn(async (subject: MediaSummary, patch: LibraryPatch) => {
  const saved = { mediaId: subject.id, mediaType: subject.mediaType, ...patch } as LibraryItem;
  const index = items.findIndex((i) => i.mediaId === subject.id && i.mediaType === subject.mediaType);
  items = index >= 0 ? items.map((i, idx) => (idx === index ? saved : i)) : [...items, saved];
  return saved;
});
const removeMock = vi.fn(async (mediaId: number, mediaType: string) => {
  items = items.filter((i) => !(i.mediaId === mediaId && i.mediaType === mediaType));
});
const removeIfPlannedMock = vi.fn<(mediaId: number, mediaType: string) => Promise<boolean>>(async () => true);

vi.mock("@/features/library/library-repository", () => ({
  libraryRepository: {
    list: listMock,
    get: getMock,
    save: saveMock,
    remove: removeMock,
    removeIfPlanned: (mediaId: number, mediaType: string) => removeIfPlannedMock(mediaId, mediaType),
  },
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useLibrary", () => {
  beforeEach(() => {
    items = [];
    listMock.mockClear();
  });

  it("loads the library list", async () => {
    items = [{ mediaId: 7, mediaType: "movie" } as LibraryItem];
    const { useLibrary } = await import("../use-library");
    const { result } = renderHook(() => useLibrary(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(1);
  });
});

describe("useLibraryItem", () => {
  beforeEach(() => {
    items = [];
    listMock.mockClear();
    saveMock.mockClear();
    removeMock.mockClear();
  });

  it("saving updates the item and invalidates the library list", async () => {
    const { useLibraryItem } = await import("../use-library");
    const { useLibrary } = await import("../use-library");
    const wrapper = createWrapper();
    const { result: item } = renderHook(() => useLibraryItem(media), { wrapper });
    const { result: library } = renderHook(() => useLibrary(), { wrapper });

    await waitFor(() => expect(item.current.isLoading).toBe(false));
    expect(item.current.data).toBeNull();

    await act(async () => {
      await item.current.save({ userRating: 5 });
    });

    expect(saveMock).toHaveBeenCalledWith(media, { userRating: 5 });
    await waitFor(() => expect(item.current.data).toEqual({ mediaId: 7, mediaType: "movie", userRating: 5 }));
    await waitFor(() => expect(library.current.data).toHaveLength(1));
  });

  it("removing clears the item and invalidates the library list", async () => {
    items = [{ mediaId: 7, mediaType: "movie" } as LibraryItem];
    const { useLibraryItem, useLibrary } = await import("../use-library");
    const wrapper = createWrapper();
    const { result: item } = renderHook(() => useLibraryItem(media), { wrapper });
    const { result: library } = renderHook(() => useLibrary(), { wrapper });

    await waitFor(() => expect(item.current.data).toEqual({ mediaId: 7, mediaType: "movie" }));
    await waitFor(() => expect(library.current.data).toHaveLength(1));

    await act(async () => {
      await item.current.remove();
    });

    expect(removeMock).toHaveBeenCalledWith(7, "movie");
    await waitFor(() => expect(item.current.data).toBeNull());
    await waitFor(() => expect(library.current.data).toHaveLength(0));
  });
});

describe("useLibraryQuickToggle", () => {
  beforeEach(() => {
    items = [];
    saveMock.mockClear();
    removeIfPlannedMock.mockClear().mockResolvedValue(true);
    removeMock.mockClear();
  });

  it("addPlanned saves with the planned status", async () => {
    const { useLibraryQuickToggle } = await import("../use-library");
    const { result } = renderHook(() => useLibraryQuickToggle(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.addPlanned(media);
    });

    expect(saveMock).toHaveBeenCalledWith(media, { status: "planned" });
  });

  it("removeIfPlanned forwards to the guarded repository method", async () => {
    const { useLibraryQuickToggle } = await import("../use-library");
    const { result } = renderHook(() => useLibraryQuickToggle(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.removeIfPlanned({ mediaId: 7, mediaType: "movie" });
    });

    expect(removeIfPlannedMock).toHaveBeenCalledWith(7, "movie");
  });

  it("forceRemove calls the real, unguarded delete", async () => {
    const { useLibraryQuickToggle } = await import("../use-library");
    const { result } = renderHook(() => useLibraryQuickToggle(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.forceRemove({ mediaId: 7, mediaType: "movie" });
    });

    expect(removeMock).toHaveBeenCalledWith(7, "movie");
  });
});
