import { useQuery } from "@tanstack/react-query";
import { mediaRepository } from "@/features/media/media-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import { STALE_6_HOURS } from "@/shared/constants/query";

/** A TMDB collection rarely changes (new entries only when a new franchise instalment releases), so it's cached like watch-provider lists rather than refetched on every visit. */
export function useMovieCollection(collectionId: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.remote.collection(collectionId ?? Number.NaN),
    queryFn: () => mediaRepository.getCollection(collectionId as number),
    enabled: typeof collectionId === "number" && Number.isFinite(collectionId),
    staleTime: STALE_6_HOURS,
  });
}
