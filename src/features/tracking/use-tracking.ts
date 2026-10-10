import { useQuery } from "@tanstack/react-query";
import { trackingService } from "@/features/tracking/tracking-service";
import { useActiveProfileId, usePreferences } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
import { STALE_30_MIN } from "@/shared/constants/query";

export function useTracking(options?: { enabled?: boolean }) {
  const profileId = useActiveProfileId();
  const preferredProviderIds = usePreferences().data?.preferredProviderIds ?? [];
  return useQuery({
    // The preferred providers are part of the key: they decide which alerts
    // count as available, so a change (or the preferences finishing loading
    // after the first render) must not keep serving the previous result.
    queryKey: [...queryKeys.local.tracking(profileId), "feed", preferredProviderIds] as const,
    queryFn: () => trackingService.build(60, preferredProviderIds),
    staleTime: STALE_30_MIN,
    enabled: options?.enabled ?? true,
  });
}
