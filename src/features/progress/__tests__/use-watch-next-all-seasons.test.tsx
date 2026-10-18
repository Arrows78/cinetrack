import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import type { Episode, EpisodeProgress, Season, TrackedSeriesItem } from "@/types/media";

// Unlike use-watch-next.test.tsx, getNextEpisode is NOT mocked here: these
// tests pin the real resolution across seasons.

const series: TrackedSeriesItem = {
  id: "t1",
  profileId: null,
  seriesId: 1,
  title: "Show",
  posterPath: null,
  backdropPath: null,
  totalEpisodes: 6,
  watchedEpisodes: 3,
  status: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const episode = (id: number, seasonNumber: number, episodeNumber: number): Episode => ({
  id,
  seasonNumber,
  episodeNumber,
  title: `S${seasonNumber}E${episodeNumber}`,
  overview: "",
  airDate: "2020-01-01",
});

const season = (seasonNumber: number, episodes: Episode[]): Season => ({
  id: seasonNumber,
  seasonNumber,
  name: `Season ${seasonNumber}`,
  overview: "",
  episodeCount: episodes.length,
  episodes,
});

const progressFor = (watched: Episode[]): EpisodeProgress[] =>
  watched.map((item) => ({
    id: String(item.id),
    profileId: null,
    seriesId: 1,
    episodeId: item.id,
    seasonNumber: item.seasonNumber,
    episodeNumber: item.episodeNumber,
    watched: true,
    watchedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    rating: null,
  }));

const s1 = [episode(11, 1, 1), episode(12, 1, 2)];
const s2 = [episode(21, 2, 1), episode(22, 2, 2)];
const s3 = [episode(31, 3, 1), episode(32, 3, 2)];
const seasonsByNumber = new Map([
  [1, season(1, s1)],
  [2, season(2, s2)],
  [3, season(3, s3)],
]);

const getSeriesDetailsMock = vi.fn(
  async () => ({ seasons: [{ seasonNumber: 0 }, ...seasonsByNumber.values()] }) as never
);
const getSeasonDetailsMock = vi.fn(
  async (_seriesId: number, seasonNumber: number) => seasonsByNumber.get(seasonNumber) as never
);
const getEpisodeProgressMock = vi.fn(async () => [] as EpisodeProgress[]);

vi.mock("@/features/media/media-repository", () => ({
  mediaRepository: { getSeriesDetails: getSeriesDetailsMock, getSeasonDetails: getSeasonDetailsMock },
}));

vi.mock("@/features/progress/progress-repository", () => ({
  progressRepository: {
    getEpisodeProgress: getEpisodeProgressMock,
    toggleEpisodeSeen: vi.fn(),
    refreshTrackedSeriesStatuses: vi.fn(async () => []),
  },
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  const { queryClient } = await import("@/app/query-client");
  queryClient.clear();
});

describe("Watch Next across every season", () => {
  it("can retry a failed next-episode resolution after the connection recovers", async () => {
    getSeriesDetailsMock.mockRejectedValueOnce(new Error("Offline"));
    getEpisodeProgressMock.mockResolvedValue(progressFor([s1[0]!]));
    const { useNextEpisodes } = await import("../use-watch-next");
    const { result } = renderHook(() => useNextEpisodes([series]), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.results[0]?.isError).toBe(true));
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.entries[0]?.nextEpisode.id).toBe(12));
    expect(result.current.results[0]?.isError).toBe(false);
  });

  it("proposes a series whose only unwatched aired episode sits in an earlier season than the last one watched", async () => {
    // Season 1 complete, season 2 has a hole (E1 skipped), the viewer is in season 3.
    getEpisodeProgressMock.mockResolvedValue(progressFor([s1[0]!, s1[1]!, s2[1]!, s3[0]!, s3[1]!]));

    const { useWatchNext } = await import("../use-watch-next");
    const { result } = renderHook(() => useWatchNext([series]), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]?.nextEpisode.id).toBe(21);
  });

  it("proposes the next unwatched episode in season/episode order, not the one after the last watched", async () => {
    getEpisodeProgressMock.mockResolvedValue(progressFor([s1[0]!, s3[0]!]));

    const { useWatchNext } = await import("../use-watch-next");
    const { result } = renderHook(() => useWatchNext([series]), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.entries[0]?.nextEpisode.id).toBe(12);
  });

  it("still proposes nothing for a series that is fully caught up", async () => {
    getEpisodeProgressMock.mockResolvedValue(progressFor([...s1, ...s2, ...s3]));

    const { useWatchNext } = await import("../use-watch-next");
    const { result } = renderHook(() => useWatchNext([series]), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.entries).toEqual([]);
    expect(getSeasonDetailsMock).toHaveBeenCalledTimes(3);
  });

  it("counts what is left from the aired episodes, not from the cached total", async () => {
    // The cache says 6 episodes and 1 watched (5 left), but season 2's second
    // episode and all of season 3 are announced, not out: 2 are really left.
    const unaired = (item: Episode): Episode => ({ ...item, airDate: "2999-01-01" });
    seasonsByNumber.set(2, season(2, [s2[0]!, unaired(s2[1]!)]));
    seasonsByNumber.set(3, season(3, s3.map(unaired)));
    getEpisodeProgressMock.mockResolvedValue(progressFor([s1[0]!]));

    try {
      const { useWatchNext } = await import("../use-watch-next");
      const { result } = renderHook(() => useWatchNext([{ ...series, totalEpisodes: 6, watchedEpisodes: 1 }]), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // s1E2 and s2E1.
      expect(result.current.entries[0]?.remaining).toBe(2);
    } finally {
      seasonsByNumber.set(2, season(2, s2));
      seasonsByNumber.set(3, season(3, s3));
    }
  });
});
