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
      seriesId: 9,
      episodeId: 1,
      seasonNumber: 1,
      episodeNumber: 1,
      watched: true,
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
});
