import { useQueries } from "@tanstack/react-query";
import type { MediaGridItem } from "@/components/media/primitives/media-grid";
import { useLibrary } from "@/features/library/use-library";
import { buildSmartListEvalContext, matchesSmartListRules } from "@/features/library/smart-list-evaluation";
import { useAvailabilitySnapshots } from "@/features/availability/use-availability-alerts";
import { mediaRepository } from "@/features/media/media-repository";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useTrackedSeries } from "@/features/progress/use-progress";
import { queryKeys } from "@/shared/constants/query-keys";
import { STALE_24_HOURS } from "@/shared/constants/query";
import type { LibraryItem, SmartListRules } from "@/types/media";

function toMediaGridItem(
  item: LibraryItem,
  progressBySeries: Map<number, { watched: number; total: number; seriesStatus?: string | null }>
): MediaGridItem {
  return {
    id: item.mediaId,
    mediaType: item.mediaType,
    title: item.title,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    overview: "",
    year: item.year,
    rating: item.userRating ?? item.rating,
    genres: item.genres,
    cast: [],
    progress: item.mediaType === "series" ? progressBySeries.get(item.mediaId) : undefined,
    alreadySeen: item.mediaType === "movie" && item.status === "completed",
  };
}

/**
 * Evaluates a smart list's rules live against the current library — never a
 * stored/cached list of matching ids, so a title that starts matching next
 * week (a status change, a new rating, a newly-cached availability
 * snapshot) shows up here without anyone editing the smart list. Reuses the
 * exact same library/tracked-series/preferences data LibraryExplorer's own
 * manual filters already load.
 *
 * Lives in components/media/ rather than features/library/ — the library
 * feature owns smart lists themselves (CRUD, see use-smart-lists.ts), but
 * *evaluating* one composes library + progress + availability + media data
 * at once, and no single one of those features may depend on the others
 * (see docs/architecture.md's "Architecture boundaries"). A composition
 * layer above the feature graph is exactly where cross-feature aggregation
 * like this belongs.
 *
 * `rules` is optional so a caller can render "no smart list selected" (pass
 * `undefined`) without a separate early-return branch at every call site.
 */
export function useSmartListMatches(rules: SmartListRules | undefined) {
  const libraryQuery = useLibrary();
  const trackedSeriesQuery = useTrackedSeries();
  const preferencesQuery = usePreferences();
  const snapshotsQuery = useAvailabilitySnapshots();

  const library = libraryQuery.data ?? [];
  const trackedSeries = trackedSeriesQuery.data ?? [];
  const preferredProviderIds = preferencesQuery.data?.preferredProviderIds ?? [];
  const snapshots = snapshotsQuery.data ?? [];

  // maxRuntimeMinutes only ever excludes movies (see
  // matchesSmartListRules's doc comment), so only movies need their runtime
  // resolved, and only when the active rule set actually cares about it —
  // most smart lists never touch this dimension, so this is usually an
  // empty query list.
  const needsRuntime = rules != null && rules.maxRuntimeMinutes != null;
  const movieCandidates = needsRuntime ? library.filter((item) => item.mediaType === "movie") : [];

  const runtimeQueries = useQueries({
    queries: movieCandidates.map((item) => ({
      queryKey: queryKeys.remote.movieDetails(item.mediaId),
      queryFn: () => mediaRepository.getMovieDetails(item.mediaId),
      staleTime: STALE_24_HOURS,
    })),
  });
  const runtimeByMovieId = new Map(
    movieCandidates.map((item, index) => [item.mediaId, runtimeQueries[index]?.data?.runtime ?? null])
  );

  const progressBySeries = new Map(
    trackedSeries.map((series) => [
      series.seriesId,
      { watched: series.watchedEpisodes, total: series.totalEpisodes, seriesStatus: series.status },
    ])
  );

  const items = rules
    ? (() => {
        const context = buildSmartListEvalContext(trackedSeries, preferredProviderIds, snapshots);
        return library
          .filter((item) =>
            matchesSmartListRules(
              item,
              rules,
              context,
              item.mediaType === "movie" ? runtimeByMovieId.get(item.mediaId) : null
            )
          )
          .map((item) => toMediaGridItem(item, progressBySeries));
      })()
    : [];

  const isLoading =
    libraryQuery.isLoading ||
    trackedSeriesQuery.isLoading ||
    preferencesQuery.isLoading ||
    snapshotsQuery.isLoading ||
    (needsRuntime && runtimeQueries.some((query) => query.isLoading));
  const isError = libraryQuery.isError || trackedSeriesQuery.isError || snapshotsQuery.isError;
  const error = libraryQuery.error ?? trackedSeriesQuery.error ?? snapshotsQuery.error;

  return {
    items,
    isLoading,
    isError,
    error,
    refetch: () => {
      void libraryQuery.refetch();
      void trackedSeriesQuery.refetch();
      void snapshotsQuery.refetch();
    },
  };
}
