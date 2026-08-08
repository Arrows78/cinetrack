import { useQuery } from "@tanstack/react-query";
import { customListRepository } from "@/features/collections/custom-list-repository";
import { profileRepository } from "@/features/collections/profile-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import type { MediaSummary } from "@/types/media";

export function useProfiles() {
  const query = useQuery({ queryKey: queryKeys.local.profiles, queryFn: () => profileRepository.list() });
  const create = useInvalidatingMutation((name: string) => profileRepository.create(name), [queryKeys.local.profiles]);
  const remove = useInvalidatingMutation(
    (id: string) => profileRepository.remove(id),
    [["local"], queryKeys.local.watchTonight]
  );
  return {
    ...query,
    create: create.mutateAsync,
    remove: remove.mutateAsync,
    isSaving: create.isPending || remove.isPending,
  };
}

// Resolves which local profile the signed-in Supabase account should use —
// see profileRepository.resolveForSupabaseUser for the auto-claim rule.
// `null` (once loaded) means no profile exists yet for this account.
export function useProfileForSupabaseUser(supabaseUserId: string | undefined) {
  return useQuery({
    queryKey: ["local", "profileForUser", supabaseUserId],
    queryFn: () => profileRepository.resolveForSupabaseUser(supabaseUserId!),
    enabled: Boolean(supabaseUserId),
  });
}

export function useCreateProfileForSupabaseUser() {
  const mutation = useInvalidatingMutation(
    ({ name, supabaseUserId, avatar }: { name: string; supabaseUserId: string; avatar?: string | null }) =>
      profileRepository.createForSupabaseUser(name, supabaseUserId, avatar),
    [["local"]]
  );
  return { create: mutation.mutateAsync, isSaving: mutation.isPending, error: mutation.error };
}

export function useCustomLists() {
  const query = useQuery({ queryKey: queryKeys.local.customLists, queryFn: () => customListRepository.list() });
  const create = useInvalidatingMutation(
    ({ name, description }: { name: string; description?: string }) => customListRepository.create(name, description),
    [queryKeys.local.customLists]
  );
  const remove = useInvalidatingMutation(
    (id: string) => customListRepository.remove(id),
    [queryKeys.local.customLists]
  );
  return {
    ...query,
    create: create.mutateAsync,
    remove: remove.mutateAsync,
    isSaving: create.isPending || remove.isPending,
  };
}

export function useCustomListItems(listId: string) {
  const query = useQuery({
    queryKey: queryKeys.local.customList(listId),
    queryFn: () => customListRepository.items(listId),
    enabled: Boolean(listId),
  });
  const remove = useInvalidatingMutation(
    ({ mediaId, mediaType }: { mediaId: number; mediaType: "movie" | "series" }) =>
      customListRepository.removeItem(listId, mediaId, mediaType),
    [queryKeys.local.customList(listId)]
  );
  return { ...query, remove: remove.mutateAsync, isSaving: remove.isPending };
}

export function useAddToCustomList() {
  const mutation = useInvalidatingMutation(
    ({ listId, media }: { listId: string; media: MediaSummary }) => customListRepository.add(listId, media),
    (_data, variables) => [queryKeys.local.customList(variables.listId), queryKeys.local.customLists]
  );
  return { add: mutation.mutateAsync, isSaving: mutation.isPending };
}
