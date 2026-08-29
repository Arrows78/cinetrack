import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeMedia } from "@/shared/test-utils";
import type { Episode, Season } from "@/types/media";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

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

// The seen_movies/episode_progress/tracked_series/viewing_events writes,
// the idempotency guards, and the JOIN-based watchedEpisodes count all live
// in Rust and are exercised there (see src-tauri/src/progress/repository.rs's
// own tests — does_not_reapply_an_already_applied_episode,
// computes_watched_episodes_via_the_tracked_series_join_not_a_stored_counter,
// etc.) — this file only verifies progressRepository wraps invoke() with the
// right command name/args, and that toggleEpisodeSeen/markSeason/markSeries
// build the right history payload before delegating to toggleEpisodesWatched.
describe("progressRepository", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("isMovieSeen() invokes is_movie_seen with movieId", async () => {
    invokeMock.mockResolvedValueOnce(true);
    const { progressRepository } = await import("../progress-repository");

    await expect(progressRepository.isMovieSeen(55)).resolves.toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("is_movie_seen", { movieId: 55 });
  });

  it("toggleMovieSeen() invokes toggle_movie_seen with the movie/watched/watchedAt/note", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { progressRepository } = await import("../progress-repository");
    const movie = makeMedia({ id: 55, runtime: 118 });

    await progressRepository.toggleMovieSeen(movie, true, "2026-01-01T00:00:00.000Z", "Loved it");
    expect(invokeMock).toHaveBeenCalledWith("toggle_movie_seen", {
      movie,
      watched: true,
      watchedAt: "2026-01-01T00:00:00.000Z",
      note: "Loved it",
    });
  });

  it("toggleMovieSeen() defaults watchedAt to now and note to null", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { progressRepository } = await import("../progress-repository");
    const movie = makeMedia({ id: 55 });

    await progressRepository.toggleMovieSeen(movie, false);
    const [, args] = invokeMock.mock.calls[0] as [string, { watchedAt: string; note: null }];
    expect(args.note).toBeNull();
    expect(() => new Date(args.watchedAt).toISOString()).not.toThrow();
  });

  it("getEpisodeProgress() invokes get_episode_progress with seriesId", async () => {
    invokeMock.mockResolvedValueOnce([]);
    const { progressRepository } = await import("../progress-repository");

    await progressRepository.getEpisodeProgress(9);
    expect(invokeMock).toHaveBeenCalledWith("get_episode_progress", { seriesId: 9 });
  });

  it("toggleEpisodesWatched() invokes toggle_episodes_watched with every field, defaulting history/note to null", async () => {
    invokeMock.mockResolvedValueOnce(2);
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series" });
    const episodes = [episode({ id: 1 }), episode({ id: 2, episodeNumber: 2 })];

    const changed = await progressRepository.toggleEpisodesWatched(series, episodes, true, "2026-01-01T00:00:00.000Z");
    expect(changed).toBe(2);
    expect(invokeMock).toHaveBeenCalledWith("toggle_episodes_watched", {
      series,
      episodes,
      watched: true,
      watchedAt: "2026-01-01T00:00:00.000Z",
      history: null,
      note: null,
    });
  });

  it("toggleEpisodeSeen() delegates to toggleEpisodesWatched with a single-episode array and an episode:* history action", async () => {
    invokeMock.mockResolvedValueOnce(1);
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series" });
    const targetEpisode = episode({ id: 5, seasonNumber: 2, episodeNumber: 3, title: "Great pilot!" });

    await progressRepository.toggleEpisodeSeen(series, targetEpisode, true, "Great pilot!");
    expect(invokeMock).toHaveBeenCalledWith(
      "toggle_episodes_watched",
      expect.objectContaining({
        episodes: [targetEpisode],
        watched: true,
        history: { action: "episode:watched", seasonNumber: 2, episodeNumber: 3, episodeTitle: "Great pilot!" },
        note: "Great pilot!",
      })
    );
  });

  it("toggleEpisodeSeen() uses episode:unwatched when unwatching", async () => {
    invokeMock.mockResolvedValueOnce(1);
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series" });

    await progressRepository.toggleEpisodeSeen(series, episode(), false);
    expect(invokeMock).toHaveBeenCalledWith(
      "toggle_episodes_watched",
      expect.objectContaining({ history: expect.objectContaining({ action: "episode:unwatched" }) })
    );
  });

  it("markSeason() delegates every episode with a season:* history action carrying only seasonNumber, never a note", async () => {
    invokeMock.mockResolvedValueOnce(2);
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series" });
    const fullSeason = season([episode({ id: 1 }), episode({ id: 2, episodeNumber: 2 })]);

    await progressRepository.markSeason(series, fullSeason, true);
    expect(invokeMock).toHaveBeenCalledWith(
      "toggle_episodes_watched",
      expect.objectContaining({
        episodes: fullSeason.episodes,
        history: { action: "season:watched", seasonNumber: 1 },
        note: null,
      })
    );
  });

  it("markSeason() uses season:unwatched when unwatching", async () => {
    invokeMock.mockResolvedValueOnce(1);
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series" });

    await progressRepository.markSeason(series, season([episode()]), false);
    expect(invokeMock).toHaveBeenCalledWith(
      "toggle_episodes_watched",
      expect.objectContaining({ history: expect.objectContaining({ action: "season:unwatched" }) })
    );
  });

  it("markSeries() flattens every season's episodes and sends a series:* history action with no season/episode number", async () => {
    invokeMock.mockResolvedValueOnce(3);
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series" });
    const season1 = season([episode({ id: 1 }), episode({ id: 2, episodeNumber: 2 })]);
    const season2 = season([episode({ id: 3, seasonNumber: 2, episodeNumber: 1 })]);

    await progressRepository.markSeries(series, [season1, season2], true);
    expect(invokeMock).toHaveBeenCalledWith(
      "toggle_episodes_watched",
      expect.objectContaining({
        episodes: [...season1.episodes, ...season2.episodes],
        history: { action: "series:watched" },
        note: null,
      })
    );
  });

  it("markSeries() uses series:unwatched when unwatching", async () => {
    invokeMock.mockResolvedValueOnce(1);
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series" });

    await progressRepository.markSeries(series, [season([episode()])], false);
    expect(invokeMock).toHaveBeenCalledWith(
      "toggle_episodes_watched",
      expect.objectContaining({ history: expect.objectContaining({ action: "series:unwatched" }) })
    );
  });

  it("listTrackedSeries() invokes list_tracked_series with no args", async () => {
    invokeMock.mockResolvedValueOnce([]);
    const { progressRepository } = await import("../progress-repository");

    await progressRepository.listTrackedSeries();
    expect(invokeMock).toHaveBeenCalledWith("list_tracked_series", undefined);
  });

  it("refreshTrackedSeriesStatus() invokes refresh_tracked_series_status with seriesId/status", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { progressRepository } = await import("../progress-repository");

    await progressRepository.refreshTrackedSeriesStatus(9, "Ended");
    expect(invokeMock).toHaveBeenCalledWith("refresh_tracked_series_status", { seriesId: 9, status: "Ended" });
  });

  it("listViewingEventsForMedia() invokes list_viewing_events_for_media with mediaId/mediaType", async () => {
    invokeMock.mockResolvedValueOnce([]);
    const { progressRepository } = await import("../progress-repository");

    await progressRepository.listViewingEventsForMedia(9, "series");
    expect(invokeMock).toHaveBeenCalledWith("list_viewing_events_for_media", { mediaId: 9, mediaType: "series" });
  });
});
