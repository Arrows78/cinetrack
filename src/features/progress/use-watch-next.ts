import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { mediaRepository } from "@/features/media/media-repository";
import { invalidateEpisodeQueries } from "@/features/progress/use-progress";
import { progressRepository } from "@/features/progress/progress-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import type { Episode, MediaSummary, TrackedSeriesItem } from "@/types/media";

export interface WatchNextEntry {
  series: TrackedSeriesItem;
  nextEpisode: Episode;
  remaining: number;
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

export function useWatchNext(trackedSeries: TrackedSeriesItem[], limit = 6) {
  const inProgress = trackedSeries
    .filter((item) => item.watchedEpisodes > 0 && item.watchedEpisodes < item.totalEpisodes)
    .slice(0, limit);

  const queries = useQueries({
    queries: inProgress.map((series) => ({
      queryKey: queryKeys.local.watchNextEpisode(series.seriesId),
      queryFn: () => resolveNextEpisode(series.seriesId),
      staleTime: 1000 * 60 * 30,
    })),
  });

  const entries: WatchNextEntry[] = [];
  inProgress.forEach((series, index) => {
    const nextEpisode = queries[index]?.data;
    if (nextEpisode) {
      entries.push({
        series,
        nextEpisode,
        remaining: Math.max(0, series.totalEpisodes - series.watchedEpisodes),
      });
    }
  });

  return { entries, isLoading: queries.some((query) => query.isLoading) };
}

export function useMarkWatchNext() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ series, episode }: { series: TrackedSeriesItem; episode: Episode }) => {
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
    onSuccess: (_, variables) => invalidateEpisodeQueries(queryClient, variables.series.seriesId),
  });

  return { markWatched: mutation.mutateAsync, isSaving: mutation.isPending };
}
