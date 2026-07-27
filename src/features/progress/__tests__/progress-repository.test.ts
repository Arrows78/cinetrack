import { beforeEach, describe, expect, it } from "vitest";
import { progressRepository } from "../progress-repository";
import { makeMedia } from "@/shared/test-utils";
import type { Episode, Season } from "@/types/media";

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

describe("progressRepository (browser fallback)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("toggles a movie as seen and back", async () => {
    const movie = makeMedia({ id: 55 });
    await progressRepository.toggleMovieSeen(movie, true);
    expect(await progressRepository.isMovieSeen(55)).toBe(true);

    await progressRepository.toggleMovieSeen(movie, false);
    expect(await progressRepository.isMovieSeen(55)).toBe(false);
  });

  it("marks an episode watched and reflects it in progress and tracked series", async () => {
    const series = makeMedia({ id: 9, mediaType: "series", title: "Test Show" });
    await progressRepository.toggleEpisodeSeen(series, episode(), true);

    const progress = await progressRepository.getEpisodeProgress(9);
    expect(progress).toHaveLength(1);
    expect(progress[0].episodeId).toBe(100);

    const tracked = await progressRepository.listTrackedSeries();
    expect(tracked.find((item) => item.seriesId === 9)?.watchedEpisodes).toBe(1);
  });

  it("does not re-apply an already-applied episode (applyEpisodes returns 0 changes)", async () => {
    const series = makeMedia({ id: 9, mediaType: "series", title: "Test Show" });
    await progressRepository.toggleEpisodeSeen(series, episode(), true);
    const changed = await progressRepository.applyEpisodes(series, [episode()], true);
    expect(changed).toBe(0);
  });

  it("computes next episode and series progress purely from inputs", () => {
    const ep1 = episode({ id: 1, episodeNumber: 1 });
    const ep2 = episode({ id: 2, episodeNumber: 2 });
    const s = season([ep1, ep2]);

    const next = progressRepository.getNextEpisode([s], [
      { seriesId: 9, episodeId: 1, seasonNumber: 1, episodeNumber: 1, watched: true },
    ]);
    expect(next?.id).toBe(2);

    const progress = progressRepository.calculateSeriesProgress(9, [s], [
      { seriesId: 9, episodeId: 1, seasonNumber: 1, episodeNumber: 1, watched: true },
    ]);
    expect(progress.watchedEpisodes).toBe(1);
    expect(progress.totalEpisodes).toBe(2);
    expect(progress.completed).toBe(false);
  });
});
