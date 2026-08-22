import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import { queryKeys } from "@/shared/constants/query-keys";
import type { Episode, MediaSummary, Season, TrackedSeriesItem } from "@/types/media";

const movie: MediaSummary = {
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

const series: MediaSummary & { numberOfEpisodes?: number } = {
  id: 9,
  mediaType: "series",
  title: "Test Series",
  overview: "",
  posterPath: null,
  backdropPath: null,
  year: 2024,
  rating: null,
  genres: [],
  cast: [],
};

const episode: Episode = {
  id: 1,
  seasonNumber: 1,
  episodeNumber: 1,
  title: "Pilot",
  overview: "",
};

const season: Season = {
  id: 1,
  seasonNumber: 1,
  name: "Season 1",
  overview: "",
  episodeCount: 1,
  episodes: [episode],
};

const isMovieSeenMock = vi.fn(async () => false);
const toggleMovieSeenMock = vi.fn(async () => undefined);
const getEpisodeProgressMock = vi.fn(async () => [] as never);
const toggleEpisodeSeenMock = vi.fn(async () => undefined);
const markSeasonMock = vi.fn(async () => undefined);
const markSeriesMock = vi.fn(async () => undefined);
const listTrackedSeriesMock = vi.fn(async () => [] as TrackedSeriesItem[]);
const listViewingEventsForMediaMock = vi.fn(async () => [] as never);
const refreshTrackedSeriesStatusMock = vi.fn<(seriesId: number, status: string | null) => Promise<undefined>>(
  async () => undefined
);
// useActiveProfileId() (see use-preferences.ts) resolves to this via
// preferencesRepository.getPreferences() — fixed to "default" so every key
// assertion below is deterministic regardless of when it resolves (it
// matches useActiveProfileId's own pre-resolution fallback too).
const getPreferencesMock = vi.fn(async () => ({ activeProfileId: DEFAULT_PROFILE_ID }) as never);

vi.mock("@/features/progress/progress-repository", () => ({
  progressRepository: {
    isMovieSeen: isMovieSeenMock,
    toggleMovieSeen: toggleMovieSeenMock,
    getEpisodeProgress: getEpisodeProgressMock,
    toggleEpisodeSeen: toggleEpisodeSeenMock,
    markSeason: markSeasonMock,
    markSeries: markSeriesMock,
    listTrackedSeries: listTrackedSeriesMock,
    refreshTrackedSeriesStatus: refreshTrackedSeriesStatusMock,
    listViewingEventsForMedia: listViewingEventsForMediaMock,
  },
}));

vi.mock("@/features/preferences/preferences-repository", () => ({
  preferencesRepository: { getPreferences: getPreferencesMock },
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    Wrapper: function Wrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    },
  };
}

beforeEach(() => {
  isMovieSeenMock.mockClear();
  toggleMovieSeenMock.mockClear();
  getEpisodeProgressMock.mockClear();
  toggleEpisodeSeenMock.mockClear();
  markSeasonMock.mockClear();
  markSeriesMock.mockClear();
  listTrackedSeriesMock.mockClear();
  refreshTrackedSeriesStatusMock.mockClear();
  getPreferencesMock.mockClear();
  listViewingEventsForMediaMock.mockClear();
});

describe("useMovieSeen", () => {
  it("is disabled for a non-finite id and loads seen state otherwise", async () => {
    const { useMovieSeen } = await import("../use-progress");
    const { Wrapper } = createWrapper();

    const { result: disabled } = renderHook(() => useMovieSeen(Number.NaN), { wrapper: Wrapper });
    expect(disabled.current.fetchStatus).toBe("idle");

    const { result } = renderHook(() => useMovieSeen(7), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBe(false);
  });

  it("toggling invalidates movieSeen, history, stats and this movie's viewing-event notes", async () => {
    const { useMovieSeen } = await import("../use-progress");
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useMovieSeen(7), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.toggleMovieSeen({ movie, watched: true });
    });

    expect(toggleMovieSeenMock).toHaveBeenCalledWith(movie, true, undefined, undefined);
    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(invalidatedKeys).toContainEqual(queryKeys.local.movieSeen(DEFAULT_PROFILE_ID, 7));
    expect(invalidatedKeys).toContainEqual(queryKeys.local.history(DEFAULT_PROFILE_ID));
    expect(invalidatedKeys).toContainEqual(queryKeys.local.stats(DEFAULT_PROFILE_ID));
    expect(invalidatedKeys).toContainEqual(queryKeys.local.library(DEFAULT_PROFILE_ID));
    expect(invalidatedKeys).toContainEqual(queryKeys.local.viewingEventsForMedia(DEFAULT_PROFILE_ID, "movie", 7));
  });

  it("passes an optional note through to progressRepository.toggleMovieSeen", async () => {
    const { useMovieSeen } = await import("../use-progress");
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMovieSeen(7), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.toggleMovieSeen({ movie, watched: true, note: "Loved it" });
    });

    expect(toggleMovieSeenMock).toHaveBeenCalledWith(movie, true, undefined, "Loved it");
  });
});

