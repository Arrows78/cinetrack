import { useQuery } from "@tanstack/react-query";
import { watchlistRepository } from "@/features/watchlist/watchlist-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import type { WatchlistItem } from "@/types/media";

export function useWatchlist() {
  const profileId = useActiveProfileId();
  const query = useQuery({
    queryKey: queryKeys.local.watchlist(profileId),
    queryFn: () => watchlistRepository.list(),
  });

  const add = useInvalidatingMutation(
    (item: WatchlistItem) => watchlistRepository.save(item),
    [queryKeys.local.watchlist(profileId), queryKeys.local.history(profileId)]
  );

  const remove = useInvalidatingMutation(
    ({ mediaId, mediaType }: { mediaId: number; mediaType: WatchlistItem["mediaType"] }) =>
      watchlistRepository.remove(mediaId, mediaType),
    [queryKeys.local.watchlist(profileId), queryKeys.local.history(profileId)]
  );

  return {
    ...query,
    addToWatchlist: add.mutateAsync,
    removeFromWatchlist: remove.mutateAsync,
    isMutating: add.isPending || remove.isPending,
  };
}

export function useIsInWatchlist(mediaId: number, mediaType: WatchlistItem["mediaType"]) {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: [...queryKeys.local.watchlist(profileId), "has", mediaId, mediaType],
    queryFn: () => watchlistRepository.has(mediaId, mediaType),
  });
}
