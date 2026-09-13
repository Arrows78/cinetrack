import { useQueries, useQuery } from "@tanstack/react-query";
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
    [queryKeys.local.customList(profileId, listId)]
  );
  return { ...query, remove: remove.mutateAsync, isSaving: remove.isPending };
}

// Merges every one of the profile's custom lists into one array (each item
// still carries its own `listId`, so a caller can narrow back to a single
// list when needed) — used by LibraryExplorer to surface list-only titles
// (added to a list but never given a library status) in the default
// "browse everything" view, not just while a specific list is selected. One
// query per list rather than a new bulk backend endpoint, matching the
// pattern useNextEpisodes already uses for a dynamic set of per-item reads.
export function useAllCustomListItems(listIds: string[]) {
  const profileId = useActiveProfileId();
  const queries = useQueries({
    queries: listIds.map((listId) => ({
      queryKey: queryKeys.local.customList(profileId, listId),
      queryFn: () => customListRepository.items(listId),
    })),
  });
  const isLoading = queries.some((query) => query.isLoading);
  const data: CustomListItem[] | undefined = queries.some((query) => query.data === undefined)
    ? undefined
    : queries.flatMap((query) => query.data ?? []);
  return { data, isLoading };
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
