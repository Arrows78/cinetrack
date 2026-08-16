import { useQuery, type QueryKey } from "@tanstack/react-query";
import { progressRepository } from "@/features/progress/progress-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import type { Episode, MediaSummary, Season } from "@/types/media";

export function useMovieSeen(movieId: number) {
  const profileId = useActiveProfileId();
  const query = useQuery({
    queryKey: queryKeys.local.movieSeen(profileId, movieId),
    queryFn: () => progressRepository.isMovieSeen(movieId),
    enabled: Number.isFinite(movieId),
  });

  const mutation = useInvalidatingMutation(
    ({ movie, watched }: { movie: MediaSummary; watched: boolean }) =>
      progressRepository.toggleMovieSeen(movie, watched),
    (_data, variables) => [
      queryKeys.local.movieSeen(profileId, variables.movie.id),
      queryKeys.local.history(profileId),
      queryKeys.local.stats(profileId),
      // Marking a movie seen can auto-complete an existing library entry
      // (see auto_sync_status_impl in src-tauri/src/commands/library.rs).
      queryKeys.local.library(profileId),
    ]
  );

  return {
    ...query,
    toggleMovieSeen: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}

export function episodeProgressKeys(profileId: string, seriesId: number): QueryKey[] {
  return [
    queryKeys.local.episodeProgress(profileId, seriesId),
    queryKeys.local.watchNextEpisode(profileId, seriesId),
    queryKeys.local.history(profileId),
    queryKeys.local.trackedSeries(profileId),
    queryKeys.local.stats(profileId),
    queryKeys.local.calendar(profileId),
    queryKeys.local.tracking(profileId),
    // Watching an episode can auto-start/complete an existing library entry
    // (see auto_sync_status_impl in src-tauri/src/commands/library.rs).
    queryKeys.local.library(profileId),
  ];
}

export function useEpisodeProgress(seriesId: number) {
  const profileId = useActiveProfileId();
  const query = useQuery({
    queryKey: queryKeys.local.episodeProgress(profileId, seriesId),
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
    (_data, variables) => episodeProgressKeys(profileId, variables.series.id)
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
    (_data, variables) => episodeProgressKeys(profileId, variables.series.id)
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
    (_data, variables) => episodeProgressKeys(profileId, variables.series.id)
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
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: queryKeys.local.trackedSeries(profileId),
    queryFn: () => progressRepository.listTrackedSeries(),
  });
}

export function useRefreshTrackedSeriesStatus() {
  const profileId = useActiveProfileId();
  const mutation = useInvalidatingMutation(
    ({ seriesId, status }: { seriesId: number; status: string | null }) =>
      progressRepository.refreshTrackedSeriesStatus(seriesId, status),
    () => [queryKeys.local.trackedSeries(profileId)]
  );
  return mutation.mutateAsync;
}
