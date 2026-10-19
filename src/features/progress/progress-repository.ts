import {
  progressCommands,
  type EpisodeHistoryInput,
  type SeriesInput,
  type TrackedSeriesStatusRefresh,
} from "@/features/progress/progress-commands";
import { airedEpisodes } from "@/features/progress/progress-utils";
import { createBatchLoader } from "@/shared/lib/batch-loader";
import { invokeTypedCommand } from "@/shared/lib/invoke";
import type {
  Episode,
  EpisodeProgress,
  MediaSummary,
  MediaType,
  Season,
  TrackedSeriesItem,
  ViewingEventNote,
} from "@/types/media";

const nowIso = () => new Date().toISOString();

export type { SeriesInput } from "@/features/progress/progress-commands";

// A list of movie rows or series rows asks "seen?" / "which episodes?" once
// per row; the questions of one instant leave as one call (see
// shared/lib/batch-loader.ts), so a screen's IPC cost does not grow with its
// number of rows. Each row keeps its own cache entry and its own answer.
const movieSeen = createBatchLoader<number, boolean>({
  keyOf: String,
  run: async (movieIds) => {
    const seen = new Set(await invokeTypedCommand(progressCommands.seenMovieIds, { movieIds }));
    return movieIds.map((movieId) => seen.has(movieId));
  },
});

const episodeProgress = createBatchLoader<number, EpisodeProgress[]>({
  keyOf: String,
  run: async (seriesIds) => {
    const rows = await invokeTypedCommand(progressCommands.getEpisodeProgressBatch, { seriesIds });
    const bySeries = new Map<number, EpisodeProgress[]>(seriesIds.map((seriesId) => [seriesId, []]));
    for (const row of rows) bySeries.get(row.seriesId)?.push(row);
    return seriesIds.map((seriesId) => bySeries.get(seriesId) ?? []);
  },
});

