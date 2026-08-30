import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import { queryKeys } from "@/shared/constants/query-keys";
import type { LibraryPatch } from "@/features/library/library-repository";
import type { LibraryItem, MediaSummary } from "@/types/media";

const saveMock = vi.fn<(media: MediaSummary, patch: LibraryPatch) => Promise<LibraryItem>>(
  async () => ({}) as LibraryItem
);
const removeMock = vi.fn<(mediaId: number, mediaType: string) => Promise<undefined>>(async () => undefined);

vi.mock("@/features/library/library-repository", () => ({
  libraryRepository: {
    save: (media: MediaSummary, patch: LibraryPatch) => saveMock(media, patch),
    remove: (mediaId: number, mediaType: string) => removeMock(mediaId, mediaType),
  },
}));

function makeItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: "l1",
    profileId: DEFAULT_PROFILE_ID,
    mediaId: 7,
    mediaType: "movie",
    title: "Dune",
    posterPath: "/dune.jpg",
    backdropPath: "/dune-bg.jpg",
    year: 2021,
    rating: 8,
    genres: ["Science Fiction"],
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
  };
}

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    Wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  };
}

describe("useLibraryHealthActions", () => {
  it("remove calls libraryRepository.remove once per item and invalidates the shared library keys", async () => {
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const items = [makeItem({ mediaId: 1 }), makeItem({ mediaId: 2, mediaType: "series" })];

    const { useLibraryHealthActions } = await import("../use-library-health-actions");
    const { result } = renderHook(() => useLibraryHealthActions(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.remove(items);
    });

    expect(removeMock).toHaveBeenCalledWith(1, "movie");
    expect(removeMock).toHaveBeenCalledWith(2, "series");
    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(invalidatedKeys).toContainEqual(queryKeys.local.library(DEFAULT_PROFILE_ID));
  });

  it("restore recreates each item via save(), preserving its user fields", async () => {
    const item = makeItem({ favourite: true, userRating: 9, notes: "great", tags: ["comfort"], rewatchCount: 2 });

    const { useLibraryHealthActions } = await import("../use-library-health-actions");
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useLibraryHealthActions(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.restore([item]);
    });

    expect(saveMock).toHaveBeenCalledWith(
      {
        id: item.mediaId,
        mediaType: item.mediaType,
        title: item.title,
        overview: "",
        posterPath: item.posterPath,
        backdropPath: item.backdropPath,
        year: item.year,
        rating: item.rating,
        genres: item.genres,
        cast: [],
      },
      {
        status: item.status,
        favourite: true,
        userRating: 9,
        notes: "great",
        tags: ["comfort"],
        rewatchCount: 2,
      }
    );
  });

  it("setStatus saves the given status for every selected item", async () => {
    const items = [makeItem({ mediaId: 1 }), makeItem({ mediaId: 2 })];

    const { useLibraryHealthActions } = await import("../use-library-health-actions");
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useLibraryHealthActions(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.setStatus(items, "dropped");
    });

    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), { status: "dropped" });
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), { status: "dropped" });
  });

  it("restoreStatus replays each item's own previous status, not a shared one", async () => {
    const items = [makeItem({ mediaId: 1, status: "planned" }), makeItem({ mediaId: 2, status: "watching" })];

    const { useLibraryHealthActions } = await import("../use-library-health-actions");
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useLibraryHealthActions(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.restoreStatus(items);
    });

    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), { status: "planned" });
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), { status: "watching" });
  });

  it("isApplying is false once every bulk mutation has settled", async () => {
    const { useLibraryHealthActions } = await import("../use-library-health-actions");
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useLibraryHealthActions(), { wrapper: Wrapper });

    expect(result.current.isApplying).toBe(false);

    await act(async () => {
      await result.current.setStatus([makeItem()], "dropped");
    });

    await waitFor(() => expect(result.current.isApplying).toBe(false));
  });
});
