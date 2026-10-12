import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeEpisodeProgress, makeMedia } from "@/shared/test-utils";
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

  it("isMovieSeen() asks list_seen_movie_ids, and the rows of one instant share a single call", async () => {
    invokeMock.mockResolvedValueOnce([55, 57]);
    const { progressRepository } = await import("../progress-repository");

    const answers = await Promise.all([
      progressRepository.isMovieSeen(55),
      progressRepository.isMovieSeen(56),
      progressRepository.isMovieSeen(57),
    ]);

    expect(answers).toEqual([true, false, true]);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("list_seen_movie_ids", { movieIds: [55, 56, 57] });
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

  it("rewatchMovie() invokes rewatch_movie with the movie/watchedAt/note, defaulting watchedAt to now and note to null", async () => {
    invokeMock.mockResolvedValue(undefined);
    const { progressRepository } = await import("../progress-repository");
    const movie = makeMedia({ id: 55, runtime: 118 });

    await progressRepository.rewatchMovie(movie, "2026-02-14T21:00:00.000Z", "Again!");
    expect(invokeMock).toHaveBeenCalledWith("rewatch_movie", {
      movie,
      watchedAt: "2026-02-14T21:00:00.000Z",
      note: "Again!",
    });

    invokeMock.mockClear();
    await progressRepository.rewatchMovie(movie);
    const [command, args] = invokeMock.mock.calls[0] as [string, { watchedAt: string; note: null }];
    expect(command).toBe("rewatch_movie");
    expect(args.note).toBeNull();
    expect(() => new Date(args.watchedAt).toISOString()).not.toThrow();
  });

  it("getEpisodeProgress() asks get_episode_progress_batch and hands each series its own rows", async () => {
    const nine = makeEpisodeProgress({ seriesId: 9, episodeId: 1 });
    const ten = makeEpisodeProgress({ seriesId: 10, episodeId: 2 });
    invokeMock.mockResolvedValueOnce([nine, ten]);
    const { progressRepository } = await import("../progress-repository");

    const [forNine, forTen, forEleven] = await Promise.all([
      progressRepository.getEpisodeProgress(9),
      progressRepository.getEpisodeProgress(10),
      progressRepository.getEpisodeProgress(11),
    ]);

    expect(forNine).toEqual([nine]);
    expect(forTen).toEqual([ten]);
    expect(forEleven).toEqual([]);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("get_episode_progress_batch", { seriesIds: [9, 10, 11] });
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

  it("markSeason() drops not-yet-aired episodes when marking watched, but not when unwatching", async () => {
    invokeMock.mockResolvedValue(1);
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series" });
    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
    const aired = episode({ id: 1, episodeNumber: 1 });
    const unaired = episode({ id: 2, episodeNumber: 2, airDate: farFuture });
    const mixedSeason = season([aired, unaired]);

    await progressRepository.markSeason(series, mixedSeason, true);
    expect(invokeMock).toHaveBeenCalledWith("toggle_episodes_watched", expect.objectContaining({ episodes: [aired] }));

    invokeMock.mockClear();
    await progressRepository.markSeason(series, mixedSeason, false);
    expect(invokeMock).toHaveBeenCalledWith(
      "toggle_episodes_watched",
      expect.objectContaining({ episodes: [aired, unaired] })
    );
  });

  it("markSeries() drops not-yet-aired episodes when marking watched, but not when unwatching", async () => {
    invokeMock.mockResolvedValue(1);
    const { progressRepository } = await import("../progress-repository");
    const series = makeMedia({ id: 9, mediaType: "series" });
    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
    const aired = episode({ id: 1, episodeNumber: 1 });
    const unaired = episode({ id: 2, seasonNumber: 2, episodeNumber: 1, airDate: farFuture });
    const seasons = [season([aired]), { ...season([unaired]), seasonNumber: 2 }];

    await progressRepository.markSeries(series, seasons, true);
    expect(invokeMock).toHaveBeenCalledWith("toggle_episodes_watched", expect.objectContaining({ episodes: [aired] }));

    invokeMock.mockClear();
    await progressRepository.markSeries(series, seasons, false);
    expect(invokeMock).toHaveBeenCalledWith(
      "toggle_episodes_watched",
      expect.objectContaining({ episodes: [aired, unaired] })
    );
  });

  it("listTrackedSeries() invokes list_tracked_series with no args", async () => {
    invokeMock.mockResolvedValueOnce([]);
    const { progressRepository } = await import("../progress-repository");

    await progressRepository.listTrackedSeries();
    expect(invokeMock).toHaveBeenCalledWith("list_tracked_series", undefined);
  });

  it("refreshTrackedSeriesStatus() invokes refresh_tracked_series_status with seriesId/status, defaulting totalEpisodes to null", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { progressRepository } = await import("../progress-repository");

    await progressRepository.refreshTrackedSeriesStatus(9, "Ended");
    expect(invokeMock).toHaveBeenCalledWith("refresh_tracked_series_status", {
      seriesId: 9,
      status: "Ended",
      totalEpisodes: null,
    });
  });

  it("refreshTrackedSeriesStatuses() sends every series in one refresh_tracked_series_statuses call", async () => {
    invokeMock.mockResolvedValueOnce([3]);
    const { progressRepository } = await import("../progress-repository");
    const refreshes = [
      { seriesId: 3, status: "Ended", totalEpisodes: 10 },
      { seriesId: 4, status: null, totalEpisodes: null },
    ];

    await expect(progressRepository.refreshTrackedSeriesStatuses(refreshes)).resolves.toEqual([3]);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("refresh_tracked_series_statuses", { refreshes });
  });

  it("refreshTrackedSeriesStatuses() makes no call for nothing to refresh", async () => {
    const { progressRepository } = await import("../progress-repository");

    await expect(progressRepository.refreshTrackedSeriesStatuses([])).resolves.toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("refreshTrackedSeriesStatus() passes totalEpisodes through when given", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { progressRepository } = await import("../progress-repository");

    await progressRepository.refreshTrackedSeriesStatus(9, "Ended", 12);
    expect(invokeMock).toHaveBeenCalledWith("refresh_tracked_series_status", {
      seriesId: 9,
      status: "Ended",
      totalEpisodes: 12,
    });
  });

  it("setEpisodeRating() invokes set_episode_rating with seriesId/episodeId/rating", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { progressRepository } = await import("../progress-repository");

    await progressRepository.setEpisodeRating(9, 100, 4);
    expect(invokeMock).toHaveBeenCalledWith("set_episode_rating", { seriesId: 9, episodeId: 100, rating: 4 });
  });

  it("setEpisodeRating() passes null through to clear a rating", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { progressRepository } = await import("../progress-repository");

    await progressRepository.setEpisodeRating(9, 100, null);
    expect(invokeMock).toHaveBeenCalledWith("set_episode_rating", { seriesId: 9, episodeId: 100, rating: null });
  });

  it("listViewingEventsForMedia() invokes list_viewing_events_for_media with mediaId/mediaType", async () => {
    invokeMock.mockResolvedValueOnce([]);
    const { progressRepository } = await import("../progress-repository");

    await progressRepository.listViewingEventsForMedia(9, "series");
    expect(invokeMock).toHaveBeenCalledWith("list_viewing_events_for_media", { mediaId: 9, mediaType: "series" });
  });
});
