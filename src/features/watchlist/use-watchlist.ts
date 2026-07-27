import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { watchlistRepository } from "@/features/watchlist/watchlist-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import type { WatchlistItem } from "@/types/media";

export function useWatchlist() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.local.watchlist,
    queryFn: () => watchlistRepository.list(),
  });

  const add = useMutation({
    mutationFn: (item: WatchlistItem) => watchlistRepository.upsert(item),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.local.watchlist }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.history }),
      ]);
    },
  });

  const remove = useMutation({
    mutationFn: ({ mediaId, mediaType }: { mediaId: number; mediaType: WatchlistItem["mediaType"] }) =>
      watchlistRepository.remove(mediaId, mediaType),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.local.watchlist }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local.history }),
      ]);
    },
  });

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
