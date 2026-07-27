import { useQuery } from "@tanstack/react-query";
import { historyRepository } from "@/features/history/history-repository";
import { queryKeys } from "@/shared/constants/query-keys";

export function useHistory() {
  return useQuery({
    queryKey: queryKeys.local.history,
    queryFn: () => historyRepository.list(),
  });
}
