import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBecauseYouLiked } from "../use-because-you-liked";
import { makeLibraryItem, makeMedia } from "@/shared/test-utils";
import type { LibraryItem, MediaSummary } from "@/types/media";

const libraryDataMock = vi.fn<() => LibraryItem[] | undefined>();
const recommendationsMock = vi.fn<() => { data: { results: MediaSummary[] } | undefined; isLoading: boolean }>();

vi.mock("@/features/library/use-library", () => ({
  useLibrary: () => ({ data: libraryDataMock() }),
}));
vi.mock("@/features/media/use-discovery", () => ({
  useRecommendations: () => recommendationsMock(),
}));

describe("useBecauseYouLiked", () => {
  it("has no seed title, empty items, and is not loading when the library is empty", () => {
    libraryDataMock.mockReturnValue([]);
    recommendationsMock.mockReturnValue({ data: undefined, isLoading: true });

    const { result } = renderHook(() => useBecauseYouLiked());

    expect(result.current.seedTitle).toBeNull();
    expect(result.current.items).toEqual([]);
    // isLoading is gated behind Boolean(seed) — a slow recommendations query
    // for a not-yet-resolved seed must not report a loading rail.
    expect(result.current.isLoading).toBe(false);
  });

  it("resolves a seed title from the strongest signal in the library", () => {
    const completed = makeLibraryItem({ id: "completed", mediaId: 1, status: "completed", title: "Fight Club" });
    libraryDataMock.mockReturnValue([completed]);
    recommendationsMock.mockReturnValue({ data: undefined, isLoading: false });

    const { result } = renderHook(() => useBecauseYouLiked());

    expect(result.current.seedTitle).toBe("Fight Club");
  });

  it("filters out items already in the library from the recommendations results", () => {
    const seed = makeLibraryItem({ id: "seed", mediaId: 1, status: "completed", title: "Fight Club" });
    const owned = makeLibraryItem({ id: "owned", mediaId: 2, mediaType: "movie" });
    libraryDataMock.mockReturnValue([seed, owned]);
    recommendationsMock.mockReturnValue({
      data: {
        results: [
          makeMedia({ id: 2, mediaType: "movie", title: "Already Owned" }),
          makeMedia({ id: 3, mediaType: "movie", title: "Arrival" }),
        ],
      },
      isLoading: false,
    });

    const { result } = renderHook(() => useBecauseYouLiked());

    expect(result.current.items.map((item) => item.id)).toEqual([3]);
  });

  it("is loading only once a seed is resolved AND the recommendations query is loading", () => {
    const seed = makeLibraryItem({ id: "seed", mediaId: 1, status: "completed", title: "Fight Club" });
    libraryDataMock.mockReturnValue([seed]);
    recommendationsMock.mockReturnValue({ data: undefined, isLoading: true });

    const { result } = renderHook(() => useBecauseYouLiked());

    expect(result.current.seedTitle).not.toBeNull();
    expect(result.current.isLoading).toBe(true);
  });
});
