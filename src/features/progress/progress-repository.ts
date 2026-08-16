import { percent } from "@/shared/utils/format";
import type {
  Episode,
  EpisodeProgress,
  HistoryAction,
  MediaSummary,
  SeriesProgress,
  Season,
  TrackedSeriesItem,
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
// already-fetched data and stay in TS.
export const progressRepository = {
  async isMovieSeen(movieId: number): Promise<boolean> {
    return invokeCommand<boolean>("is_movie_seen", { movieId });
  },

  async toggleMovieSeen(movie: MediaSummary, watched: boolean, watchedAt = nowIso()): Promise<void> {
    await invokeCommand<void>("toggle_movie_seen", { movie, watched, watchedAt });
  },

  async getEpisodeProgress(seriesId: number): Promise<EpisodeProgress[]> {
    return invokeCommand<EpisodeProgress[]>("get_episode_progress", { seriesId });
  },

  async toggleEpisodeSeen(series: SeriesInput, episode: Episode, watched: boolean): Promise<void> {
    await this.toggleEpisodesWatched(series, [episode], watched, nowIso(), {
      action: watched ? "episode:watched" : "episode:unwatched",
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      episodeTitle: episode.title,
    });
  },

  async toggleEpisodesWatched(
    series: SeriesInput,
    episodes: Episode[],
    watched: boolean,
    watchedAt = nowIso(),
    history?: EpisodeHistoryInput
  ): Promise<number> {
    return invokeCommand<number>("toggle_episodes_watched", {
      series,
      episodes,
      watched,
      watchedAt,
      history: history ?? null,
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

  getNextEpisode(seasons: Season[], watched: EpisodeProgress[]): Episode | null {
    const watchedIds = new Set(watched.filter((item) => item.watched).map((item) => item.episodeId));
    return (
      seasons
        .slice()
        .sort((a, b) => a.seasonNumber - b.seasonNumber)
        .flatMap((season) => season.episodes.slice().sort((a, b) => a.episodeNumber - b.episodeNumber))
        .find(
          (episode) => !watchedIds.has(episode.id) && (!episode.airDate || new Date(episode.airDate) <= new Date())
        ) ?? null
    );
  },

  calculateSeriesProgress(seriesId: number, seasons: Season[], watched: EpisodeProgress[]): SeriesProgress {
    const watchedSet = new Set(watched.filter((item) => item.watched).map((item) => item.episodeId));
    const progressBySeason = seasons.map((season) => {
      const watchedEpisodes = season.episodes.filter((episode) => watchedSet.has(episode.id)).length;
      return {
        seasonNumber: season.seasonNumber,
        totalEpisodes: season.episodes.length,
        watchedEpisodes,
        progressPercent: percent(watchedEpisodes, season.episodes.length),
      };
    });
    const totalEpisodes = seasons.reduce((sum, season) => sum + season.episodes.length, 0);
    const watchedEpisodes = seasons
      .flatMap((season) => season.episodes)
      .filter((episode) => watchedSet.has(episode.id)).length;
    return {
      seriesId,
      totalEpisodes,
      watchedEpisodes,
      seasons: progressBySeason,
      progressPercent: percent(watchedEpisodes, totalEpisodes),
      completed: totalEpisodes > 0 && watchedEpisodes === totalEpisodes,
    };
  },
};
