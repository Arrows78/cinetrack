import type {
  Episode,
  EpisodeProgress,
  HistoryAction,
  MediaSummary,
  MediaType,
  Season,
  TrackedSeriesItem,
  ViewingEventNote,
} from "@/types/media";
import { invokeCommand } from "@/shared/lib/invoke";

const nowIso = () => new Date().toISOString();

export type SeriesInput = MediaSummary & { numberOfEpisodes?: number };

interface EpisodeHistoryInput {
  action: HistoryAction;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
}

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
    return invokeCommand<boolean>("is_movie_seen", { movieId });
  },

  // `note` is only ever meaningful when `watched` is true — the Rust side
  // (toggle_movie_seen_with_note_impl) silently drops it when unwatching,
  // and only ever writes it once, at the moment this call's viewing_events
  // row is inserted. There's no separate "attach a note after the fact"
  // command: a repeat call with the same `watched` value is a no-op (see
  // the idempotency guard in progress.rs), so a caller can't add a note to
  // an already-applied watch by calling this again.
  async toggleMovieSeen(movie: MediaSummary, watched: boolean, watchedAt = nowIso(), note?: string): Promise<void> {
    await invokeCommand<void>("toggle_movie_seen", { movie, watched, watchedAt, note: note ?? null });
  },

  async getEpisodeProgress(seriesId: number): Promise<EpisodeProgress[]> {
    return invokeCommand<EpisodeProgress[]>("get_episode_progress", { seriesId });
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
    return invokeCommand<number>("toggle_episodes_watched", {
      series,
      episodes,
      watched,
      watchedAt,
      history: history ?? null,
      note: note ?? null,
    });
  },

  async markSeason(series: SeriesInput, season: Season, watched: boolean): Promise<void> {
    await this.toggleEpisodesWatched(series, season.episodes, watched, nowIso(), {
      action: watched ? "season:watched" : "season:unwatched",
      seasonNumber: season.seasonNumber,
    });
  },

  async markSeries(series: SeriesInput, seasons: Season[], watched: boolean): Promise<void> {
    const episodes = seasons.flatMap((season) => season.episodes);
    await this.toggleEpisodesWatched(series, episodes, watched, nowIso(), {
      action: watched ? "series:watched" : "series:unwatched",
    });
  },

  async listTrackedSeries(): Promise<TrackedSeriesItem[]> {
    return invokeCommand<TrackedSeriesItem[]>("list_tracked_series");
  },

  // A no-op in Rust if the series isn't tracked yet or the status hasn't
  // actually changed — see refresh_tracked_series_status_impl.
  async refreshTrackedSeriesStatus(seriesId: number, status: string | null): Promise<void> {
    await invokeCommand<void>("refresh_tracked_series_status", { seriesId, status });
  },

  // One title's full watch history (every viewing_events row, most recent
  // first), notes included where one was written — see
  // list_viewing_events_for_media in src-tauri/src/commands/stats.rs.
  async listViewingEventsForMedia(mediaId: number, mediaType: MediaType): Promise<ViewingEventNote[]> {
    return invokeCommand<ViewingEventNote[]>("list_viewing_events_for_media", { mediaId, mediaType });
  },
};
