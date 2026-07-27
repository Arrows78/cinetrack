import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { historyRepository } from "@/services/local/history-repository";
import { preferencesRepository } from "@/services/local/preferences-repository";
import { progressRepository } from "@/services/local/progress-repository";
import { watchlistRepository } from "@/services/local/watchlist-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import type { Episode, MediaSummary, Season, UserPreferences, WatchlistItem } from "@/types/media";

export function usePreferences() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.local.preferences,
    queryFn: () => preferencesRepository.getPreferences(),
  });

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: keyof UserPreferences; value: UserPreferences[keyof UserPreferences] }) =>
      preferencesRepository.updatePreference(key as never, value as never),
    onSuccess: async (data, variables) => {
      queryClient.setQueryData(queryKeys.local.preferences, data);

      if (variables.key === "activeProfileId") {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["local"] }),
          queryClient.invalidateQueries({ queryKey: queryKeys.local.watchTonight }),
        ]);
      }

      if (variables.key === "language" || variables.key === "region") {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["remote"] }),
          queryClient.invalidateQueries({ queryKey: queryKeys.local.calendar }),
        ]);
      }
    },
  });

  return {
    ...query,
    updatePreference: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}

export function useWatchlist() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.local.watchlist,
    queryFn: () => watchlistRepository.list(),
  });

  const add = useMutation({
    mutationFn: (item: WatchlistItem) => watchlistRepository.upsert(item),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.local.watchlist }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.history }),
      ]);
    },
  });

  const remove = useMutation({
    mutationFn: ({ mediaId, mediaType }: { mediaId: number; mediaType: WatchlistItem["mediaType"] }) =>
      watchlistRepository.remove(mediaId, mediaType),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.local.watchlist }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.history }),
      ]);
    },
  });

  return {
    ...query,
    addToWatchlist: add.mutateAsync,
    removeFromWatchlist: remove.mutateAsync,
    isMutating: add.isPending || remove.isPending,
  };
}

export function useIsInWatchlist(mediaId: number, mediaType: WatchlistItem["mediaType"]) {
  return useQuery({
    queryKey: [...queryKeys.local.watchlist, "has", mediaId, mediaType],
    queryFn: () => watchlistRepository.has(mediaId, mediaType),
  });
}

export function useHistory() {
  return useQuery({
    queryKey: queryKeys.local.history,
    queryFn: () => historyRepository.list(),
  });
}

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

function invalidateEpisodeQueries(queryClient: QueryClient, seriesId: number) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.local.episodeProgress(seriesId) }),
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
