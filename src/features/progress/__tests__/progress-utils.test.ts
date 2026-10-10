import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateSeriesProgress, getNextEpisode, hasAired } from "../progress-utils";
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
      rating: null,
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
      rating: null,
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

  it("excludes unaired episodes from totalEpisodes/progressPercent (both overall and per-season), but not from completed", () => {
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
      rating: null,
    };

    const progress = calculateSeriesProgress(9, [s], [watchedAired]);

    // 1/1 aired episodes watched -> 100%, not 1/2 (50%) counting the unaired one.
    expect(progress.totalEpisodes).toBe(1);
    expect(progress.watchedEpisodes).toBe(1);
    expect(progress.progressPercent).toBe(100);
    expect(progress.seasons[0]).toMatchObject({ totalEpisodes: 1, watchedEpisodes: 1, progressPercent: 100 });
    // completed still requires the unaired episode too — distinct from the
    // aired-only percentage above.
    expect(progress.completed).toBe(false);
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
      rating: null,
    };

    const progress = calculateSeriesProgress(9, [s], [watched]);

    expect(progress.completed).toBe(true);
    expect(progress.isUpToDate).toBe(false);
  });
});

describe("calculateSeriesProgress percentages", () => {
  it("shows 99%, not 100%, with one episode of 200 still to watch", () => {
    const episodes = Array.from({ length: 200 }, (_, index) => episode({ id: index + 1, episodeNumber: index + 1 }));
    const now = new Date().toISOString();
    const watched: EpisodeProgress[] = episodes.slice(0, 199).map((item) => ({
      id: String(item.id),
      profileId: null,
      seriesId: 9,
      episodeId: item.id,
      seasonNumber: 1,
      episodeNumber: item.episodeNumber,
      watched: true,
      watchedAt: null,
      createdAt: now,
      updatedAt: now,
      rating: null,
    }));

    const progress = calculateSeriesProgress(9, [season(episodes)], watched);

    expect(progress.progressPercent).toBe(99);
    expect(progress.seasons[0]?.progressPercent).toBe(99);
  });
});

describe("hasAired", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Run the suite with TZ=America/New_York to exercise the west-of-UTC
  // case: reading "2026-07-14" as UTC midnight made it "aired" at 20:00
  // local on the 13th there.
  it("only counts an air date as aired from the local start of that day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 13, 21, 0));
    expect(hasAired(episode({ airDate: "2026-07-14" }))).toBe(false);

    vi.setSystemTime(new Date(2026, 6, 14, 0, 1));
    expect(hasAired(episode({ airDate: "2026-07-14" }))).toBe(true);
  });

  describe("boundary values", () => {
    it("never reports 'up to date' when no episode has aired — nothing loaded yet, or an announced series not out yet", () => {
      // No season fetched yet (the detail page renders before they resolve).
      const unloaded = calculateSeriesProgress(1, [], []);
      expect(unloaded).toMatchObject({ totalEpisodes: 0, watchedEpisodes: 0, progressPercent: 0, completed: false });
      expect(unloaded.isUpToDate).toBe(false);

      // Every episode still in the future.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 0, 1));
      const unaired = calculateSeriesProgress(
        1,
        [
          season([
            episode({ id: 1, airDate: "2026-06-01" }),
            episode({ id: 2, episodeNumber: 2, airDate: "2026-06-08" }),
          ]),
        ],
        []
      );
      expect(unaired).toMatchObject({ totalEpisodes: 0, watchedEpisodes: 0, progressPercent: 0, completed: false });
      expect(unaired.isUpToDate).toBe(false);
      expect(unaired.seasons[0]).toMatchObject({ totalEpisodes: 0, progressPercent: 0 });
    });

    it("a season with no episodes yields 0% and no NaN anywhere", () => {
      const progress = calculateSeriesProgress(1, [season([])], []);
      expect(progress.seasons[0]).toEqual({
        seasonNumber: 1,
        totalEpisodes: 0,
        watchedEpisodes: 0,
        progressPercent: 0,
      });
      expect(Number.isNaN(progress.progressPercent)).toBe(false);
    });

    it("still reports 'up to date' once every aired episode is watched and the rest are ahead", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 14));
      const progress = calculateSeriesProgress(
        1,
        [
          season([
            episode({ id: 1, airDate: "2026-07-01" }),
            episode({ id: 2, episodeNumber: 2, airDate: "2026-12-01" }),
          ]),
        ],
        [{ episodeId: 1, watched: true } as EpisodeProgress]
      );
      expect(progress).toMatchObject({ totalEpisodes: 1, watchedEpisodes: 1, progressPercent: 100, completed: false });
      expect(progress.isUpToDate).toBe(true);
    });

    it("an episode with no air date counts as aired, and a watched id from another series is ignored", () => {
      const progress = calculateSeriesProgress(
        1,
        [season([episode({ id: 1 })])],
        [{ episodeId: 999, watched: true } as EpisodeProgress]
      );
      expect(progress).toMatchObject({ totalEpisodes: 1, watchedEpisodes: 0, progressPercent: 0, completed: false });
      expect(progress.isUpToDate).toBe(false);
    });
  });
});
