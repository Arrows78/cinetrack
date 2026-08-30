import { useQuery } from "@tanstack/react-query";
import {
  watchTonightService,
  type WatchTonightFilters,
  type WatchTonightPicks,
} from "@/features/watch-tonight/watch-tonight-service";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";

/**
 * Shared Watch Tonight query — the full /watch-tonight page (its own filter
 * state) and the Today Hub's compact teaser (fixed default filters) both
 * call this instead of each declaring their own useQuery, so
 * watch-tonight-service.ts's fetch/candidate-selection logic has one caller
 * pattern to keep working. `seed` isn't a filter (see WatchTonightFilters)
 * but still needs to force a refetch on an unchanged filter set — the
 * page's "pick again" dice button bumps it for exactly that reason.
 */
export function useWatchTonightPicks(filters: WatchTonightFilters, seed = 0) {
  const profileId = useActiveProfileId();
  return useQuery<WatchTonightPicks>({
    queryKey: [
      ...queryKeys.local.watchTonight(profileId),
      filters.genreMovie,
      filters.genreSeries,
      Array.isArray(filters.provider) ? filters.provider.join(",") : filters.provider,
      filters.maxRuntime,
      filters.hideWatched,
      seed,
    ],
    queryFn: () => watchTonightService.pick(filters),
  });
}
