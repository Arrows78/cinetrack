import { percent } from "@/shared/utils/format";
import type { Episode, EpisodeProgress, MediaSummary, SeriesProgress, Season, TrackedSeriesItem } from "@/types/media";
import { getDatabase } from "@/db/client";
import { historyRepository } from "@/features/history/history-repository";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import { browserProgressStore } from "./progress-store-browser";
import { createSqlProgressStore } from "./progress-store-sql";
import type { ProgressStore, SeriesInput } from "./progress-store";

const nowIso = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

async function profileId() {
  return (await preferencesRepository.getPreferences()).activeProfileId;
}

async function resolveStore(): Promise<ProgressStore> {
  const db = await getDatabase();
  return db ? createSqlProgressStore(db) : browserProgressStore;
}

export const progressRepository = {
  async isMovieSeen(movieId: number) {
    const [profile, store] = await Promise.all([profileId(), resolveStore()]);
    return store.isMovieSeen(profile, movieId);
  },

  async toggleMovieSeen(movie: MediaSummary, watched: boolean, watchedAt = nowIso()) {
    const [profile, store] = await Promise.all([profileId(), resolveStore()]);
    await store.toggleMovieSeen(profile, movie, watched, watchedAt);
  },

  async getEpisodeProgress(seriesId: number): Promise<EpisodeProgress[]> {
    const [profile, store] = await Promise.all([profileId(), resolveStore()]);
    return store.getEpisodeProgress(profile, seriesId);
  },

  async toggleEpisodeSeen(series: SeriesInput, episode: Episode, watched: boolean) {
    const watchedAt = nowIso();
    const profile = await profileId();
    const changed = await this.applyEpisodes(series, [episode], watched, watchedAt, profile);
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
    watchedAt = nowIso(),
    suppliedProfile?: string
  ): Promise<number> {
    const profile = suppliedProfile ?? (await profileId());
    const store = await resolveStore();
    return store.applyEpisodes(profile, series, episodes, watched, watchedAt);
  },

  async markSeason(series: SeriesInput, season: Season, watched: boolean) {
    const timestamp = nowIso();
    const profile = await profileId();
    const changed = await this.applyEpisodes(series, season.episodes, watched, timestamp, profile);
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

  async markSeries(series: SeriesInput, seasons: Season[], watched: boolean) {
    const timestamp = nowIso();
    const profile = await profileId();
    const episodes = seasons.flatMap((season) => season.episodes);
    const changed = await this.applyEpisodes(series, episodes, watched, timestamp, profile);
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
    const [profile, store] = await Promise.all([profileId(), resolveStore()]);
    return store.listTrackedSeries(profile);
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
