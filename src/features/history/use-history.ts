import { useInfiniteQuery } from "@tanstack/react-query";
import { historyRepository, type HistoryCursor, type HistoryFilters } from "@/features/history/history-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";

const PAGE_SIZE = 50;

export function useHistory(filters: HistoryFilters = {}) {
  const profileId = useActiveProfileId();
  return useInfiniteQuery({
    // Filters are part of the key, not just the queryFn's args — changing
    // them must start a fresh paginated feed (discarding pages fetched
    // under the old filters), not append onto it as if it were more of
    // the same list.
    queryKey: [...queryKeys.local.history(profileId), filters.search ?? "", filters.from ?? "", filters.to ?? ""],
    queryFn: ({ pageParam }: { pageParam?: HistoryCursor }) => historyRepository.list(PAGE_SIZE, pageParam, filters),
    initialPageParam: undefined as HistoryCursor | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      const last = lastPage[lastPage.length - 1]!;
      return { beforeTimestamp: last.timestamp, beforeId: last.id };
    },
  });
}
