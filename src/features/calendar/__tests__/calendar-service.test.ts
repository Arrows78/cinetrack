import { addDays, format, subDays } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Movie, Season, Series } from "@/types/media";

const mocks = vi.hoisted(() => ({
  getUpcomingMovies: vi.fn(),
  getSeriesDetails: vi.fn(),
  getSeasonDetails: vi.fn(),
  listTrackedSeries: vi.fn(),
}));

vi.mock("@/features/media/media-repository", () => ({
  mediaRepository: {
    getUpcomingMovies: mocks.getUpcomingMovies,
    getSeriesDetails: mocks.getSeriesDetails,
    getSeasonDetails: mocks.getSeasonDetails,
  },
}));

vi.mock("@/features/progress/progress-repository", () => ({
  progressRepository: { listTrackedSeries: mocks.listTrackedSeries },
}));

import { calendarService } from "../calendar-service";

const day = (offset: number) =>
  format(offset >= 0 ? addDays(new Date(), offset) : subDays(new Date(), -offset), "yyyy-MM-dd");

const movie = (id: number, releaseDate: string | null): Movie => ({
  id,
  mediaType: "movie",
  title: `Film ${id}`,
  overview: "",
  releaseDate,
  genres: [],
  cast: [],
});

const emptyPage = { page: 1, totalPages: 0, totalResults: 0, results: [] };

const series = (id: number, seasonNumbers: number[]): Series => ({
  id,
  mediaType: "series",
  title: `Série ${id}`,
  overview: "",
  genres: [],
  cast: [],
  numberOfSeasons: seasonNumbers.length,
  seasons: seasonNumbers.map((seasonNumber) => ({
    id: id * 100 + seasonNumber,
    seasonNumber,
    name: `Saison ${seasonNumber}`,
    overview: "",
    episodeCount: 0,
    episodes: [],
  })),
});

const season = (seasonNumber: number, episodes: Array<{ id: number; airDate: string | null }>): Season => ({
  id: seasonNumber,
  seasonNumber,
  name: `Saison ${seasonNumber}`,
  overview: "",
  episodeCount: episodes.length,
  episodes: episodes.map((episode, index) => ({
    id: episode.id,
    seasonNumber,
    episodeNumber: index + 1,
    title: `Épisode ${index + 1}`,
    overview: "",
    airDate: episode.airDate,
  })),
});

describe("calendarService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUpcomingMovies.mockResolvedValue(emptyPage);
    mocks.listTrackedSeries.mockResolvedValue([]);
  });

  it("keeps only movie releases inside the window", async () => {
    mocks.getUpcomingMovies.mockResolvedValue({
      ...emptyPage,
      results: [movie(1, day(5)), movie(2, day(-3)), movie(3, day(90)), movie(4, null)],
    });

    const entries = await calendarService.build(60);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ mediaId: 1, kind: "movie-release", date: day(5) });
  });

  it("adds upcoming episodes of tracked series with season and episode metadata", async () => {
    mocks.listTrackedSeries.mockResolvedValue([{ seriesId: 10 }]);
    mocks.getSeriesDetails.mockResolvedValue(series(10, [1, 2]));
    mocks.getSeasonDetails.mockImplementation((_seriesId: number, seasonNumber: number) =>
      Promise.resolve(
        season(seasonNumber, [
          { id: seasonNumber * 10 + 1, airDate: day(3) },
          { id: seasonNumber * 10 + 2, airDate: day(120) },
        ])
      )
    );

    const entries = await calendarService.build(60);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      mediaId: 10,
      kind: "episode",
      seasonNumber: 1,
      episodeNumber: 1,
      episodeTitle: "Épisode 1",
    });
  });

  it("survives a failing series and a failing upcoming feed", async () => {
    mocks.getUpcomingMovies.mockRejectedValue(new Error("TMDB down"));
    mocks.listTrackedSeries.mockResolvedValue([{ seriesId: 10 }, { seriesId: 11 }]);
    mocks.getSeriesDetails.mockImplementation((seriesId: number) =>
      seriesId === 10 ? Promise.reject(new Error("gone")) : Promise.resolve(series(11, [1]))
    );
    mocks.getSeasonDetails.mockResolvedValue(season(1, [{ id: 1, airDate: day(2) }]));

    const entries = await calendarService.build(60);

    expect(entries).toHaveLength(1);
    expect(entries[0]!.mediaId).toBe(11);
  });

  it("returns entries sorted by date", async () => {
    mocks.getUpcomingMovies.mockResolvedValue({
      ...emptyPage,
      results: [movie(1, day(20)), movie(2, day(2)), movie(3, day(10))],
    });

    const entries = await calendarService.build(60);

    expect(entries.map((entry) => entry.mediaId)).toEqual([2, 3, 1]);
  });

  it("paginates past the first page of upcoming movies while results stay inside the window", async () => {
    mocks.getUpcomingMovies.mockImplementation((page: number) => {
      if (page === 1) return Promise.resolve({ page: 1, totalPages: 2, totalResults: 2, results: [movie(1, day(1))] });
      if (page === 2) return Promise.resolve({ page: 2, totalPages: 2, totalResults: 2, results: [movie(2, day(2))] });
      return Promise.resolve(emptyPage);
    });

    const entries = await calendarService.build(60);

    expect(mocks.getUpcomingMovies).toHaveBeenCalledTimes(2);
    expect(entries.map((entry) => entry.mediaId)).toEqual([1, 2]);
  });

  it("stops paginating once a page's results move past the window", async () => {
    mocks.getUpcomingMovies.mockImplementation((page: number) => {
      if (page === 1) return Promise.resolve({ page: 1, totalPages: 3, totalResults: 3, results: [movie(1, day(90))] });
      return Promise.resolve({ page, totalPages: 3, totalResults: 3, results: [movie(page + 10, day(1))] });
    });

    await calendarService.build(60);

    expect(mocks.getUpcomingMovies).toHaveBeenCalledTimes(1);
  });

  it("includes every tracked series, not just a capped first batch", async () => {
    const trackedCount = 25;
    mocks.listTrackedSeries.mockResolvedValue(
      Array.from({ length: trackedCount }, (_, index) => ({ seriesId: index + 1 }))
    );
    mocks.getSeriesDetails.mockImplementation((seriesId: number) => Promise.resolve(series(seriesId, [1])));
    mocks.getSeasonDetails.mockResolvedValue(season(1, [{ id: 1, airDate: day(1) }]));

    const entries = await calendarService.build(60);

    expect(mocks.getSeriesDetails).toHaveBeenCalledTimes(trackedCount);
    expect(entries).toHaveLength(trackedCount);
  });
});
