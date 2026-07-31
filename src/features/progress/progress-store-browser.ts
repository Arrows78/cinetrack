import { browserStore } from "@/db/client";
import { historyRepository } from "@/features/history/history-repository";
import type { ProgressStore, SeriesInput } from "./progress-store";
import type { Episode, EpisodeProgress, MediaSummary, TrackedSeriesItem } from "@/types/media";

const uid = () => crypto.randomUUID();
const storedProfile = (item: { profileId?: string }) => item.profileId ?? "default";

export const browserProgressStore: ProgressStore = {
  async isMovieSeen(profile: string, movieId: number): Promise<boolean> {
    return browserStore.read().seenMovies.some((item) => storedProfile(item) === profile && item.movieId === movieId);
  },

  async toggleMovieSeen(profile: string, movie: MediaSummary, watched: boolean, watchedAt: string): Promise<void> {
    const store = browserStore.read();
    const keep = store.seenMovies.filter((item) => !(storedProfile(item) === profile && item.movieId === movie.id));
    store.seenMovies = watched
      ? [
          {
            profileId: profile,
            movieId: movie.id,
            title: movie.title,
            posterPath: movie.posterPath,
            backdropPath: movie.backdropPath,
            watchedAt,
          },
          ...keep,
        ]
      : keep;
    store.viewingEvents.unshift({
      id: uid(),
      profileId: profile,
      mediaId: movie.id,
      mediaType: "movie",
      title: movie.title,
      eventType: watched ? "watched" : "unwatched",
      watchedAt,
      durationMinutes: movie.runtime ?? null,
    });
    browserStore.write(store);
    await historyRepository.add({
      id: uid(),
      mediaId: movie.id,
      mediaType: "movie",
      title: movie.title,
      action: watched ? "movie:watched" : "movie:unwatched",
      timestamp: watchedAt,
      metadata: { profileId: profile },
    });
  },

  async getEpisodeProgress(profile: string, seriesId: number): Promise<EpisodeProgress[]> {
    return browserStore
      .read()
      .episodeProgress.filter((item) => storedProfile(item) === profile && item.seriesId === seriesId && item.watched);
  },

  async applyEpisodes(
    profile: string,
    series: SeriesInput,
    episodes: Episode[],
    watched: boolean,
    watchedAt: string
  ): Promise<number> {
    const store = browserStore.read();
    const watchedIds = new Set(
      store.episodeProgress
        .filter((item) => storedProfile(item) === profile && item.seriesId === series.id && item.watched)
        .map((item) => item.episodeId)
    );
    const changedEpisodes = episodes.filter((episode) =>
      watched ? !watchedIds.has(episode.id) : watchedIds.has(episode.id)
    );
    if (!changedEpisodes.length) return 0;
    const ids = new Set(changedEpisodes.map((episode) => episode.id));
    store.episodeProgress = store.episodeProgress.filter(
      (item) => !(storedProfile(item) === profile && item.seriesId === series.id && ids.has(item.episodeId))
    );
    if (watched)
      store.episodeProgress.push(
        ...changedEpisodes.map((episode) => ({
          profileId: profile,
          seriesId: series.id,
          episodeId: episode.id,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          watched: true,
          watchedAt,
        }))
      );
    const watchedEpisodes = store.episodeProgress.filter(
      (item) => storedProfile(item) === profile && item.seriesId === series.id && item.watched
    ).length;
    store.trackedSeries = [
      {
        profileId: profile,
        seriesId: series.id,
        title: series.title,
        posterPath: series.posterPath,
        backdropPath: series.backdropPath,
        totalEpisodes: series.numberOfEpisodes ?? watchedEpisodes,
        watchedEpisodes,
        updatedAt: watchedAt,
      },
      ...store.trackedSeries.filter((item) => !(storedProfile(item) === profile && item.seriesId === series.id)),
    ];
    store.viewingEvents.unshift(
      ...changedEpisodes.map((episode) => ({
        id: uid(),
        profileId: profile,
        mediaId: series.id,
        mediaType: "series" as const,
        title: series.title,
        eventType: watched ? ("watched" as const) : ("unwatched" as const),
        watchedAt,
        durationMinutes: episode.runtime ?? series.runtime ?? null,
        episodeId: episode.id,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
      }))
    );
    browserStore.write(store);
    return changedEpisodes.length;
  },

  async listTrackedSeries(profile: string): Promise<TrackedSeriesItem[]> {
    return browserStore
      .read()
      .trackedSeries.filter((item) => storedProfile(item) === profile)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
};
