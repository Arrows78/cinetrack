import { useQuery } from "@tanstack/react-query";
import { customListRepository } from "@/features/custom-lists/custom-list-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import type { MediaSummary } from "@/types/media";

export function useCustomLists() {
  const profileId = useActiveProfileId();
  const query = useQuery({
    queryKey: queryKeys.local.customLists(profileId),
    queryFn: () => customListRepository.list(),
  });
  const create = useInvalidatingMutation(
    ({ name, description }: { name: string; description?: string }) => customListRepository.create(name, description),
    [queryKeys.local.customLists(profileId)]
  );
  const remove = useInvalidatingMutation(
    (id: string) => customListRepository.remove(id),
    [queryKeys.local.customLists(profileId)]
  );
  return {
    ...query,
    create: create.mutateAsync,
    remove: remove.mutateAsync,
    isSaving: create.isPending || remove.isPending,
  };
}

export function useCustomListItems(listId: string) {
  const profileId = useActiveProfileId();
  const query = useQuery({
    queryKey: queryKeys.local.customList(profileId, listId),
    queryFn: () => customListRepository.items(listId),
    enabled: Boolean(listId),
  });
  const remove = useInvalidatingMutation(
    ({ mediaId, mediaType }: { mediaId: number; mediaType: "movie" | "series" }) =>
      customListRepository.removeItem(listId, mediaId, mediaType),
    [queryKeys.local.customList(profileId, listId)]
  );
  return { ...query, remove: remove.mutateAsync, isSaving: remove.isPending };
}

export function useAddToCustomList() {
  const profileId = useActiveProfileId();
  const mutation = useInvalidatingMutation(
    ({ listId, media }: { listId: string; media: MediaSummary }) => customListRepository.add(listId, media),
    (_data, variables) => [
      queryKeys.local.customList(profileId, variables.listId),
      queryKeys.local.customLists(profileId),
    ]
  );
  return { add: mutation.mutateAsync, isSaving: mutation.isPending };
}
