import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { profileRepository } from "@/features/profiles/profile-repository";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import { toast } from "@/components/ui/use-toast";

export function useProfiles() {
  const query = useQuery({ queryKey: queryKeys.local.profiles, queryFn: () => profileRepository.list() });
  const create = useInvalidatingMutation(
    ({ name, avatar }: { name: string; avatar?: string | null }) => profileRepository.create(name, avatar),
    [queryKeys.local.profiles]
  );
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

/**
 * Switches the app's active local profile — the exact logic ProfilesCard
 * (settings-page.tsx) and ProfileSwitcher (profile-switcher.tsx) each used
 * to hand-duplicate. Only ever offered when auth isn't required (see either
 * caller's own comment on that security-critical branch): `set_active_profile`
 * itself also refuses to switch into a profile linked to a Supabase account
 * without proof of that account, so this stays safe even if a caller's UI
 * gate were somehow bypassed. `onSwitched` is optional so a caller with no
 * extra step to take on success (ProfilesCard) doesn't need to pass one.
 */
export function useProfileSwitching(onSwitched?: () => void) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [switchingProfileId, setSwitchingProfileId] = useState<string | null>(null);

  const switchToProfile = async (profileId: string) => {
    setSwitchingProfileId(profileId);
    try {
      await preferencesRepository.setActiveProfile(profileId);
      queryClient.removeQueries({ queryKey: ["local"] });
      onSwitched?.();
    } catch {
      toast({ description: t("settings.profiles.switchFailed"), variant: "error" });
    } finally {
      setSwitchingProfileId(null);
    }
  };

  return { switchingProfileId, switchToProfile };
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
