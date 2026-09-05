import { useQuery, type QueryKey } from "@tanstack/react-query";
import { progressRepository } from "@/features/progress/progress-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import type { Episode, MediaSummary, MediaType, Season } from "@/types/media";

// Pure display-progress math over already-fetched data — re-exported here
// (rather than importing progress-utils.ts directly) so this feature's
// public surface stays the repository/hook files, per the convention
// check-feature-boundaries.mjs enforces.
export { calculateSeriesProgress, getNextEpisode } from "@/features/progress/progress-utils";

export function useMovieSeen(movieId: number) {
  const profileId = useActiveProfileId();
  const query = useQuery({
    queryKey: queryKeys.local.movieSeen(profileId, movieId),
    queryFn: () => progressRepository.isMovieSeen(movieId),
    enabled: Number.isFinite(movieId),
  });

  const mutation = useInvalidatingMutation(
    ({ movie, watched, note }: { movie: MediaSummary; watched: boolean; note?: string }) =>
      progressRepository.toggleMovieSeen(movie, watched, undefined, note),
    (_data, variables) => [
      queryKeys.local.movieSeen(profileId, variables.movie.id),
      queryKeys.local.history(profileId),
      queryKeys.local.stats(profileId),
      queryKeys.local.viewingEventsForMedia(profileId, "movie", variables.movie.id),
      // Marking a movie seen can auto-complete an existing library entry
      // (see auto_sync_status_impl in src-tauri/src/commands/library.rs).
      queryKeys.local.library(profileId),
      queryKeys.local.libraryPage(profileId),
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
    queryKeys.local.viewingEventsForMedia(profileId, "series", seriesId),
    // Watching an episode can auto-start/complete an existing library entry
    // (see auto_sync_status_impl in src-tauri/src/commands/library.rs).
    queryKeys.local.library(profileId),
    queryKeys.local.libraryPage(profileId),
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
      note,
    }: {
      series: MediaSummary & { numberOfEpisodes?: number };
      episode: Episode;
      watched: boolean;
      note?: string;
    }) => progressRepository.toggleEpisodeSeen(series, episode, watched, note),
    (_data, variables) => episodeProgressKeys(profileId, variables.series.id)
  );

  // Catch-up path for useEpisodeSeenBacklogPrompt's "this one and the
  // previous ones" choice — a bulk toggle-to-watched over an arbitrary
  // episode subset, logged under the same history shape a single-episode
  // toggle would use (see toggleEpisodeSeen above), just naming the
  // triggering episode rather than every episode it caught up.
  const markManyMutation = useInvalidatingMutation(
    ({
      series,
      episodes,
      target,
    }: {
      series: MediaSummary & { numberOfEpisodes?: number };
      episodes: Episode[];
      target: Episode;
    }) =>
      progressRepository.toggleEpisodesWatched(series, episodes, true, undefined, {
        action: "episode:watched",
        seasonNumber: target.seasonNumber,
        episodeNumber: target.episodeNumber,
        episodeTitle: target.title,
      }),
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
    markEpisodesSeen: markManyMutation.mutateAsync,
    markSeasonSeen: seasonMutation.mutateAsync,
    markSeriesSeen: seriesMutation.mutateAsync,
    isSaving:
      toggleMutation.isPending || markManyMutation.isPending || seasonMutation.isPending || seriesMutation.isPending,
  };
}

// A title's own watch diary — every viewing_events row for it, most recent
// first, with whatever per-watch note was written at the time (see
// listViewingEventsForMedia). Invalidated alongside movieSeen/
// episodeProgress above, since a note is only ever written in the same
// transaction as the watched-state toggle that produced it.
export function useViewingEventsForMedia(mediaId: number, mediaType: MediaType) {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: queryKeys.local.viewingEventsForMedia(profileId, mediaType, mediaId),
    queryFn: () => progressRepository.listViewingEventsForMedia(mediaId, mediaType),
    enabled: Number.isFinite(mediaId),
  });
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