describe("useEpisodeProgress", () => {
  it("toggling an episode invalidates the full episode-progress fanout, including this series' viewing-event notes", async () => {
    const { useEpisodeProgress } = await import("../use-progress");
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useEpisodeProgress(9), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.toggleEpisodeSeen({ series, episode, watched: true });
    });

    expect(toggleEpisodeSeenMock).toHaveBeenCalledWith(series, episode, true, undefined);
    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(invalidatedKeys).toContainEqual(queryKeys.local.episodeProgress(DEFAULT_PROFILE_ID, 9));
    expect(invalidatedKeys).toContainEqual(queryKeys.local.watchNextEpisode(DEFAULT_PROFILE_ID, 9));
    expect(invalidatedKeys).toContainEqual(queryKeys.local.trackedSeries(DEFAULT_PROFILE_ID));
    expect(invalidatedKeys).toContainEqual(queryKeys.local.calendar(DEFAULT_PROFILE_ID));
    expect(invalidatedKeys).toContainEqual(queryKeys.local.library(DEFAULT_PROFILE_ID));
    expect(invalidatedKeys).toContainEqual(queryKeys.local.viewingEventsForMedia(DEFAULT_PROFILE_ID, "series", 9));
  });

  it("passes an optional note through to progressRepository.toggleEpisodeSeen", async () => {
    const { useEpisodeProgress } = await import("../use-progress");
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useEpisodeProgress(9), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.toggleEpisodeSeen({ series, episode, watched: true, note: "Great pilot" });
    });

    expect(toggleEpisodeSeenMock).toHaveBeenCalledWith(series, episode, true, "Great pilot");
  });

  it("marking a season delegates to progressRepository.markSeason", async () => {
    const { useEpisodeProgress } = await import("../use-progress");
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useEpisodeProgress(9), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.markSeasonSeen({ series, season, watched: true });
    });

    expect(markSeasonMock).toHaveBeenCalledWith(series, season, true);
  });

  it("marking a whole series delegates to progressRepository.markSeries", async () => {
    const { useEpisodeProgress } = await import("../use-progress");
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useEpisodeProgress(9), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.markSeriesSeen({ series, seasons: [season], watched: true });
    });

    expect(markSeriesMock).toHaveBeenCalledWith(series, [season], true);
  });
});

describe("useViewingEventsForMedia", () => {
  it("is disabled for a non-finite media id and loads a title's viewing events otherwise", async () => {
    const { useViewingEventsForMedia } = await import("../use-progress");
    const { Wrapper } = createWrapper();

    const { result: disabled } = renderHook(() => useViewingEventsForMedia(Number.NaN, "movie"), {
      wrapper: Wrapper,
    });
    expect(disabled.current.fetchStatus).toBe("idle");

    const { result } = renderHook(() => useViewingEventsForMedia(7, "movie"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(listViewingEventsForMediaMock).toHaveBeenCalledWith(7, "movie");
  });
});

describe("useTrackedSeries", () => {
  it("loads tracked series", async () => {
    const { useTrackedSeries } = await import("../use-progress");
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useTrackedSeries(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(listTrackedSeriesMock).toHaveBeenCalled();
  });
});

describe("useRefreshTrackedSeriesStatus", () => {
  it("delegates to progressRepository.refreshTrackedSeriesStatus and invalidates tracked series", async () => {
    const { useRefreshTrackedSeriesStatus } = await import("../use-progress");
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRefreshTrackedSeriesStatus(), { wrapper: Wrapper });

    await act(async () => {
      await result.current({ seriesId: 9, status: "Ended" });
    });

    expect(refreshTrackedSeriesStatusMock).toHaveBeenCalledWith(9, "Ended");
    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(invalidatedKeys).toContainEqual(queryKeys.local.trackedSeries(DEFAULT_PROFILE_ID));
  });
});
