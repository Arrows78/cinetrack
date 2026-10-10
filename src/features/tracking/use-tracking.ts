import { useQuery } from "@tanstack/react-query";
import { trackingService } from "@/features/tracking/tracking-service";
import { useActiveProfileId, usePreferences } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
import { STALE_30_MIN } from "@/shared/constants/query";

export function useTracking(options?: { enabled?: boolean }) {
  const profileId = useActiveProfileId();
  const preferences = usePreferences();
  const preferredProviderIds = preferences.data?.preferredProviderIds ?? [];
  return useQuery({
    // The feed bakes the provider selection in, so it belongs to the key:
    // otherwise a change of streaming services never refreshed it. Nested
    // under tracking() so every existing invalidation of that key still
    // reaches it.
    queryKey: [
      ...queryKeys.local.tracking(profileId),
      "feed",
      [...preferredProviderIds].sort((a, b) => a - b).join(","),
    ],
    queryFn: () => trackingService.build(60, preferredProviderIds),
    staleTime: STALE_30_MIN,
    // Wait for the preferences read to settle (success or failure) so the
    // first fetch never runs with a provisional empty provider selection.
    enabled: (options?.enabled ?? true) && !preferences.isPending,
  });
}
