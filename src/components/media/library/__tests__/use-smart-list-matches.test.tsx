import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import { makeLibraryItem } from "@/shared/test-utils";
import { DEFAULT_SMART_LIST_RULES } from "@/features/smart-lists/smart-list-evaluation";
import type { AvailabilitySnapshot, LibraryItem, Movie, SmartListRules, TrackedSeriesItem } from "@/types/media";

const getPreferencesMock = vi.fn(
  async () => ({ activeProfileId: DEFAULT_PROFILE_ID, preferredProviderIds: [] as number[] }) as never
);
vi.mock("@/features/preferences/preferences-repository", () => ({
  preferencesRepository: { getPreferences: () => getPreferencesMock() },
}));

let libraryItems: LibraryItem[] = [];
let libraryIsLoading = false;
let libraryIsError = false;
vi.mock("@/features/library/use-library", () => ({
  useLibrary: () => ({
    data: libraryItems,
    isLoading: libraryIsLoading,
    isError: libraryIsError,
    error: libraryIsError ? new Error("boom") : null,
    refetch: vi.fn(),
  }),
}));

let trackedSeriesData: TrackedSeriesItem[] = [];
vi.mock("@/features/progress/use-progress", () => ({
  useTrackedSeries: () => ({
    data: trackedSeriesData,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

let snapshotsData: AvailabilitySnapshot[] = [];
vi.mock("@/features/availability/use-availability-alerts", () => ({
  useAvailabilitySnapshots: () => ({
    data: snapshotsData,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

const getMovieDetailsMock = vi.fn<(id: number) => Promise<Movie>>();
vi.mock("@/features/media/media-repository", () => ({
  mediaRepository: { getMovieDetails: (id: number) => getMovieDetailsMock(id) },
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  getPreferencesMock.mockClear();
  getMovieDetailsMock.mockReset();
  libraryItems = [];
  libraryIsLoading = false;
  libraryIsError = false;
  trackedSeriesData = [];
  snapshotsData = [];
});

describe("useSmartListMatches", () => {
  it("returns no items when no rules are given", async () => {
    libraryItems = [makeLibraryItem()];
    const { useSmartListMatches } = await import("../use-smart-list-matches");
    const { result } = renderHook(() => useSmartListMatches(undefined), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([]);
  });

  it("filters the library by the given rules", async () => {
    libraryItems = [
      makeLibraryItem({ mediaId: 1, status: "planned", title: "Waiting to watch" }),
      makeLibraryItem({ mediaId: 2, status: "completed", title: "Already watched" }),
    ];
    const { useSmartListMatches } = await import("../use-smart-list-matches");
    const activeRules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, status: "planned" };
    const { result } = renderHook(() => useSmartListMatches(activeRules), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.map((item) => item.id)).toEqual([1]);
  });

  it("propagates a library load error", async () => {
    libraryIsError = true;
    const { useSmartListMatches } = await import("../use-smart-list-matches");
    const { result } = renderHook(() => useSmartListMatches(DEFAULT_SMART_LIST_RULES), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("does not fetch movie runtime when no maxRuntimeMinutes rule is set", async () => {
    libraryItems = [makeLibraryItem({ mediaType: "movie" })];
    const { useSmartListMatches } = await import("../use-smart-list-matches");
    const { result } = renderHook(() => useSmartListMatches(DEFAULT_SMART_LIST_RULES), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getMovieDetailsMock).not.toHaveBeenCalled();
  });

  it("resolves each movie's runtime and applies the maxRuntimeMinutes rule once it loads", async () => {
    libraryItems = [
      makeLibraryItem({ mediaId: 1, mediaType: "movie", title: "Short film" }),
      makeLibraryItem({ mediaId: 2, mediaType: "movie", title: "Long film" }),
    ];
    getMovieDetailsMock.mockImplementation(async (id) => ({ id, runtime: id === 1 ? 90 : 160 }) as unknown as Movie);

    const activeRules: SmartListRules = { ...DEFAULT_SMART_LIST_RULES, maxRuntimeMinutes: 100 };
    const { useSmartListMatches } = await import("../use-smart-list-matches");
    const { result } = renderHook(() => useSmartListMatches(activeRules), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.map((item) => item.id)).toEqual([1]);
    expect(getMovieDetailsMock).toHaveBeenCalledWith(1);
    expect(getMovieDetailsMock).toHaveBeenCalledWith(2);
  });
});
