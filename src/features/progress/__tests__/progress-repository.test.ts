// @vitest-environment node
//
// useTestSqlite() (see sqlite-test-harness.ts) uses the real node:sqlite
// built-in. Under the default jsdom environment, Vite treats this file as
// browser ("client") code and refuses to bundle a Node built-in into it.
import { describe, expect, it, vi } from "vitest";
import { useTestSqlite } from "@/db/__tests__/sqlite-test-harness";
import { makeMedia } from "@/shared/test-utils";
import type { Episode, Season } from "@/types/media";

vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => true }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

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
    expect(progress[0]!.episodeId).toBe(100);

    const tracked = await progressRepository.listTrackedSeries();
    expect(tracked.find((item) => item.seriesId === 9)?.watchedEpisodes).toBe(1);
  });

  it("refreshTrackedSeriesStatus writes back a fresh TMDB status for a tracked series", async () => {
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series", title: "Test Show", status: "Returning Series" } as never);
    await progressRepository.toggleEpisodeSeen(series, episode(), true);

    await progressRepository.refreshTrackedSeriesStatus(9, "Ended");

    const tracked = await progressRepository.listTrackedSeries();
    expect(tracked.find((item) => item.seriesId === 9)?.status).toBe("Ended");
  });

  it("refreshTrackedSeriesStatus is a no-op for a series that isn't tracked", async () => {
    const { progressRepository } = await import("../progress-repository");
    await progressRepository.refreshTrackedSeriesStatus(404, "Ended");

    const tracked = await progressRepository.listTrackedSeries();
    expect(tracked.find((item) => item.seriesId === 404)).toBeUndefined();
  });

  it("does not re-apply an already-applied episode (toggleEpisodesWatched returns 0 changes)", async () => {
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series", title: "Test Show" });
    await progressRepository.toggleEpisodeSeen(series, episode(), true);
    const changed = await progressRepository.toggleEpisodesWatched(series, [episode()], true);
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

  it("toggleEpisodesWatched only writes rows that actually changed state (real COUNT check)", async () => {
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series", title: "Test Show" } as never);

    const firstRun = await progressRepository.toggleEpisodesWatched(
      series,
      [episode({ id: 1 }), episode({ id: 2 })],
      true
    );
    expect(firstRun).toBe(2);

    const secondRun = await progressRepository.toggleEpisodesWatched(
      series,
      [episode({ id: 1 }), episode({ id: 2 })],
      true
    );
    expect(secondRun).toBe(0);

    const rows = sqlite.current
      .prepare("SELECT COUNT(*) count FROM episode_progress WHERE series_id = 9")
      .all() as Array<{
      count: number;
    }>;
    expect(rows[0]!.count).toBe(2);
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

  it("marking a season unwatched logs a season:unwatched history entry", async () => {
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series", title: "Test Show" } as never);
    const fullSeason = season([episode({ id: 1 })]);

    await progressRepository.markSeason(series, fullSeason, true);
    await progressRepository.markSeason(series, fullSeason, false);

    const history = sqlite.current.prepare("SELECT * FROM activity_log WHERE media_id = 9").all() as Array<{
      action: string;
    }>;
    expect(history.some((row) => row.action === "season:unwatched")).toBe(true);
  });

  it("marking a whole series watched applies every season's episodes in one transaction", async () => {
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series", title: "Test Show" } as never);
    const season1 = season([episode({ id: 1 }), episode({ id: 2, episodeNumber: 2 })]);
    const season2 = season([episode({ id: 3, seasonNumber: 2, episodeNumber: 1 })]);

    await progressRepository.markSeries(series, [season1, season2], true);

    const progress = await progressRepository.getEpisodeProgress(9);
    expect(progress).toHaveLength(3);

    const history = sqlite.current.prepare("SELECT * FROM activity_log WHERE media_id = 9").all() as Array<{
      action: string;
    }>;
    expect(history.some((row) => row.action === "series:watched")).toBe(true);
  });

  it("marking an already-watched series again writes no history entry", async () => {
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series", title: "Test Show" } as never);
    const fullSeason = season([episode({ id: 1 })]);

    await progressRepository.markSeries(series, [fullSeason], true);
    const before = sqlite.current.prepare("SELECT COUNT(*) count FROM activity_log WHERE media_id = 9").all() as Array<{
      count: number;
    }>;

    await progressRepository.markSeries(series, [fullSeason], true);
    const after = sqlite.current.prepare("SELECT COUNT(*) count FROM activity_log WHERE media_id = 9").all() as Array<{
      count: number;
    }>;

    expect(after[0]!.count).toBe(before[0]!.count);
  });

  it("attaches an optional note to a movie's viewing_events row when marking it watched", async () => {
    const { progressRepository } = await import("../progress-repository");
    const movie = makeMedia({ id: 55, runtime: 118 });

    await progressRepository.toggleMovieSeen(movie, true, undefined, "Loved the twist ending");

    const events = await progressRepository.listViewingEventsForMedia(55, "movie");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: "watched", note: "Loved the twist ending" });
  });

  it("never stores a note when unwatching a movie, even if one is passed", async () => {
    const { progressRepository } = await import("../progress-repository");
    const movie = makeMedia({ id: 55, runtime: 118 });

    await progressRepository.toggleMovieSeen(movie, true);
    await progressRepository.toggleMovieSeen(movie, false, undefined, "should be ignored");

    const events = await progressRepository.listViewingEventsForMedia(55, "movie");
    const unwatchedEvent = events.find((event) => event.eventType === "unwatched");
    expect(unwatchedEvent?.note).toBeUndefined();
  });

  it("attaches an optional note to a single episode's viewing_events row", async () => {
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series", title: "Test Show" });

    await progressRepository.toggleEpisodeSeen(series, episode(), true, "Great pilot!");

    const events = await progressRepository.listViewingEventsForMedia(9, "series");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: "watched", note: "Great pilot!" });
  });

  it("lists a title's viewing events most recent first, and never leaks another title's events", async () => {
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series", title: "Test Show" });
    const otherSeries = makeMedia({ id: 10, mediaType: "series", title: "Other Show" });

    await progressRepository.toggleEpisodesWatched(
      series,
      [episode({ id: 1 })],
      true,
      "2025-01-01T00:00:00.000Z",
      undefined,
      "first watch"
    );
    await progressRepository.toggleEpisodesWatched(
      otherSeries,
      [episode({ id: 2 })],
      true,
      "2025-06-01T00:00:00.000Z",
      undefined,
      "unrelated"
    );
    await progressRepository.toggleEpisodesWatched(series, [episode({ id: 1 })], false, "2025-06-15T00:00:00.000Z");
    await progressRepository.toggleEpisodesWatched(
      series,
      [episode({ id: 1 })],
      true,
      "2026-01-01T00:00:00.000Z",
      undefined,
      "second watch"
    );

    const events = await progressRepository.listViewingEventsForMedia(9, "series");
    expect(events.map((event) => event.note)).toEqual(["second watch", undefined, "first watch"]);
  });

  it("does not attach a note when marking a whole season watched (bulk marks never carry one)", async () => {
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series", title: "Test Show" } as never);
    const fullSeason = season([episode({ id: 1 })]);

    await progressRepository.markSeason(series, fullSeason, true);

    const events = await progressRepository.listViewingEventsForMedia(9, "series");
    expect(events).toHaveLength(1);
    expect(events[0]!.note).toBeUndefined();
  });

  it("marking a series unwatched logs a series:unwatched history entry", async () => {
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series", title: "Test Show" } as never);
    const fullSeason = season([episode({ id: 1 })]);

    await progressRepository.markSeries(series, [fullSeason], true);
    await progressRepository.markSeries(series, [fullSeason], false);

    const history = sqlite.current.prepare("SELECT * FROM activity_log WHERE media_id = 9").all() as Array<{
      action: string;
    }>;
    expect(history.some((row) => row.action === "series:unwatched")).toBe(true);
  });
});
