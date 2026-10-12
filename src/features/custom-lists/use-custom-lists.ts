import { useQuery } from "@tanstack/react-query";
import { customListRepository } from "@/features/custom-lists/custom-list-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import type { CustomListItem, MediaSummary } from "@/types/media";

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
    [queryKeys.local.customList(profileId, listId), queryKeys.local.customListsItems(profileId)]
  );
  return { ...query, remove: remove.mutateAsync, isSaving: remove.isPending };
}

// Every one of the profile's custom lists merged into one array (each item
// still carries its own `listId`, so a caller can narrow back to a single
// list when needed) — used by LibraryExplorer to surface list-only titles
// (added to a list but never given a library status) in the default
// "browse everything" view, not just while a specific list is selected. One
// read for all the lists, not one per list: a profile with a dozen lists paid
// a dozen IPC calls here on every page that mounts the explorer.
// `listIds` only tells it whether there is anything to read.
export function useAllCustomListItems(listIds: string[]) {
  const profileId = useActiveProfileId();
  const hasLists = listIds.length > 0;
  const query = useQuery({
    queryKey: queryKeys.local.customListsItems(profileId),
    queryFn: () => customListRepository.allItems(),
    enabled: hasLists,
  });
  if (!hasLists) return { data: [] as CustomListItem[], isLoading: false };
  return { data: query.data, isLoading: query.isLoading };
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
