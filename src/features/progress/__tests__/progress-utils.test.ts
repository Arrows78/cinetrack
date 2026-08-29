import { describe, expect, it } from "vitest";
import { calculateSeriesProgress, getNextEpisode } from "../progress-utils";
import type { Episode, EpisodeProgress, Season } from "@/types/media";

const episode = (overrides: Partial<Episode> = {}): Episode => ({
  id: 100,
  seasonNumber: 1,
  episodeNumber: 1,
  title: "Pilot",
  overview: "",
  ...overrides,
});

const season = (episodes: Episode[]): Season => ({
  id: 1,
  seasonNumber: 1,
  name: "Season 1",
  overview: "",
  episodeCount: episodes.length,
  episodes,
});

describe("progress-utils", () => {
  it("computes next episode and series progress purely from inputs", () => {
    const ep1 = episode({ id: 1, episodeNumber: 1 });
    const ep2 = episode({ id: 2, episodeNumber: 2 });
    const s = season([ep1, ep2]);

    const now = new Date().toISOString();
    const mockProgress: EpisodeProgress = {
      id: "1",
      profileId: null,
      seriesId: 9,
      episodeId: 1,
      seasonNumber: 1,
      episodeNumber: 1,
      watched: true,
      watchedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const next = getNextEpisode([s], [mockProgress]);
    expect(next?.id).toBe(2);

    const progress = calculateSeriesProgress(9, [s], [mockProgress]);
    expect(progress.watchedEpisodes).toBe(1);
    expect(progress.totalEpisodes).toBe(2);
    expect(progress.completed).toBe(false);
  });

  it("getNextEpisode skips unwatched episodes that haven't aired yet", () => {
    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
    const unaired = episode({ id: 1, episodeNumber: 1, airDate: farFuture });
    const noAirDate = episode({ id: 2, episodeNumber: 2, airDate: null });
    const s = season([unaired, noAirDate]);

    const next = getNextEpisode([s], []);
    expect(next?.id).toBe(2);
  });

  it("marks a series up to date once every aired episode is watched but an unaired one is still ahead", () => {
    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
    const aired = episode({ id: 1, episodeNumber: 1, airDate: new Date(Date.now() - 1000).toISOString() });
    const unaired = episode({ id: 2, episodeNumber: 2, airDate: farFuture });
    const s = season([aired, unaired]);
    const now = new Date().toISOString();
    const watchedAired: EpisodeProgress = {
      id: "1",
      profileId: null,
      seriesId: 9,
      episodeId: 1,
      seasonNumber: 1,
      episodeNumber: 1,
      watched: true,
      watchedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const progress = calculateSeriesProgress(9, [s], [watchedAired]);

    expect(progress.completed).toBe(false);
    expect(progress.isUpToDate).toBe(true);
  });

  it("is neither up to date nor completed while an aired episode remains unwatched", () => {
    const aired = episode({ id: 1, episodeNumber: 1, airDate: new Date(Date.now() - 1000).toISOString() });
    const s = season([aired]);

    const progress = calculateSeriesProgress(9, [s], []);

    expect(progress.completed).toBe(false);
    expect(progress.isUpToDate).toBe(false);
  });

  it("is not up to date once completed (every known episode, including future ones, watched)", () => {
    const ep1 = episode({ id: 1, episodeNumber: 1 });
    const s = season([ep1]);
    const now = new Date().toISOString();
    const watched: EpisodeProgress = {
      id: "1",
      profileId: null,
      seriesId: 9,
      episodeId: 1,
      seasonNumber: 1,
      episodeNumber: 1,
      watched: true,
      watchedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const progress = calculateSeriesProgress(9, [s], [watched]);

    expect(progress.completed).toBe(true);
    expect(progress.isUpToDate).toBe(false);
  });
});
