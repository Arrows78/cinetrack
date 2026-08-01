import { describe, expect, it, vi } from "vitest";
import { useTestSqlite } from "@/db/__tests__/sqlite-test-harness";
import { makeMedia } from "@/shared/test-utils";
import type { Episode, EpisodeProgress, Season } from "@/types/media";

vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => true }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));

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

describe("progressRepository", () => {
  const sqlite = useTestSqlite();

  it("toggles a movie seen through a real INSERT/DELETE round trip", async () => {
    const { progressRepository } = await import("../progress-repository");
    const movie = makeMedia({ id: 55, runtime: 118 });

    await progressRepository.toggleMovieSeen(movie, true);
    expect(await progressRepository.isMovieSeen(55)).toBe(true);

    const rows = sqlite.current.prepare("SELECT * FROM seen_movies WHERE movie_id = 55").all();
    expect(rows).toHaveLength(1);

    await progressRepository.toggleMovieSeen(movie, false);
    expect(await progressRepository.isMovieSeen(55)).toBe(false);
    expect(sqlite.current.prepare("SELECT * FROM seen_movies WHERE movie_id = 55").all()).toHaveLength(0);
  });

  it("records a viewing_events row alongside the seen toggle, inside the same transaction", async () => {
    const { progressRepository } = await import("../progress-repository");
    const movie = makeMedia({ id: 55, runtime: 118 });

    await progressRepository.toggleMovieSeen(movie, true);

    const events = sqlite.current.prepare("SELECT * FROM viewing_events WHERE media_id = 55").all() as Array<{
      event_type: string;
      duration_minutes: number;
    }>;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event_type: "watched", duration_minutes: 118 });
  });

  it("marks an episode watched and reflects it in progress and tracked series", async () => {
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series", title: "Test Show" });
    await progressRepository.toggleEpisodeSeen(series, episode(), true);

    const progress = await progressRepository.getEpisodeProgress(9);
    expect(progress).toHaveLength(1);
    expect(progress[0].episodeId).toBe(100);

    const tracked = await progressRepository.listTrackedSeries();
    expect(tracked.find((item) => item.seriesId === 9)?.watchedEpisodes).toBe(1);
  });

  it("does not re-apply an already-applied episode (applyEpisodes returns 0 changes)", async () => {
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series", title: "Test Show" });
    await progressRepository.toggleEpisodeSeen(series, episode(), true);
    const changed = await progressRepository.applyEpisodes(series, [episode()], true);
    expect(changed).toBe(0);
  });

  it("computes watchedEpisodes via the tracked-series JOIN, not a stored counter", async () => {
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series", title: "Test Show", numberOfEpisodes: 3 } as never);

    await progressRepository.toggleEpisodeSeen(series, episode({ id: 1 }), true);
    await progressRepository.toggleEpisodeSeen(series, episode({ id: 2, episodeNumber: 2 }), true);

    const tracked = await progressRepository.listTrackedSeries();
    const entry = tracked.find((item) => item.seriesId === 9);
    expect(entry).toMatchObject({ totalEpisodes: 3, watchedEpisodes: 2 });

    // Un-watching one episode must be reflected by the JOIN on the next read,
    // proving the count isn't cached anywhere stale.
    await progressRepository.toggleEpisodeSeen(series, episode({ id: 1 }), false);
    const updated = await progressRepository.listTrackedSeries();
    expect(updated.find((item) => item.seriesId === 9)?.watchedEpisodes).toBe(1);
  });

  it("applyEpisodes only writes rows that actually changed state (real COUNT check)", async () => {
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series", title: "Test Show" } as never);

    const firstRun = await progressRepository.applyEpisodes(series, [episode({ id: 1 }), episode({ id: 2 })], true);
    expect(firstRun).toBe(2);

    const secondRun = await progressRepository.applyEpisodes(series, [episode({ id: 1 }), episode({ id: 2 })], true);
    expect(secondRun).toBe(0);

    const rows = sqlite.current
      .prepare("SELECT COUNT(*) count FROM episode_progress WHERE series_id = 9")
      .all() as Array<{
      count: number;
    }>;
    expect(rows[0].count).toBe(2);
  });

  it("marking a whole season watched applies every episode in one transaction", async () => {
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series", title: "Test Show" } as never);
    const fullSeason = season([
      episode({ id: 1 }),
      episode({ id: 2, episodeNumber: 2 }),
      episode({ id: 3, episodeNumber: 3 }),
    ]);

    await progressRepository.markSeason(series, fullSeason, true);

    const progress = await progressRepository.getEpisodeProgress(9);
    expect(progress).toHaveLength(3);
  });

  it("computes next episode and series progress purely from inputs", async () => {
    const { progressRepository } = await import("../progress-repository");
    const ep1 = episode({ id: 1, episodeNumber: 1 });
    const ep2 = episode({ id: 2, episodeNumber: 2 });
    const s = season([ep1, ep2]);

    const now = new Date().toISOString();
    const mockProgress: EpisodeProgress = { id: "1", seriesId: 9, episodeId: 1, seasonNumber: 1, episodeNumber: 1, watched: true, createdAt: now, updatedAt: now };
    const next = progressRepository.getNextEpisode(
      [s],
      [mockProgress]
    );
    expect(next?.id).toBe(2);

    const progress = progressRepository.calculateSeriesProgress(
      9,
      [s],
      [mockProgress]
    );
    expect(progress.watchedEpisodes).toBe(1);
    expect(progress.totalEpisodes).toBe(2);
    expect(progress.completed).toBe(false);
  });
});
