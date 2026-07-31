import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { progressRepository } from "@/features/progress/progress-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import type { Episode, MediaSummary, Season } from "@/types/media";

export function useMovieSeen(movieId: number) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.local.movieSeen(movieId),
    queryFn: () => progressRepository.isMovieSeen(movieId),
    enabled: Number.isFinite(movieId),
  });

  const mutation = useMutation({
    mutationFn: ({ movie, watched }: { movie: MediaSummary; watched: boolean }) =>
      progressRepository.toggleMovieSeen(movie, watched),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.local.movieSeen(variables.movie.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.history }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.stats }),
      ]);
    },
  });

  return {
    ...query,
    toggleMovieSeen: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}

export function invalidateEpisodeQueries(queryClient: QueryClient, seriesId: number) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.local.episodeProgress(seriesId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.local.watchNextEpisode(seriesId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.local.history }),
    queryClient.invalidateQueries({ queryKey: queryKeys.local.trackedSeries }),
    queryClient.invalidateQueries({ queryKey: queryKeys.local.stats }),
    queryClient.invalidateQueries({ queryKey: queryKeys.local.calendar }),
  ]);
}

export function useEpisodeProgress(seriesId: number) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.local.episodeProgress(seriesId),
    queryFn: () => progressRepository.getEpisodeProgress(seriesId),
    enabled: Number.isFinite(seriesId),
  });

  const toggleMutation = useMutation({
    mutationFn: ({
      series,
      episode,
      watched,
    }: {
      series: MediaSummary & { numberOfEpisodes?: number };
      episode: Episode;
      watched: boolean;
    }) => progressRepository.toggleEpisodeSeen(series, episode, watched),
    onSuccess: (_, variables) => invalidateEpisodeQueries(queryClient, variables.series.id),
  });

  const seasonMutation = useMutation({
    mutationFn: ({
      series,
      season,
      watched,
    }: {
      series: MediaSummary & { numberOfEpisodes?: number };
      season: Season;
      watched: boolean;
    }) => progressRepository.markSeason(series, season, watched),
    onSuccess: (_, variables) => invalidateEpisodeQueries(queryClient, variables.series.id),
  });

  const seriesMutation = useMutation({
    mutationFn: ({
      series,
      seasons,
      watched,
    }: {
      series: MediaSummary & { numberOfEpisodes?: number };
      seasons: Season[];
      watched: boolean;
    }) => progressRepository.markSeries(series, seasons, watched),
    onSuccess: (_, variables) => invalidateEpisodeQueries(queryClient, variables.series.id),
  });

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
