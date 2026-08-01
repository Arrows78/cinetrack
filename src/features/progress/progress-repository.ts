import { percent } from "@/shared/utils/format";
import type { Episode, EpisodeProgress, MediaSummary, SeriesProgress, Season, TrackedSeriesItem } from "@/types/media";
import { invokeCommand } from "@/shared/lib/invoke";
import { newUuid } from "@/shared/lib/id";
import { historyRepository } from "@/features/history/history-repository";
import { preferencesRepository } from "@/features/preferences/preferences-repository";

const nowIso = () => new Date().toISOString();
const uid = newUuid;

export type SeriesInput = MediaSummary & { numberOfEpisodes?: number };

async function profileId() {
  return (await preferencesRepository.getPreferences()).activeProfileId;
}

// The seen_movies/episode_progress/tracked_series/viewing_events writes now
// live in Rust (see src-tauri/src/commands/progress.rs) — this repository is
// a thin invoke() wrapper around them, plus the history logging that was
// already a separate step from the SQL transaction for episode-based
// actions (see apply_episodes_impl's doc comment for why movie toggles log
// history atomically in Rust while episode/season/series toggles log it
// here, one level up — matching the original split). getNextEpisode/
// calculateSeriesProgress are pure computations over already-fetched data
// and stay in TS.
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
    const watchedAt = nowIso();
    const profile = await profileId();
    const changed = await this.applyEpisodes(series, [episode], watched, watchedAt);
    if (changed > 0) {
      await historyRepository.add({
        id: uid(),
        mediaId: series.id,
        mediaType: "series",
        title: series.title,
        action: watched ? "episode:watched" : "episode:unwatched",
        timestamp: watchedAt,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        episodeTitle: episode.title,
        metadata: { profileId: profile },
      });
    }
  },

  async applyEpisodes(
    series: SeriesInput,
    episodes: Episode[],
    watched: boolean,
    watchedAt = nowIso()
  ): Promise<number> {
    return invokeCommand<number>("apply_episodes", { series, episodes, watched, watchedAt });
  },

  async markSeason(series: SeriesInput, season: Season, watched: boolean): Promise<void> {
    const timestamp = nowIso();
    const profile = await profileId();
    const changed = await this.applyEpisodes(series, season.episodes, watched, timestamp);
    if (changed > 0) {
      await historyRepository.add({
        id: uid(),
        mediaId: series.id,
        mediaType: "series",
        title: series.title,
        action: watched ? "season:watched" : "season:unwatched",
        timestamp,
        seasonNumber: season.seasonNumber,
        metadata: { episodeCount: changed, profileId: profile },
      });
    }
  },

  async markSeries(series: SeriesInput, seasons: Season[], watched: boolean): Promise<void> {
    const timestamp = nowIso();
    const profile = await profileId();
    const episodes = seasons.flatMap((season) => season.episodes);
    const changed = await this.applyEpisodes(series, episodes, watched, timestamp);
    if (changed > 0) {
      await historyRepository.add({
        id: uid(),
        mediaId: series.id,
        mediaType: "series",
        title: series.title,
        action: watched ? "series:watched" : "series:unwatched",
        timestamp,
        metadata: { episodeCount: changed, profileId: profile },
      });
    }
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
