import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { progressRepository } from "@/features/progress/progress-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { invalidationKeys } from "@/shared/constants/invalidation";
import { queryKeys } from "@/shared/constants/query-keys";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import type { Episode, MediaSummary, MediaType, Season } from "@/types/media";

// Pure display-progress math over already-fetched data — re-exported here
// (rather than importing progress-utils.ts directly) so this feature's
// public surface stays the repository/hook files, per the convention
// check-feature-boundaries.mjs enforces.
export {
  airedEpisodes,
  calculateSeriesProgress,
  episodeProgressHasUserData,
  getNextEpisode,
  hasAired,
} from "@/features/progress/progress-utils";

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
    // Marking a movie seen can auto-complete an existing library entry (see
    // docs/library-status.md), so the movie's domain includes the library's:
    // the home "people you watch"/"because you liked" rails read
    // libraryMediaKeys/completedLibraryCandidates/bestRecommendationSeed.
    (_data, variables) => invalidationKeys.movieWatch(profileId, variables.movie.id)
  );

  // "Watch again": a rewatch changes the rewatch statistics, the library
  // entry's rewatch count and this movie's diary — not its seen state.
  const rewatchMutation = useInvalidatingMutation(
    ({ movie, note }: { movie: MediaSummary; note?: string }) =>
      progressRepository.rewatchMovie(movie, undefined, note),
    (_data, variables) => invalidationKeys.movieWatch(profileId, variables.movie.id)
  );

  return {
    ...query,
    toggleMovieSeen: mutation.mutateAsync,
    rewatchMovie: rewatchMutation.mutateAsync,
    isSaving: mutation.isPending || rewatchMutation.isPending,
  };
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
    (_data, variables) => invalidationKeys.progress(profileId, variables.series.id)
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
    (_data, variables) => invalidationKeys.progress(profileId, variables.series.id)
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
    (_data, variables) => invalidationKeys.progress(profileId, variables.series.id)
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
    (_data, variables) => invalidationKeys.progress(profileId, variables.series.id)
  );

  // Kept separate from isSaving below: rating an episode shouldn't disable
  // the seen toggle (or vice versa) — they're independent controls.
  const ratingMutation = useInvalidatingMutation(
    ({ seriesId, episodeId, rating }: { seriesId: number; episodeId: number; rating: number | null }) =>
      progressRepository.setEpisodeRating(seriesId, episodeId, rating),
    (_data, variables) => invalidationKeys.progress(profileId, variables.seriesId)
  );

  return {
    ...query,
    toggleEpisodeSeen: toggleMutation.mutateAsync,
    markEpisodesSeen: markManyMutation.mutateAsync,
    markSeasonSeen: seasonMutation.mutateAsync,
    markSeriesSeen: seriesMutation.mutateAsync,
    setEpisodeRating: ratingMutation.mutateAsync,
    isSavingRating: ratingMutation.isPending,
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
    ({ seriesId, status, totalEpisodes }: { seriesId: number; status: string | null; totalEpisodes?: number | null }) =>
      progressRepository.refreshTrackedSeriesStatus(seriesId, status, totalEpisodes ?? null),
    // A larger total can reopen an auto-Completed library entry in Rust.
    () => invalidationKeys.trackedSeries(profileId)
  );
  return mutation.mutateAsync;
}

export interface TrackedSeriesRefresh {
  seriesId: number;
  status: string | null;
  /** TMDB's episode count, `null` when it gave none (the cached total is then left as it is). */
  totalEpisodes: number | null;
  /**
   * Whether this refresh moves the cached status or total away from what the
   * caller read. A pass in which no refresh does leaves every cache as it
   * was, so nothing is invalidated.
   */
  changesCache: boolean;
}

/**
 * Batch form of useRefreshTrackedSeriesStatus for the Today Hub, which can
 * refresh dozens of series at once: one call to Rust for all of them, and one
 * invalidation pass afterwards — only if some cached value really moved, and
 * only of what a status move can change (not the whole library feed).
 * Resolves to the ids whose refresh failed (already logged by Rust; the
 * caller decides what else to do with them).
 */
export function useRefreshTrackedSeriesBatch() {
  const profileId = useActiveProfileId();
  const queryClient = useQueryClient();
  return useCallback(
    async (refreshes: TrackedSeriesRefresh[]): Promise<number[]> => {
      const failed = await progressRepository.refreshTrackedSeriesStatuses(
        refreshes.map(({ seriesId, status, totalEpisodes }) => ({ seriesId, status, totalEpisodes }))
      );
      const moved = refreshes.some(({ seriesId, changesCache }) => changesCache && !failed.includes(seriesId));
      if (moved) {
        const keys = [queryKeys.local.trackedSeries(profileId), ...invalidationKeys.libraryStatus(profileId)];
        await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      }
      return failed;
    },
    [profileId, queryClient]
  );
}
