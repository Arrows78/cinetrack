import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import type { UserPreferences } from "@/types/media";

export function usePreferences() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.local.preferences,
    queryFn: () => preferencesRepository.getPreferences(),
  });

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: keyof UserPreferences; value: UserPreferences[keyof UserPreferences] }) =>
      preferencesRepository.updatePreference(key as never, value as never),
    onSuccess: async (data, variables) => {
      queryClient.setQueryData(queryKeys.local.preferences, data);

      if (variables.key === "activeProfileId") {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["local"] }),
          queryClient.invalidateQueries({ queryKey: queryKeys.local.watchTonight }),
        ]);
      }

      if (variables.key === "language" || variables.key === "region") {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["remote"] }),
          queryClient.invalidateQueries({ queryKey: queryKeys.local.calendar }),
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
