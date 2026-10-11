import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateSeriesProgress, countAiredUnwatched, getNextEpisode, hasAired } from "../progress-utils";
import type { Episode, EpisodeProgress, Season } from "@/types/media";

const episode = (overrides: Partial<Episode> = {}): Episode => ({
  id: 100,
  seasonNumber: 1,
  episodeNumber: 1,
  title: "Pilot",
  overview: "",
  // Dated in the past by default: an undated episode only counts as aired
  // when a later one has (see hasAired).
  airDate: "2020-01-01",
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
    const ep1 = episode({ id: 1, episodeNumber: 1, airDate: "2020-01-01" });
    const ep2 = episode({ id: 2, episodeNumber: 2, airDate: "2020-01-08" });
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
    const aired = episode({ id: 2, episodeNumber: 2, airDate: "2020-01-01" });
    const s = season([unaired, aired]);

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
    const dated = episode({ airDate: "2026-07-14" });
    expect(hasAired(dated, season([dated]))).toBe(false);

    vi.setSystemTime(new Date(2026, 6, 14, 0, 1));
    expect(hasAired(dated, season([dated]))).toBe(true);
  });

  describe("an episode with no air date", () => {
    const aired = "2026-07-01";
    const future = "2026-09-01";

    it("has aired only when a later episode of its season has", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 14, 12, 0));
      const undated = episode({ id: 1, episodeNumber: 1, airDate: null });
      const later = episode({ id: 2, episodeNumber: 2, airDate: aired });

      expect(hasAired(undated, season([undated, later]))).toBe(true);
    });

    it("is upcoming when it is the last episode, or the later ones are still ahead or undated", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 14, 12, 0));
      const earlier = episode({ id: 1, episodeNumber: 1, airDate: aired });
      const undated = episode({ id: 2, episodeNumber: 2, airDate: null });

      expect(hasAired(undated, season([earlier, undated]))).toBe(false);
      const ahead = episode({ id: 3, episodeNumber: 3, airDate: future });
      expect(hasAired(undated, season([earlier, undated, ahead]))).toBe(false);
      const alsoUndated = episode({ id: 4, episodeNumber: 3, airDate: null });
      expect(hasAired(undated, season([earlier, undated, alsoUndated]))).toBe(false);
    });

    it("chains through consecutive undated episodes to a later aired one", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 14, 12, 0));
      const first = episode({ id: 1, episodeNumber: 1, airDate: null });
      const second = episode({ id: 2, episodeNumber: 2, airDate: null });
      const third = episode({ id: 3, episodeNumber: 3, airDate: aired });

      expect(hasAired(first, season([first, second, third]))).toBe(true);
      expect(hasAired(second, season([first, second, third]))).toBe(true);
    });

    it("is neither the next episode nor counted in progress while it is upcoming", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 14, 12, 0));
      const watchedEp = episode({ id: 1, episodeNumber: 1, airDate: aired });
      const undated = episode({ id: 2, episodeNumber: 2, airDate: null });
      const s = season([watchedEp, undated]);
      const progress = [{ episodeId: 1, watched: true } as EpisodeProgress];

      expect(getNextEpisode([s], progress)).toBeNull();
      expect(calculateSeriesProgress(1, [s], progress)).toMatchObject({ totalEpisodes: 1, watchedEpisodes: 1 });
    });
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

    it("a watched id from another series is ignored", () => {
      const progress = calculateSeriesProgress(
        1,
        [season([episode({ id: 1, airDate: "2020-01-01" })])],
        [{ episodeId: 999, watched: true } as EpisodeProgress]
      );
      expect(progress).toMatchObject({ totalEpisodes: 1, watchedEpisodes: 0, progressPercent: 0, completed: false });
      expect(progress.isUpToDate).toBe(false);
    });
  });
});

describe("countAiredUnwatched", () => {
  const watchedRow = (episodeId: number, watched = true): EpisodeProgress => ({
    id: String(episodeId),
    profileId: null,
    seriesId: 9,
    episodeId,
    seasonNumber: 1,
    episodeNumber: episodeId,
    watched,
    watchedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    rating: null,
  });

  it("counts only aired episodes that are not watched, and always agrees with getNextEpisode", () => {
    const s = season([
      episode({ id: 1, episodeNumber: 1 }),
      episode({ id: 2, episodeNumber: 2 }),
      episode({ id: 3, episodeNumber: 3 }),
      episode({ id: 4, episodeNumber: 4, airDate: "2999-01-01" }),
      episode({ id: 5, episodeNumber: 5, airDate: null }),
    ]);

    expect(countAiredUnwatched([s], [watchedRow(1)])).toBe(2);
    expect(getNextEpisode([s], [watchedRow(1)])?.id).toBe(2);
    const allAired = [watchedRow(1), watchedRow(2), watchedRow(3)];
    expect(countAiredUnwatched([s], allAired)).toBe(0);
    expect(getNextEpisode([s], allAired)).toBeNull();
  });

  it("ignores a row that is no longer watched, and handles empty input", () => {
    const s = season([episode({ id: 1 })]);

    expect(countAiredUnwatched([s], [watchedRow(1, false)])).toBe(1);
    expect(countAiredUnwatched([season([])], [])).toBe(0);
    expect(countAiredUnwatched([], [])).toBe(0);
  });
});
