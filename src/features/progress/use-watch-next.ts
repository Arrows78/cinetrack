import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { mediaRepository } from "@/features/media/media-repository";
import { episodeProgressKeys } from "@/features/progress/use-progress";
import { progressRepository } from "@/features/progress/progress-repository";
import { getNextEpisode } from "@/features/progress/progress-utils";
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
  return getNextEpisode(seasons, progress);
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

// A tracked series' resolved next episode counts as "new" (rather than an
// existing backlog) for this many days after it airs — long enough to cover
// a viewer who doesn't open the app daily, short enough that a show they
// simply haven't touched in months doesn't masquerade as a fresh release.
export const NEW_EPISODE_WINDOW_DAYS = 14;

export interface TodayHubEpisodeGroups {
  /** In-progress series whose resolved next episode aired more than NEW_EPISODE_WINDOW_DAYS ago — an existing backlog, same set useWatchNext already resolves. */
  continueWatching: WatchNextEntry[];
  /** Tracked series never started (0 watched episodes) with a resolved, ready-to-watch next episode. */
  upNext: WatchNextEntry[];
  /** In-progress series whose resolved next episode aired within the last NEW_EPISODE_WINDOW_DAYS — a fresh drop, not backlog. */
  newEpisodes: WatchNextEntry[];
}

/**
 * Splits every tracked series' resolved next episode into the three Today
 * Hub groups, mutually exclusive by construction. Exported separately from
 * useTodayHubEpisodes so the grouping rules are unit-testable without
 * mocking the react-query chain behind useNextEpisodes — same pattern as
 * weekly-agenda-service.ts's selectWeeklyAgendaEntries.
 */
export function partitionNextEpisodes(results: NextEpisodeResult[], now: Date): TodayHubEpisodeGroups {
  const windowMs = NEW_EPISODE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const groups: TodayHubEpisodeGroups = { continueWatching: [], upNext: [], newEpisodes: [] };

  for (const { series, nextEpisode, remaining } of results) {
    if (!nextEpisode) continue;
    const entry: WatchNextEntry = { series, nextEpisode, remaining };

    if (series.watchedEpisodes === 0) {
      groups.upNext.push(entry);
      continue;
    }

    const airedAt = nextEpisode.airDate ? new Date(nextEpisode.airDate).getTime() : null;
    const recentlyAired = airedAt !== null && now.getTime() - airedAt <= windowMs;
    if (recentlyAired) groups.newEpisodes.push(entry);
    else groups.continueWatching.push(entry);
  }

  return groups;
}

/** The Today Hub's "Continuer à regarder" / "À regarder ensuite" / "Nouveaux épisodes" cards, from one shared resolution pass over every tracked series. */
export function useTodayHubEpisodes(
  trackedSeries: TrackedSeriesItem[]
): TodayHubEpisodeGroups & { isLoading: boolean; isError: boolean } {
  const { results, isLoading } = useNextEpisodes(trackedSeries);
  const groups = useMemo(() => partitionNextEpisodes(results, new Date()), [results]);
  return { ...groups, isLoading, isError: results.some((result) => result.isError) };
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
