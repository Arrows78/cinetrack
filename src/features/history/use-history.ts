import { useInfiniteQuery } from "@tanstack/react-query";
import { historyRepository, type HistoryCursor } from "@/features/history/history-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";

const PAGE_SIZE = 50;

export function useHistory() {
  const profileId = useActiveProfileId();
  return useInfiniteQuery({
    queryKey: queryKeys.local.history(profileId),
    queryFn: ({ pageParam }: { pageParam?: HistoryCursor }) => historyRepository.list(PAGE_SIZE, pageParam),
    initialPageParam: undefined as HistoryCursor | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      const last = lastPage[lastPage.length - 1]!;
      return { beforeTimestamp: last.timestamp, beforeId: last.id };
    },
  });
}
