import { useQuery } from "@tanstack/react-query";
import { watchlistRepository } from "@/features/watchlist/watchlist-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import type { WatchlistItem } from "@/types/media";

export function useWatchlist() {
  const query = useQuery({
    queryKey: queryKeys.local.watchlist,
    queryFn: () => watchlistRepository.list(),
  });

  const add = useInvalidatingMutation(
    (item: WatchlistItem) => watchlistRepository.save(item),
    [queryKeys.local.watchlist, queryKeys.local.history]
  );

  const remove = useInvalidatingMutation(
    ({ mediaId, mediaType }: { mediaId: number; mediaType: WatchlistItem["mediaType"] }) =>
      watchlistRepository.remove(mediaId, mediaType),
    [queryKeys.local.watchlist, queryKeys.local.history]
  );

  return {
    ...query,
    addToWatchlist: add.mutateAsync,
    removeFromWatchlist: remove.mutateAsync,
    isMutating: add.isPending || remove.isPending,
  };
}

export function useIsInWatchlist(mediaId: number, mediaType: WatchlistItem["mediaType"]) {
  return useQuery({
    queryKey: [...queryKeys.local.watchlist, "has", mediaId, mediaType],
    queryFn: () => watchlistRepository.has(mediaId, mediaType),
  });
}
