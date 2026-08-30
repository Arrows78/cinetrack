import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import type { Episode, TrackedSeriesItem } from "@/types/media";

const inProgressSeries: TrackedSeriesItem = {
  id: "t1",
  profileId: null,
  seriesId: 1,
  title: "In Progress",
  posterPath: null,
  backdropPath: null,
  totalEpisodes: 10,
  watchedEpisodes: 3,
  status: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const finishedSeries: TrackedSeriesItem = {
  ...inProgressSeries,
  id: "t2",
  seriesId: 2,
  title: "Finished",
  watchedEpisodes: 10,
};

const notStartedSeries: TrackedSeriesItem = {
  ...inProgressSeries,
  id: "t3",
  seriesId: 3,
  title: "Not Started",
  watchedEpisodes: 0,
};

const nextEpisode: Episode = {
  id: 42,
  seasonNumber: 1,
  episodeNumber: 4,
  title: "Next Up",
  overview: "",
};

const getSeriesDetailsMock = vi.fn(async () => ({ seasons: [{ seasonNumber: 1 }] }) as never);
const getSeasonDetailsMock = vi.fn(async () => ({ seasonNumber: 1, episodes: [] }) as never);
const getEpisodeProgressMock = vi.fn(async () => [] as never);
const getNextEpisodeMock = vi.fn(() => nextEpisode);
const toggleEpisodeSeenMock = vi.fn(async () => undefined);

vi.mock("@/features/media/media-repository", () => ({
  mediaRepository: {
    getSeriesDetails: getSeriesDetailsMock,
    getSeasonDetails: getSeasonDetailsMock,
  },
}));

vi.mock("@/features/progress/progress-repository", () => ({
  progressRepository: {
    getEpisodeProgress: getEpisodeProgressMock,
    toggleEpisodeSeen: toggleEpisodeSeenMock,
  },
}));

vi.mock("@/features/progress/progress-utils", () => ({
  getNextEpisode: getNextEpisodeMock,
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  getSeriesDetailsMock.mockClear();
  getSeasonDetailsMock.mockClear();
  getEpisodeProgressMock.mockClear();
  getNextEpisodeMock.mockClear();
  toggleEpisodeSeenMock.mockClear();
});

describe("useWatchNext", () => {
  it("only resolves entries for series that are started but not finished", async () => {
    const { useWatchNext } = await import("../use-watch-next");
    const { result } = renderHook(() => useWatchNext([inProgressSeries, finishedSeries, notStartedSeries]), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getSeriesDetailsMock).toHaveBeenCalledTimes(1);
    expect(getSeriesDetailsMock).toHaveBeenCalledWith(1);
    expect(result.current.entries).toEqual([{ series: inProgressSeries, nextEpisode, remaining: 7 }]);
  });

  it("caps the number of resolved series at the given limit", async () => {
    const other = { ...inProgressSeries, id: "t4", seriesId: 4 };
    const { useWatchNext } = await import("../use-watch-next");
    const { result } = renderHook(() => useWatchNext([inProgressSeries, other], 1), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getSeriesDetailsMock).toHaveBeenCalledTimes(1);
    expect(result.current.entries).toHaveLength(1);
  });
});

describe("useNextEpisodes season-window selection", () => {
  it("narrows to at most two seasons starting from the last-watched one when progress exists", async () => {
    getSeriesDetailsMock.mockResolvedValueOnce({
      seasons: [{ seasonNumber: 1 }, { seasonNumber: 2 }, { seasonNumber: 3 }, { seasonNumber: 4 }],
    } as never);
    getEpisodeProgressMock.mockResolvedValueOnce([
      { seasonNumber: 1, episodeNumber: 1, watched: true },
      { seasonNumber: 2, episodeNumber: 5, watched: true },
    ] as never);

    const { useNextEpisodes } = await import("../use-watch-next");
    const { result } = renderHook(() => useNextEpisodes([inProgressSeries]), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getSeasonDetailsMock).toHaveBeenCalledTimes(2);
    expect(getSeasonDetailsMock).toHaveBeenCalledWith(1, 2);
    expect(getSeasonDetailsMock).toHaveBeenCalledWith(1, 3);
    expect(getSeasonDetailsMock).not.toHaveBeenCalledWith(1, 1);
    expect(getSeasonDetailsMock).not.toHaveBeenCalledWith(1, 4);
  });

  it("falls back to just the first season when there is no prior watched progress", async () => {
    getSeriesDetailsMock.mockResolvedValueOnce({
      seasons: [{ seasonNumber: 1 }, { seasonNumber: 2 }, { seasonNumber: 3 }],
    } as never);
    getEpisodeProgressMock.mockResolvedValueOnce([] as never);

    const { useNextEpisodes } = await import("../use-watch-next");
    const { result } = renderHook(() => useNextEpisodes([inProgressSeries]), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getSeasonDetailsMock).toHaveBeenCalledTimes(1);
    expect(getSeasonDetailsMock).toHaveBeenCalledWith(1, 1);
  });

  it("short-circuits to a null next episode without fetching any season when there are no candidate seasons", async () => {
    getSeriesDetailsMock.mockResolvedValueOnce({ seasons: [] } as never);
    getEpisodeProgressMock.mockResolvedValueOnce([] as never);

    const { useNextEpisodes } = await import("../use-watch-next");
    const { result } = renderHook(() => useNextEpisodes([inProgressSeries]), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getSeasonDetailsMock).not.toHaveBeenCalled();
    expect(result.current.entries).toEqual([]);
    expect(result.current.results).toEqual([
      { series: inProgressSeries, nextEpisode: null, remaining: 7, isLoading: false, isError: false },
    ]);
  });

  it("treats a missing seasons list on the series details as having no candidate seasons", async () => {
    // Omits `seasons` entirely (unlike the `seasons: []` case above) to exercise
    // the `details.seasons ?? []` fallback itself.
    getSeriesDetailsMock.mockResolvedValueOnce({} as never);
    getEpisodeProgressMock.mockResolvedValueOnce([] as never);

    const { useNextEpisodes } = await import("../use-watch-next");
    const { result } = renderHook(() => useNextEpisodes([inProgressSeries]), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getSeasonDetailsMock).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([
      { series: inProgressSeries, nextEpisode: null, remaining: 7, isLoading: false, isError: false },
    ]);
  });

  it("breaks a tie between watched episodes in the same season by episode number", async () => {
    getSeriesDetailsMock.mockResolvedValueOnce({
      seasons: [{ seasonNumber: 1 }, { seasonNumber: 2 }],
    } as never);
    // Both watched entries share seasonNumber 2 and are given out of episode
    // order, so the sort comparator's `a.seasonNumber - b.seasonNumber` term
    // is 0 and it must fall through to `a.episodeNumber - b.episodeNumber`
    // to find episode 5 (not episode 1) as the last-watched one.
    getEpisodeProgressMock.mockResolvedValueOnce([
      { seasonNumber: 2, episodeNumber: 5, watched: true },
      { seasonNumber: 2, episodeNumber: 1, watched: true },
    ] as never);

    const { useNextEpisodes } = await import("../use-watch-next");
    const { result } = renderHook(() => useNextEpisodes([inProgressSeries]), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // last-watched season is 2, so candidates are seasons >= 2 (just season 2 here).
    expect(getSeasonDetailsMock).toHaveBeenCalledTimes(1);
    expect(getSeasonDetailsMock).toHaveBeenCalledWith(1, 2);
  });

  it("surfaces isError per-series when a series' own query rejects", async () => {
    getSeriesDetailsMock.mockRejectedValueOnce(new Error("network down"));

    const { useNextEpisodes } = await import("../use-watch-next");
    const { result } = renderHook(() => useNextEpisodes([inProgressSeries]), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.results[0]?.isError).toBe(true));

    expect(result.current.results).toEqual([
      { series: inProgressSeries, nextEpisode: null, remaining: 7, isLoading: false, isError: true },
    ]);
    expect(result.current.entries).toEqual([]);
  });
});

describe("useWatchNext inProgress filter", () => {
  it("excludes series that haven't started or are already finished, keeping only in-progress ones", async () => {
    const { useWatchNext } = await import("../use-watch-next");
    const { result } = renderHook(() => useWatchNext([notStartedSeries, inProgressSeries, finishedSeries]), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getSeriesDetailsMock).toHaveBeenCalledTimes(1);
    expect(getSeriesDetailsMock).toHaveBeenCalledWith(1);
    expect(result.current.entries).toEqual([{ series: inProgressSeries, nextEpisode, remaining: 7 }]);
  });
});

describe("partitionNextEpisodes", () => {
  const now = new Date("2026-06-15T00:00:00.000Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  it("groups a never-started series into upNext regardless of its next episode's air date", async () => {
    const { partitionNextEpisodes } = await import("../use-watch-next");
    const result = {
      series: notStartedSeries,
      nextEpisode: { ...nextEpisode, airDate: daysAgo(400) },
      remaining: 10,
      isLoading: false,
      isError: false,
    };

    const groups = partitionNextEpisodes([result], now);

    expect(groups.upNext).toEqual([{ series: notStartedSeries, nextEpisode: result.nextEpisode, remaining: 10 }]);
    expect(groups.continueWatching).toEqual([]);
    expect(groups.newEpisodes).toEqual([]);
  });

  it("groups an in-progress series whose next episode aired within the window into newEpisodes", async () => {
    const { partitionNextEpisodes, NEW_EPISODE_WINDOW_DAYS } = await import("../use-watch-next");
    const result = {
      series: inProgressSeries,
      nextEpisode: { ...nextEpisode, airDate: daysAgo(NEW_EPISODE_WINDOW_DAYS - 1) },
      remaining: 7,
      isLoading: false,
      isError: false,
    };

    const groups = partitionNextEpisodes([result], now);

    expect(groups.newEpisodes).toEqual([{ series: inProgressSeries, nextEpisode: result.nextEpisode, remaining: 7 }]);
    expect(groups.continueWatching).toEqual([]);
  });

  it("groups an in-progress series whose next episode aired outside the window into continueWatching", async () => {
    const { partitionNextEpisodes, NEW_EPISODE_WINDOW_DAYS } = await import("../use-watch-next");
    const result = {
      series: inProgressSeries,
      nextEpisode: { ...nextEpisode, airDate: daysAgo(NEW_EPISODE_WINDOW_DAYS + 1) },
      remaining: 7,
      isLoading: false,
      isError: false,
    };

    const groups = partitionNextEpisodes([result], now);

    expect(groups.continueWatching).toEqual([
      { series: inProgressSeries, nextEpisode: result.nextEpisode, remaining: 7 },
    ]);
    expect(groups.newEpisodes).toEqual([]);
  });

  it("treats the window boundary as still recently aired (inclusive)", async () => {
    const { partitionNextEpisodes, NEW_EPISODE_WINDOW_DAYS } = await import("../use-watch-next");
    const result = {
      series: inProgressSeries,
      nextEpisode: { ...nextEpisode, airDate: daysAgo(NEW_EPISODE_WINDOW_DAYS) },
      remaining: 7,
      isLoading: false,
      isError: false,
    };

    const groups = partitionNextEpisodes([result], now);

    expect(groups.newEpisodes).toHaveLength(1);
    expect(groups.continueWatching).toHaveLength(0);
  });

  it("treats a missing air date as not recently aired, falling back to continueWatching", async () => {
    const { partitionNextEpisodes } = await import("../use-watch-next");
    const result = {
      series: inProgressSeries,
      nextEpisode: { ...nextEpisode, airDate: null },
      remaining: 7,
      isLoading: false,
      isError: false,
    };

    const groups = partitionNextEpisodes([result], now);

    expect(groups.continueWatching).toHaveLength(1);
    expect(groups.newEpisodes).toHaveLength(0);
  });

  it("excludes results with no resolved next episode from every group", async () => {
    const { partitionNextEpisodes } = await import("../use-watch-next");
    const result = { series: inProgressSeries, nextEpisode: null, remaining: 7, isLoading: false, isError: false };

    const groups = partitionNextEpisodes([result], now);

    expect(groups).toEqual({ continueWatching: [], upNext: [], newEpisodes: [] });
  });
});

describe("useTodayHubEpisodes", () => {
  it("resolves every tracked series once and reports an aggregate isError when any of them failed", async () => {
    // seriesList order maps 1:1 to the resolveNextEpisode call order (see
    // useNextEpisodes), so these Once-mocks are consumed in the same order
    // as [inProgressSeries, notStartedSeries] below rather than leaking into
    // later tests the way a persistent mockImplementation would.
    getSeriesDetailsMock
      .mockResolvedValueOnce({ seasons: [{ seasonNumber: 1 }] } as never)
      .mockRejectedValueOnce(new Error("boom"));

    const { useTodayHubEpisodes } = await import("../use-watch-next");
    const { result } = renderHook(() => useTodayHubEpisodes([inProgressSeries, notStartedSeries]), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(true);
    expect(result.current.continueWatching).toEqual([{ series: inProgressSeries, nextEpisode, remaining: 7 }]);
    expect(result.current.upNext).toEqual([]);
  });
});

describe("useMarkWatchNext", () => {
  it("marks the episode watched via progressRepository.toggleEpisodeSeen", async () => {
    const { useMarkWatchNext } = await import("../use-watch-next");
    const { result } = renderHook(() => useMarkWatchNext(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.markWatched({ series: inProgressSeries, episode: nextEpisode });
    });

    expect(toggleEpisodeSeenMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, mediaType: "series", numberOfEpisodes: 10 }),
      nextEpisode,
      true
    );
  });
});
