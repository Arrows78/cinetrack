import { percent } from "@/shared/utils/format";
import type { Episode, EpisodeProgress, Season, SeriesProgress } from "@/types/media";

export function getNextEpisode(seasons: Season[], watched: EpisodeProgress[]): Episode | null {
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
}

export function calculateSeriesProgress(
  seriesId: number,
  seasons: Season[],
  watched: EpisodeProgress[]
): SeriesProgress {
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
}
