import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { useBecauseYouLiked } from "../use-because-you-liked";
import { makeLibraryItem, makeMedia } from "@/shared/test-utils";
import type { LibraryItem, LibraryMediaKey, MediaSummary } from "@/types/media";

const bestSeedMock = vi.fn<() => LibraryItem | null>();
const mediaKeysMock = vi.fn<() => LibraryMediaKey[]>();
const recommendationsMock = vi.fn<() => { data: { results: MediaSummary[] } | undefined; isLoading: boolean }>();

// The seed and the exclude-if-owned membership set both now come from Rust
// (get_best_recommendation_seed_impl, list_media_keys_impl) — these mocks
// stand in for that server-side computation directly, rather than a full
// LibraryItem[] the hook used to derive both from in JS.
vi.mock("@/features/library/library-repository", () => ({
  libraryRepository: {
    bestRecommendationSeed: () => Promise.resolve(bestSeedMock()),
  },
}));
vi.mock("@/features/library/use-library", () => ({
  useLibraryMediaKeys: () => ({ data: mediaKeysMock() }),
}));
vi.mock("@/features/preferences/use-preferences", () => ({
  useActiveProfileId: () => "default",
}));
vi.mock("@/features/media/use-discovery", () => ({
  useRecommendations: () => recommendationsMock(),
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  bestSeedMock.mockReset();
  mediaKeysMock.mockReset();
  recommendationsMock.mockReset();
  bestSeedMock.mockReturnValue(null);
  mediaKeysMock.mockReturnValue([]);
});

describe("useBecauseYouLiked", () => {
  it("has no seed title, empty items, and is not loading when there is no seed", async () => {
    bestSeedMock.mockReturnValue(null);
    recommendationsMock.mockReturnValue({ data: undefined, isLoading: true });

    const { result } = renderHook(() => useBecauseYouLiked(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.seedTitle).toBeNull();
    expect(result.current.items).toEqual([]);
  });

  it("resolves a seed title from the strongest signal in the library", async () => {
    const completed = makeLibraryItem({ id: "completed", mediaId: 1, status: "completed", title: "Fight Club" });
    bestSeedMock.mockReturnValue(completed);
    recommendationsMock.mockReturnValue({ data: undefined, isLoading: false });

    const { result } = renderHook(() => useBecauseYouLiked(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.seedTitle).toBe("Fight Club"));
  });

  it("filters out items already in the library from the recommendations results", async () => {
    const seed = makeLibraryItem({ id: "seed", mediaId: 1, status: "completed", title: "Fight Club" });
    const owned = makeLibraryItem({ id: "owned", mediaId: 2, mediaType: "movie" });
    bestSeedMock.mockReturnValue(seed);
    mediaKeysMock.mockReturnValue([seed, owned].map((item) => ({ mediaId: item.mediaId, mediaType: item.mediaType })));
    recommendationsMock.mockReturnValue({
      data: {
        results: [
          makeMedia({ id: 2, mediaType: "movie", title: "Already Owned" }),
          makeMedia({ id: 3, mediaType: "movie", title: "Arrival" }),
        ],
      },
      isLoading: false,
    });

    const { result } = renderHook(() => useBecauseYouLiked(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual([3]));
  });

  it("is loading only once a seed is resolved AND the recommendations query is loading", async () => {
    const seed = makeLibraryItem({ id: "seed", mediaId: 1, status: "completed", title: "Fight Club" });
    bestSeedMock.mockReturnValue(seed);
    recommendationsMock.mockReturnValue({ data: undefined, isLoading: true });

    const { result } = renderHook(() => useBecauseYouLiked(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.seedTitle).not.toBeNull());
    expect(result.current.isLoading).toBe(true);
  });
});
