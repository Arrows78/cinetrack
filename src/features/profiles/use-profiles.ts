import { useQuery } from "@tanstack/react-query";
import { profileRepository } from "@/features/profiles/profile-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";

export function useProfiles() {
  const query = useQuery({ queryKey: queryKeys.local.profiles, queryFn: () => profileRepository.list() });
  const create = useInvalidatingMutation((name: string) => profileRepository.create(name), [queryKeys.local.profiles]);
  // Removing a profile can also reset activeProfileId (see
  // profileRepository.remove) — ["local"] alone already covers every
  // profile-scoped key regardless of which profile it's keyed under, so
  // there's no separate watchTonight key to list here.
  const remove = useInvalidatingMutation((id: string) => profileRepository.remove(id), [["local"]]);
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