// The seen_movies/episode_progress/tracked_series/viewing_events writes live
// in Rust (see src-tauri/src/commands/progress.rs) — this repository is a
// thin invoke() wrapper around them. History logging for episode/season/
// series toggles used to be a separate invoke() call from here (a genuine
// non-atomicity risk: a crash between the two would toggle progress but
// silently drop the history entry), so it's now also done in Rust, in the
// same transaction as the toggle — matching how toggleMovieSeen already
// worked. getNextEpisode/calculateSeriesProgress are pure computations over
// already-fetched data and live in progress-utils.ts, not here.
export const progressRepository = {
  async isMovieSeen(movieId: number): Promise<boolean> {
    return movieSeen.load(movieId);
  },

  // `note` is only ever meaningful when `watched` is true — the Rust side
  // (toggle_movie_seen_with_note_impl) silently drops it when unwatching,
  // and only ever writes it once, at the moment this call's viewing_events
  // row is inserted. There's no separate "attach a note after the fact"
  // command: a repeat call with the same `watched` value is a no-op (see
  // the idempotency guard in progress.rs), so a caller can't add a note to
  // an already-applied watch by calling this again.
  async toggleMovieSeen(movie: MediaSummary, watched: boolean, watchedAt = nowIso(), note?: string): Promise<void> {
    await invokeTypedCommand(progressCommands.toggleMovieSeen, { movie, watched, watchedAt, note: note ?? null });
  },

  // An explicit "watch again" of a movie that is already seen: Rust logs one
  // `rewatched` viewing event and raises the library entry's rewatch count
  // (see rewatch_movie_impl). The movie stays one watch everywhere; only the
  // rewatch statistics change. Rust refuses a movie that is not seen, and
  // treats a repeat with the same `watchedAt` as a no-op.
  async rewatchMovie(movie: MediaSummary, watchedAt = nowIso(), note?: string): Promise<void> {
    await invokeTypedCommand(progressCommands.rewatchMovie, { movie, watchedAt, note: note ?? null });
  },

  async getEpisodeProgress(seriesId: number): Promise<EpisodeProgress[]> {
    return episodeProgress.load(seriesId);
  },

  // Single-episode toggle — the only toggleEpisodesWatched caller that ever
  // passes a real `note` (markSeason/markSeries below always pass none),
  // matching apply_episodes_and_log_impl's own doc comment: a note should
  // never get silently stamped across many episodes at once.
  async toggleEpisodeSeen(series: SeriesInput, episode: Episode, watched: boolean, note?: string): Promise<void> {
    await this.toggleEpisodesWatched(
      series,
      [episode],
      watched,
      nowIso(),
      {
        action: watched ? "episode:watched" : "episode:unwatched",
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        episodeTitle: episode.title,
      },
      note
    );
  },

  async toggleEpisodesWatched(
    series: SeriesInput,
    episodes: Episode[],
    watched: boolean,
    watchedAt = nowIso(),
    history?: EpisodeHistoryInput,
    note?: string
  ): Promise<number> {
    return invokeTypedCommand(progressCommands.toggleEpisodesWatched, {
      series,
      episodes,
      watched,
      watchedAt,
      history: history ?? null,
      note: note ?? null,
    });
  },

  // Only ever marks already-aired episodes as watched — a bulk action has
  // no per-episode confirmation step the way the single-episode toggle does
  // (see episode-card.tsx's own isUnreleased guard), so without this an
  // unaired episode could get silently marked "watched" before it exists.
  // Unmarking isn't filtered: clearing a not-yet-aired episode that
  // somehow got marked (e.g. from before this guard existed) should still
  // work.
  async markSeason(series: SeriesInput, season: Season, watched: boolean): Promise<void> {
    const episodes = watched ? airedEpisodes(season) : season.episodes;
    await this.toggleEpisodesWatched(series, episodes, watched, nowIso(), {
      action: watched ? "season:watched" : "season:unwatched",
      seasonNumber: season.seasonNumber,
    });
  },

  async markSeries(series: SeriesInput, seasons: Season[], watched: boolean): Promise<void> {
    const episodes = seasons.flatMap((season) => (watched ? airedEpisodes(season) : season.episodes));
    await this.toggleEpisodesWatched(series, episodes, watched, nowIso(), {
      action: watched ? "series:watched" : "series:unwatched",
    });
  },

  async listTrackedSeries(): Promise<TrackedSeriesItem[]> {
    return invokeTypedCommand(progressCommands.listTrackedSeries);
  },

  // A no-op in Rust if the series isn't tracked yet or neither value
  // actually changed — see refresh_tracked_series_status_impl. Unlike a
  // toggle's own total_episodes upsert, this one is a plain correction
  // (can move the stored total down, not just up): the caller is expected
  // to have TMDB's current announced total, not the aired-only count used
  // for displaying progress. An unknown total is left unchanged.
  async refreshTrackedSeriesStatus(
    seriesId: number,
    status: string | null,
    totalEpisodes: number | null = null
  ): Promise<void> {
    await invokeTypedCommand(progressCommands.refreshTrackedSeriesStatus, { seriesId, status, totalEpisodes });
  },

  // `refreshTrackedSeriesStatus` for many series in one call — what the Today
  // Hub uses, which refreshes dozens at once. Resolves to the ids whose
  // refresh failed; the others went through.
  async refreshTrackedSeriesStatuses(refreshes: TrackedSeriesStatusRefresh[]): Promise<number[]> {
    if (refreshes.length === 0) return [];
    return invokeTypedCommand(progressCommands.refreshTrackedSeriesStatuses, { refreshes });
  },

  // One title's full watch history (every viewing_events row, most recent
  // first), notes included where one was written — see
  // list_viewing_events_for_media in src-tauri/src/commands/stats.rs.
  async listViewingEventsForMedia(mediaId: number, mediaType: MediaType): Promise<ViewingEventNote[]> {
    return invokeTypedCommand(progressCommands.listViewingEventsForMedia, { mediaId, mediaType });
  },

  // Local only — deliberately not part of the cloud-sync payload (see
  // docs/database-schema.md's episode_progress entry). A no-op in Rust if
  // the episode isn't marked watched yet (set_episode_rating_impl).
  async setEpisodeRating(seriesId: number, episodeId: number, rating: number | null): Promise<void> {
    await invokeTypedCommand(progressCommands.setEpisodeRating, { seriesId, episodeId, rating });
  },
};
