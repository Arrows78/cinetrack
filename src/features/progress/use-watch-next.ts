import { useQueries } from "@tanstack/react-query";
import { mediaRepository } from "@/features/media/media-repository";
import { episodeProgressKeys } from "@/features/progress/use-progress";
import { progressRepository } from "@/features/progress/progress-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
import { STALE_30_MIN } from "@/shared/constants/query";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import type { Episode, MediaSummary, TrackedSeriesItem } from "@/types/media";

export interface WatchNextEntry {
  series: TrackedSeriesItem;
  nextEpisode: Episode;
  remaining: number;
}

// One per input series, always — unlike WatchNextEntry (only the resolved
// ones), this is what lets a list render a row for every series it was
// given instead of ones with a resolved episode silently vanishing.
export interface NextEpisodeResult {
  series: TrackedSeriesItem;
  nextEpisode: Episode | null;
  remaining: number;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Resolves the next unwatched, already-aired episode of a series with at
 * most two season fetches: local progress tells us where the viewer
 * stopped, so only the season in progress (and the following one, for a
 * season boundary) needs episode data.
 */
async function resolveNextEpisode(seriesId: number): Promise<Episode | null> {
  const [details, progress] = await Promise.all([
    mediaRepository.getSeriesDetails(seriesId),
    progressRepository.getEpisodeProgress(seriesId),
  ]);

  const watched = progress
    .filter((item) => item.watched)
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
  const last = watched.length ? watched[watched.length - 1] : undefined;

  const seasonNumbers = (details.seasons ?? [])
    .map((season) => season.seasonNumber)
    .filter((seasonNumber) => seasonNumber > 0)
    .sort((a, b) => a - b);
  const candidates = last
    ? seasonNumbers.filter((seasonNumber) => seasonNumber >= last.seasonNumber).slice(0, 2)
    : seasonNumbers.slice(0, 1);
  if (!candidates.length) return null;

  const seasons = await Promise.all(
    candidates.map((seasonNumber) => mediaRepository.getSeasonDetails(seriesId, seasonNumber))
  );
  return progressRepository.getNextEpisode(seasons, progress);
}

/**
 * Resolves the next episode for an arbitrary list of series — shared by
 * useWatchNext (home page, capped to a handful of in-progress shows) and the
 * library page's Series view (uncapped, and also used for shows that
 * haven't been started at all: resolveNextEpisode already handles a series
 * with zero watched episodes by resolving its first one).
 */
export function useNextEpisodes(seriesList: TrackedSeriesItem[]) {
  const profileId = useActiveProfileId();
  const queries = useQueries({
    queries: seriesList.map((series) => ({
      queryKey: queryKeys.local.watchNextEpisode(profileId, series.seriesId),
      queryFn: () => resolveNextEpisode(series.seriesId),
      staleTime: STALE_30_MIN,
    })),
  });

  const results: NextEpisodeResult[] = seriesList.map((series, index) => ({
    series,
    nextEpisode: queries[index]?.data ?? null,
    remaining: Math.max(0, series.totalEpisodes - series.watchedEpisodes),
    isLoading: queries[index]?.isLoading ?? false,
    isError: queries[index]?.isError ?? false,
  }));

  const entries: WatchNextEntry[] = results
    .filter((result) => result.nextEpisode !== null)
    .map(({ series, nextEpisode, remaining }) => ({ series, nextEpisode: nextEpisode!, remaining }));

  return { entries, results, isLoading: queries.some((query) => query.isLoading) };
}

export function useWatchNext(trackedSeries: TrackedSeriesItem[], limit = 6) {
  const inProgress = trackedSeries
    .filter((item) => item.watchedEpisodes > 0 && item.watchedEpisodes < item.totalEpisodes)
    .slice(0, limit);
  return useNextEpisodes(inProgress);
}

export function useMarkWatchNext() {
  const profileId = useActiveProfileId();
  const mutation = useInvalidatingMutation(
    ({ series, episode }: { series: TrackedSeriesItem; episode: Episode }) => {
      const summary: MediaSummary & { numberOfEpisodes?: number } = {
        id: series.seriesId,
        mediaType: "series",
        title: series.title,
        overview: "",
        posterPath: series.posterPath,
        backdropPath: series.backdropPath,
        year: null,
        rating: null,
        genres: [],
        cast: [],
        numberOfEpisodes: series.totalEpisodes,
      };
      return progressRepository.toggleEpisodeSeen(summary, episode, true);
    },
    (_data, variables) => episodeProgressKeys(profileId, variables.series.seriesId)
  );

  return { markWatched: mutation.mutateAsync, isSaving: mutation.isPending };
}
