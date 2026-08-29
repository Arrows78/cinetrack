import { useQuery } from "@tanstack/react-query";
import { smartListRepository } from "@/features/smart-lists/smart-list-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import type { SmartListRules } from "@/types/media";

export function useSmartLists() {
  const profileId = useActiveProfileId();
  const query = useQuery({
    queryKey: queryKeys.local.smartLists(profileId),
    queryFn: () => smartListRepository.list(),
  });
  const create = useInvalidatingMutation(
    ({ name, rules }: { name: string; rules: SmartListRules }) => smartListRepository.create(name, rules),
    [queryKeys.local.smartLists(profileId)]
  );
  const update = useInvalidatingMutation(
    ({ id, name, rules }: { id: string; name: string; rules: SmartListRules }) =>
      smartListRepository.update(id, name, rules),
    [queryKeys.local.smartLists(profileId)]
  );
  const remove = useInvalidatingMutation(
    (id: string) => smartListRepository.remove(id),
    [queryKeys.local.smartLists(profileId)]
  );
  return {
    ...query,
    create: create.mutateAsync,
    update: update.mutateAsync,
    remove: remove.mutateAsync,
    isSaving: create.isPending || update.isPending || remove.isPending,
  };
}
