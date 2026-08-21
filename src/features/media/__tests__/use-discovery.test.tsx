import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

const getRecommendationsMock = vi.fn(async () => ({ results: [] }) as never);
const getVideosMock = vi.fn(async () => [] as never);
const getWatchAvailabilityMock = vi.fn(async () => ({ providers: [] }) as never);
const searchPeopleMock = vi.fn(async () => ({ results: [] }) as never);
const getPersonMock = vi.fn(async () => ({ id: 1 }) as never);

vi.mock("@/features/media/media-repository", () => ({
  mediaRepository: {
    getRecommendations: getRecommendationsMock,
    getVideos: getVideosMock,
    getWatchAvailability: getWatchAvailabilityMock,
    searchPeople: searchPeopleMock,
    getPerson: getPersonMock,
  },
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  getRecommendationsMock.mockClear();
  getVideosMock.mockClear();
  getWatchAvailabilityMock.mockClear();
  searchPeopleMock.mockClear();
  getPersonMock.mockClear();
});

describe("useRecommendations / useVideos", () => {
  it("is disabled for a non-finite media id, enabled otherwise", async () => {
    const { useRecommendations, useVideos } = await import("../use-discovery");
    const wrapper = createWrapper();

    const { result: disabled } = renderHook(() => useRecommendations("movie", Number.NaN), { wrapper });
    expect(disabled.current.fetchStatus).toBe("idle");

    const { result: videos } = renderHook(() => useVideos("movie", 5), { wrapper });
    await waitFor(() => expect(videos.current.isLoading).toBe(false));
    expect(getVideosMock).toHaveBeenCalledWith("movie", 5);
  });

  it("fetches recommendations for a finite media id", async () => {
    const { useRecommendations } = await import("../use-discovery");
    const { result } = renderHook(() => useRecommendations("series", 9), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getRecommendationsMock).toHaveBeenCalledWith("series", 9);
  });
});

describe("useAvailability", () => {
  it("requires both a finite media id and a region", async () => {
    const { useAvailability } = await import("../use-discovery");
    const wrapper = createWrapper();

    const { result: noRegion } = renderHook(() => useAvailability("movie", 5, ""), { wrapper });
    expect(noRegion.current.fetchStatus).toBe("idle");

    const { result: withRegion } = renderHook(() => useAvailability("movie", 5, "FR"), { wrapper });
    await waitFor(() => expect(withRegion.current.isLoading).toBe(false));
    expect(getWatchAvailabilityMock).toHaveBeenCalledWith("movie", 5, "FR");
  });
});

describe("usePeopleSearch / usePerson", () => {
  it("is disabled below the minimum query length", async () => {
    const { usePeopleSearch } = await import("../use-discovery");
    const { result } = renderHook(() => usePeopleSearch("a"), { wrapper: createWrapper() });

    expect(result.current.fetchStatus).toBe("idle");
    expect(searchPeopleMock).not.toHaveBeenCalled();
  });

  it("fetches a person by id", async () => {
    const { usePerson } = await import("../use-discovery");
    const { result } = renderHook(() => usePerson(42), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getPersonMock).toHaveBeenCalledWith(42);
  });

  it("searches people once the query reaches the minimum length", async () => {
    const { usePeopleSearch } = await import("../use-discovery");
    const { result } = renderHook(() => usePeopleSearch("ada"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(searchPeopleMock).toHaveBeenCalledWith("ada");
  });
});
