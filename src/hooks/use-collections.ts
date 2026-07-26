import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customListRepository } from "@/services/local/custom-list-repository";
import { profileRepository } from "@/services/local/profile-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import type { MediaSummary } from "@/types/media";

export function useProfiles() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.local.profiles, queryFn: () => profileRepository.list() });
  const create = useMutation({ mutationFn: (name: string) => profileRepository.create(name), onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.local.profiles }) });
  const remove = useMutation({ mutationFn: (id: string) => profileRepository.remove(id), onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.local.profiles }) });
  return { ...query, create: create.mutateAsync, remove: remove.mutateAsync, isSaving: create.isPending || remove.isPending };
}

export function useCustomLists() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.local.customLists, queryFn: () => customListRepository.list() });
  const create = useMutation({ mutationFn: ({ name, description }: { name: string; description?: string }) => customListRepository.create(name, description), onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.local.customLists }) });
  const remove = useMutation({ mutationFn: (id: string) => customListRepository.remove(id), onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.local.customLists }) });
  return { ...query, create: create.mutateAsync, remove: remove.mutateAsync, isSaving: create.isPending || remove.isPending };
}

export function useCustomListItems(listId: string) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.local.customList(listId), queryFn: () => customListRepository.items(listId), enabled: Boolean(listId) });
  const remove = useMutation({ mutationFn: ({ mediaId, mediaType }: { mediaId: number; mediaType: "movie" | "series" }) => customListRepository.removeItem(listId, mediaId, mediaType), onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.local.customList(listId) }) });
  return { ...query, remove: remove.mutateAsync, isSaving: remove.isPending };
}

export function useAddToCustomList() {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ listId, media }: { listId: string; media: MediaSummary }) => customListRepository.add(listId, media),
    onSuccess: (_data, variables) => Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.local.customList(variables.listId) }),
      client.invalidateQueries({ queryKey: queryKeys.local.customLists }),
    ]),
  });
  return { add: mutation.mutateAsync, isSaving: mutation.isPending };
}
