import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import type { DismissedRecommendation } from "@/types/media";

const listDismissedMock = vi.fn(async () => [] as DismissedRecommendation[]);
const dismissMock = vi.fn(async () => undefined);
const undismissMock = vi.fn(async () => undefined);

vi.mock("@/features/recommendations/recommendations-repository", () => ({
  recommendationsRepository: {
    listDismissed: listDismissedMock,
    dismiss: dismissMock,
    undismiss: undismissMock,
  },
}));

vi.mock("@/features/preferences/use-preferences", () => ({
  useActiveProfileId: () => "default",
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function makeDismissed(overrides: Partial<DismissedRecommendation> = {}): DismissedRecommendation {
  return {
    id: "dr-1",
    profileId: "default",
    mediaId: 7,
    mediaType: "movie",
    title: "Dune",
    posterPath: null,
    dismissedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  listDismissedMock.mockClear();
  dismissMock.mockClear();
  undismissMock.mockClear();
  listDismissedMock.mockResolvedValue([]);
});

describe("useDismissedRecommendations", () => {
  it("loads the dismissed list", async () => {
    listDismissedMock.mockResolvedValue([makeDismissed()]);
    const { useDismissedRecommendations } = await import("../use-recommendations");

    const { result } = renderHook(() => useDismissedRecommendations(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
  });

  it("dismiss() delegates to the repository and invalidates the list", async () => {
    const { useDismissedRecommendations } = await import("../use-recommendations");
    const { result } = renderHook(() => useDismissedRecommendations(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.dismiss({ id: 7, mediaType: "movie", title: "Dune" });
    });

    expect(dismissMock).toHaveBeenCalledWith({ id: 7, mediaType: "movie", title: "Dune" });
  });

  it("undismiss() delegates to the repository", async () => {
    const { useDismissedRecommendations } = await import("../use-recommendations");
    const { result } = renderHook(() => useDismissedRecommendations(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.undismiss({ mediaId: 7, mediaType: "movie" });
    });

    expect(undismissMock).toHaveBeenCalledWith(7, "movie");
  });
});

describe("useDismissedRecommendationKeys", () => {
  it("builds a type:id key set from the dismissed list", async () => {
    listDismissedMock.mockResolvedValue([
      makeDismissed({ mediaId: 7, mediaType: "movie" }),
      makeDismissed({ id: "dr-2", mediaId: 9, mediaType: "series" }),
    ]);
    const { useDismissedRecommendationKeys } = await import("../use-recommendations");

    const { result } = renderHook(() => useDismissedRecommendationKeys(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.has("movie:7")).toBe(true);
    expect(result.current.has("series:9")).toBe(true);
  });
});
