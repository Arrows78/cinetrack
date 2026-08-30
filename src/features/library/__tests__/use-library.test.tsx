import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import type { LibraryListParams, LibraryPage, LibraryPatch } from "@/features/library/library-repository";
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

const listMock = vi.fn<(mediaType?: MediaSummary["mediaType"]) => Promise<LibraryItem[]>>(async () => items);
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
const hasMock = vi.fn<(mediaId: number, mediaType: string) => Promise<boolean>>(async () => false);
const listPageMock = vi.fn<(params: LibraryListParams) => Promise<LibraryPage>>();

vi.mock("@/features/library/library-repository", () => ({
  libraryRepository: {
    list: listMock,
    listPage: (params: LibraryListParams) => listPageMock(params),
    get: getMock,
    save: saveMock,
    remove: removeMock,
    removeIfPlanned: (mediaId: number, mediaType: string) => removeIfPlannedMock(mediaId, mediaType),
    has: (mediaId: number, mediaType: string) => hasMock(mediaId, mediaType),
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

  it("scopes a locked hub read to one media type", async () => {
    items = [{ mediaId: 7, mediaType: "movie" } as LibraryItem];
    const { useLibrary } = await import("../use-library");
    const { result } = renderHook(() => useLibrary({ mediaType: "movie" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(listMock).toHaveBeenCalledWith("movie");
    expect(result.current.data).toHaveLength(1);
  });
});

describe("useIsInLibrary", () => {
  beforeEach(() => {
    hasMock.mockClear().mockResolvedValue(false);
  });

  it("queries presence by default when no enabled option is given", async () => {
    hasMock.mockResolvedValueOnce(true);
    const { useIsInLibrary } = await import("../use-library");
    const { result } = renderHook(() => useIsInLibrary(7, "movie"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(hasMock).toHaveBeenCalledWith(7, "movie");
    expect(result.current.data).toBe(true);
  });

  it("stays disabled and never queries when enabled is explicitly false", async () => {
    const { useIsInLibrary } = await import("../use-library");
    const { result } = renderHook(() => useIsInLibrary(7, "movie", { enabled: false }), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(hasMock).not.toHaveBeenCalled();
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

describe("useLibraryPage", () => {
  const baseFilters = {
    status: "all" as const,
    favouritesOnly: false,
    search: "",
    sort: "recent" as const,
  };
  const page = (mediaId: number, nextCursor: string | null): LibraryPage => ({
    items: [{ mediaId, mediaType: "movie" } as LibraryItem],
    nextCursor,
  });

  beforeEach(() => {
    listPageMock.mockReset();
  });

  it("passes an omitted status/mediaType through as undefined, not the literal 'all'", async () => {
    listPageMock.mockResolvedValueOnce(page(1, null));
    const { useLibraryPage } = await import("../use-library");
    const { result } = renderHook(() => useLibraryPage(baseFilters), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(listPageMock).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: undefined, status: undefined, cursor: undefined })
    );
  });

  it("fetches the next page using the previous page's cursor", async () => {
    listPageMock.mockResolvedValueOnce(page(1, "cursor-1"));
    const { useLibraryPage } = await import("../use-library");
    const { result } = renderHook(() => useLibraryPage(baseFilters), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNextPage).toBe(true);

    listPageMock.mockResolvedValueOnce(page(2, null));
    await result.current.fetchNextPage();
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));

    expect(listPageMock).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "cursor-1" }));
    expect(result.current.hasNextPage).toBe(false);
  });

  it("stays disabled and never queries when enabled is explicitly false", async () => {
    const { useLibraryPage } = await import("../use-library");
    const { result } = renderHook(() => useLibraryPage(baseFilters, { enabled: false }), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(listPageMock).not.toHaveBeenCalled();
  });
});
