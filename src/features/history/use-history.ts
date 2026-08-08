import { useQuery } from "@tanstack/react-query";
import { historyRepository } from "@/features/history/history-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";

export function useHistory() {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: queryKeys.local.history(profileId),
    queryFn: () => historyRepository.list(),
  });
}
