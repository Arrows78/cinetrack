import { percent } from "@/shared/utils/format";
import type { Episode, EpisodeProgress, Season, SeriesProgress } from "@/types/media";

// An episode with no air date at all is treated as already aired (TMDB
// sometimes omits it for older/obscure entries) — matches every other
// air-date check in the app (episode-card.tsx's own single-episode guard,
// getNextEpisode below).
export function hasAired(episode: Episode): boolean {
  return !episode.airDate || new Date(episode.airDate) <= new Date();
}

export function getNextEpisode(seasons: Season[], watched: EpisodeProgress[]): Episode | null {
  const watchedIds = new Set(watched.filter((item) => item.watched).map((item) => item.episodeId));
  return (
    seasons
      .slice()
      .sort((a, b) => a.seasonNumber - b.seasonNumber)
      .flatMap((season) => season.episodes.slice().sort((a, b) => a.episodeNumber - b.episodeNumber))
      .find((episode) => !watchedIds.has(episode.id) && hasAired(episode)) ?? null
  );
}

export function calculateSeriesProgress(
  seriesId: number,
  seasons: Season[],
  watched: EpisodeProgress[]
): SeriesProgress {
  const watchedSet = new Set(watched.filter((item) => item.watched).map((item) => item.episodeId));
  const progressBySeason = seasons.map((season) => {
    const airedEpisodes = season.episodes.filter(hasAired);
    const watchedEpisodes = airedEpisodes.filter((episode) => watchedSet.has(episode.id)).length;
    return {
      seasonNumber: season.seasonNumber,
      totalEpisodes: airedEpisodes.length,
      watchedEpisodes,
      progressPercent: percent(watchedEpisodes, airedEpisodes.length),
    };
  });
  // Deliberately every known episode (including future/unaired ones TMDB
  // has already announced) — see `completed` below, which needs that
  // distinction from `isUpToDate`.
  const totalEpisodes = seasons.reduce((sum, season) => sum + season.episodes.length, 0);
  const airedEpisodes = seasons.flatMap((season) => season.episodes).filter(hasAired);
  const totalAiredEpisodes = airedEpisodes.length;
  const watchedEpisodes = airedEpisodes.filter((episode) => watchedSet.has(episode.id)).length;
  const completed = totalEpisodes > 0 && watchedEpisodes === totalEpisodes;
  // "Up to date" (caught up but still ongoing) is distinct from `completed`:
  // completed requires every known episode watched, including future/
  // unaired ones TMDB has already announced, which for an ongoing show
  // basically never happens. Up to date only requires nothing currently
  // aired and unwatched to be left — getNextEpisode returning null already
  // means exactly that.
  const isUpToDate = !completed && getNextEpisode(seasons, watched) === null;
  return {
    seriesId,
    // The fraction/percentage shown to the user is against what's actually
    // aired, not TMDB's full announced total (which would count episodes
    // that haven't come out yet as "missing"). `completed` above is the
    // one place the full total still matters.
    totalEpisodes: totalAiredEpisodes,
    watchedEpisodes,
    seasons: progressBySeason,
    progressPercent: percent(watchedEpisodes, totalAiredEpisodes),
    completed,
    isUpToDate,
  };
}
