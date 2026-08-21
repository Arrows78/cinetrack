import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import type { UserPreferences } from "@/types/media";

export function usePreferences() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.local.preferences,
    queryFn: () => preferencesRepository.getPreferences(),
  });

  type WritablePreferenceKey = Exclude<keyof UserPreferences, "activeProfileId">;

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: WritablePreferenceKey; value: UserPreferences[WritablePreferenceKey] }) =>
      preferencesRepository.updatePreference(key as never, value as never),
    onSuccess: async (data, variables) => {
      const previousProfileId = query.data?.activeProfileId;
      queryClient.setQueryData(queryKeys.local.preferences, data);

      if (variables.key === "language" || variables.key === "region") {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["remote"] }),
          queryClient.invalidateQueries({ queryKey: queryKeys.local.calendar(previousProfileId ?? DEFAULT_PROFILE_ID) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.local.tracking(previousProfileId ?? DEFAULT_PROFILE_ID) }),
        ]);
      }
    },
  });

  return {
    ...query,
    updatePreference: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}

/**
 * The active local profile's id, used to partition every profile-scoped
 * "local" query key (see the comment on queryKeys.local) — without this,
 * switching or removing profiles could read/render a different profile's
 * cached data before its own query key can be resolved and fetched.
 * Defaults to "default" while preferences are still loading/erroring,
 * matching the backend's own fallback (see current_profile_id in
 * src-tauri/src/database/mod.rs) so the very first render already keys
 * against the same profile the Rust side would resolve.
 */
export function useActiveProfileId(): string {
  const { data } = useQuery({
    queryKey: queryKeys.local.preferences,
    queryFn: () => preferencesRepository.getPreferences(),
  });
  return data?.activeProfileId ?? DEFAULT_PROFILE_ID;
}
