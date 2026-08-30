import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { libraryRepository } from "@/features/library/library-repository";
import { useLibraryMediaKeys } from "@/features/library/use-library";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
import { buildKeySetFromMediaKeys, filterAvailableItemsByKeySet } from "@/shared/utils/library-set";
import { useRecommendations } from "@/features/media/use-discovery";
import type { MediaSummary } from "@/types/media";

// Picks the strongest positive signal available in the user's library,
// falling back through weaker-but-still-real tiers instead of requiring the
// single strongest one — computed server-side (see
// get_best_recommendation_seed_impl in src-tauri/src/library/queries.rs)
// instead of a full library read reduced to one row in JS.
function useBestSeed() {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: queryKeys.local.bestRecommendationSeed(profileId),
    queryFn: () => libraryRepository.bestRecommendationSeed(),
  });
}

export function useBecauseYouLiked() {
  const seedQuery = useBestSeed();
  const seed = seedQuery.data ?? null;
  const mediaKeysQuery = useLibraryMediaKeys();
  const keySet = useMemo(() => buildKeySetFromMediaKeys(mediaKeysQuery.data ?? []), [mediaKeysQuery.data]);

  const recommendationsQuery = useRecommendations(seed?.mediaType ?? "movie", seed?.mediaId ?? Number.NaN);

  // Capped like the other "For You" rails — this is a serendipitous
  // suggestion, not a browsable catalogue page, so it shouldn't render
  // TMDB's full ~20-result page.
  const items = useMemo<MediaSummary[]>(() => {
    const results = recommendationsQuery.data?.results ?? [];
    return filterAvailableItemsByKeySet(results, keySet);
  }, [recommendationsQuery.data, keySet]);

  const isLoading = seedQuery.isLoading || (Boolean(seed) && recommendationsQuery.isLoading);

  return { seedTitle: seed?.title ?? null, items, isLoading };
}
