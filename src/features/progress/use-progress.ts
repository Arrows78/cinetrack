import { useQuery, type QueryKey } from "@tanstack/react-query";
import { progressRepository } from "@/features/progress/progress-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import type { Episode, MediaSummary, Season } from "@/types/media";

export function useMovieSeen(movieId: number) {
  const query = useQuery({
    queryKey: queryKeys.local.movieSeen(movieId),
    queryFn: () => progressRepository.isMovieSeen(movieId),
    enabled: Number.isFinite(movieId),
  });

  const mutation = useInvalidatingMutation(
    ({ movie, watched }: { movie: MediaSummary; watched: boolean }) =>
      progressRepository.toggleMovieSeen(movie, watched),
    (_data, variables) => [
      queryKeys.local.movieSeen(variables.movie.id),
      queryKeys.local.history,
      queryKeys.local.stats,
    ]
  );

  return {
    ...query,
    toggleMovieSeen: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}

export function episodeProgressKeys(seriesId: number): QueryKey[] {
  return [
    queryKeys.local.episodeProgress(seriesId),
    queryKeys.local.watchNextEpisode(seriesId),
    queryKeys.local.history,
    queryKeys.local.trackedSeries,
    queryKeys.local.stats,
    queryKeys.local.calendar,
  ];
}

export function useEpisodeProgress(seriesId: number) {
  const query = useQuery({
    queryKey: queryKeys.local.episodeProgress(seriesId),
    queryFn: () => progressRepository.getEpisodeProgress(seriesId),
    enabled: Number.isFinite(seriesId),
  });

  const toggleMutation = useInvalidatingMutation(
    ({
      series,
      episode,
      watched,
    }: {
      series: MediaSummary & { numberOfEpisodes?: number };
      episode: Episode;
      watched: boolean;
    }) => progressRepository.toggleEpisodeSeen(series, episode, watched),
    (_data, variables) => episodeProgressKeys(variables.series.id)
  );

  const seasonMutation = useInvalidatingMutation(
    ({
      series,
      season,
      watched,
    }: {
      series: MediaSummary & { numberOfEpisodes?: number };
      season: Season;
      watched: boolean;
    }) => progressRepository.markSeason(series, season, watched),
    (_data, variables) => episodeProgressKeys(variables.series.id)
  );

  const seriesMutation = useInvalidatingMutation(
    ({
      series,
      seasons,
      watched,
    }: {
      series: MediaSummary & { numberOfEpisodes?: number };
      seasons: Season[];
      watched: boolean;
    }) => progressRepository.markSeries(series, seasons, watched),
    (_data, variables) => episodeProgressKeys(variables.series.id)
  );

  return {
    ...query,
    toggleEpisodeSeen: toggleMutation.mutateAsync,
    markSeasonSeen: seasonMutation.mutateAsync,
    markSeriesSeen: seriesMutation.mutateAsync,
    isSaving: toggleMutation.isPending || seasonMutation.isPending || seriesMutation.isPending,
  };
}

export function useTrackedSeries() {
  return useQuery({
    queryKey: queryKeys.local.trackedSeries,
    queryFn: () => progressRepository.listTrackedSeries(),
  });
}
